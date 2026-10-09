create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum ('New', 'Emailed', 'Contacted', 'Closed');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_delivery_status') then
    create type public.email_delivery_status as enum ('Queued', 'Sent', 'Failed');
  end if;
end $$;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  email varchar(255) not null,
  source varchar(100),
  message text,
  status public.lead_status not null default 'New',
  last_contacted_at timestamptz,
  likely_score smallint check (likely_score between 0 and 100),
  likely_score_reason text,
  created_at timestamptz not null default now(),
  constraint leads_email_unique unique (email)
);

-- Keep the score columns available when applying this script to an existing database.
alter table public.leads add column if not exists likely_score smallint;
alter table public.leads add column if not exists likely_score_reason text;

create table if not exists public.lead_email_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  delivery_status public.email_delivery_status not null default 'Queued',
  recipient varchar(255) not null,
  subject varchar(255) not null,
  body text,
  message_id text,
  error_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.lead_email_events add column if not exists body text;

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_status_created_at_idx on public.leads (status, created_at desc);
create index if not exists lead_email_events_lead_id_idx on public.lead_email_events (lead_id);
create index if not exists lead_email_events_lead_sent_at_idx
  on public.lead_email_events (lead_id, sent_at desc);

create table if not exists public.crm_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role varchar(20) not null default 'member'
    check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_profiles enable row level security;

drop policy if exists "Users can read their own CRM profile" on public.crm_profiles;

create policy "Users can read their own CRM profile"
  on public.crm_profiles
  for select
  using (auth.uid() = id);

-- The backend service-role client manages administrator assignments.
-- Public clients receive no insert, update, or delete policies.
create or replace function public.create_crm_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.crm_profiles (id, role)
  values (new.id, 'member')
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_crm_profile() from public;

drop trigger if exists on_auth_user_created on public.auth.users;

create trigger on_auth_user_created
after insert on public.auth.users
for each row execute function public.create_crm_profile();

-- Returns the lead and whether this request inserted a new record.
-- The unique-violation path keeps concurrent webhook deliveries idempotent.
create or replace function public.upsert_lead(
  p_name varchar(255),
  p_email varchar(255),
  p_source varchar(100),
  p_message text
)
returns table (lead public.leads, is_new boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_lead public.leads;
  v_constraint_name text;
begin
  select id into v_existing_id
  from public.leads
  where email = p_email
  for update;

  if found then
    update public.leads
    set name = p_name,
        source = p_source,
        message = p_message
    where id = v_existing_id
    returning public.leads.* into v_lead;

    return query select v_lead, false;
    return;
  end if;

  begin
    insert into public.leads (name, email, source, message, status)
    values (p_name, p_email, p_source, p_message, 'New')
    returning public.leads.* into v_lead;

    return query select v_lead, true;
    return;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = pg_exception_constraint;

      if v_constraint_name <> 'leads_email_unique' then
        raise;
      end if;

      select id into v_existing_id
      from public.leads
      where email = p_email
      for update;

      update public.leads
      set name = p_name,
          source = p_source,
          message = p_message
      where id = v_existing_id
      returning public.leads.* into v_lead;

      return query select v_lead, false;
      return;
  end;
end;
$$;

create or replace function public.transition_lead_status(
  p_lead_id uuid,
  p_status public.lead_status
)
returns public.leads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_status public.lead_status;
  v_lead public.leads;
begin
  select status
  into v_current_status
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    return null;
  end if;

  if p_status = v_current_status then
    select public.leads.*
    into v_lead
    from public.leads
    where id = p_lead_id;

    return v_lead;
  end if;

  if v_current_status = 'Closed' then
    return null;
  end if;

  if p_status = 'Contacted' and v_current_status not in ('New', 'Emailed') then
    return null;
  end if;

  if p_status = 'Closed' and v_current_status not in ('New', 'Emailed', 'Contacted') then
    return null;
  end if;

  if p_status not in ('Contacted', 'Closed') then
    return null;
  end if;

  update public.leads
  set status = p_status,
      last_contacted_at = case
        when p_status = 'Contacted' then now()
        else last_contacted_at
      end
  where id = p_lead_id
  returning public.leads.* into v_lead;

  return v_lead;
end;
$$;

-- AI intelligence metadata and communication-safety state.
alter table public.leads add column if not exists likely_score_generated_at timestamptz;
alter table public.leads add column if not exists likely_score_model varchar(255);
alter table public.leads add column if not exists ai_summary text;
alter table public.leads add column if not exists ai_summary_generated_at timestamptz;
alter table public.leads add column if not exists ai_summary_model varchar(255);
alter table public.leads add column if not exists email_suppressed boolean not null default false;
alter table public.leads add column if not exists email_suppressed_at timestamptz;

create index if not exists leads_likely_score_idx
  on public.leads (likely_score desc nulls last, created_at desc);

create table if not exists public.inbound_email_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  provider varchar(50) not null default 'sendgrid',
  provider_message_id text not null,
  message_id text,
  in_reply_to text,
  from_email varchar(255) not null,
  from_name varchar(255),
  to_email varchar(255) not null,
  subject varchar(500) not null default '',
  body_text text not null,
  raw_headers jsonb not null default '{}'::jsonb,
  dkim_status varchar(50),
  spf_status varchar(50),
  received_at timestamptz not null,
  classification_status varchar(20) not null default 'Pending'
    check (classification_status in ('Pending', 'Processing', 'Completed', 'Failed')),
  classification_category varchar(50),
  classification_sentiment varchar(50),
  classification_summary text,
  classification_confidence numeric(4, 3),
  classification_recommended_action text,
  classification_requires_review boolean not null default false,
  classification_suppresses_email boolean not null default false,
  classification_error text,
  classified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inbound_provider_message_unique unique (provider, provider_message_id)
);

create index if not exists inbound_messages_lead_received_idx
  on public.inbound_email_messages (lead_id, received_at desc);
create index if not exists inbound_messages_classification_idx
  on public.inbound_email_messages (classification_status, received_at);

create table if not exists public.follow_up_sequences (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  status varchar(20) not null default 'Draft'
    check (status in ('Draft', 'Active', 'Paused', 'Completed', 'Cancelled')),
  current_step integer not null default 0 check (current_step between 0 and 20),
  next_action_at timestamptz,
  pause_reason text,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists follow_up_sequences_lead_idx
  on public.follow_up_sequences (lead_id, created_at desc);
create index if not exists follow_up_sequences_active_idx
  on public.follow_up_sequences (status, next_action_at);

create table if not exists public.follow_up_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.follow_up_sequences(id) on delete cascade,
  step_number integer not null check (step_number between 1 and 20),
  delay_hours integer not null check (delay_hours between 1 and 720),
  subject varchar(255) not null,
  body text not null,
  status varchar(20) not null default 'Draft'
    check (status in ('Draft', 'Scheduled', 'Processing', 'Sent', 'Failed', 'Skipped', 'Cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  email_event_id uuid,
  attempt_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_steps_order_unique unique (sequence_id, step_number)
);

create index if not exists follow_up_steps_due_idx
  on public.follow_up_steps (status, scheduled_at);

alter table public.lead_email_events add column if not exists sequence_step_id uuid;
alter table public.lead_email_events add column if not exists idempotency_key varchar(255);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lead_email_events_sequence_step_id_key'
  ) then
    alter table public.lead_email_events
      add constraint lead_email_events_sequence_step_id_key
      unique (sequence_step_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'lead_email_events_idempotency_key_key'
  ) then
    alter table public.lead_email_events
      add constraint lead_email_events_idempotency_key_key
      unique (idempotency_key);
  end if;
end $$;

create index if not exists lead_email_events_idempotency_idx
  on public.lead_email_events (idempotency_key);

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type varchar(50) not null
    check (job_type in ('LeadScore', 'InboundClassification', 'FollowUpSend')),
  entity_id uuid not null,
  dedupe_key varchar(255) not null unique,
  status varchar(20) not null default 'Pending'
    check (status in ('Pending', 'Running', 'Completed', 'Failed')),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  lease_owner varchar(255),
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists background_jobs_due_idx
  on public.background_jobs (status, run_at);
create index if not exists background_jobs_lease_idx
  on public.background_jobs (status, lease_expires_at);

-- Atomic SendGrid ingestion. Matching is case-insensitive and provider retries are idempotent.
create or replace function public.record_inbound_message(
  p_provider text,
  p_provider_message_id text,
  p_message_id text,
  p_in_reply_to text,
  p_from_email text,
  p_from_name text,
  p_to_email text,
  p_subject text,
  p_body_text text,
  p_raw_headers jsonb,
  p_dkim_status text,
  p_spf_status text,
  p_received_at timestamptz,
  p_lead_id uuid
)
returns table (message_id uuid, lead_id uuid, is_new_lead boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.inbound_email_messages;
  v_message_id uuid;
  v_lead_id uuid;
begin
  select * into v_existing
  from public.inbound_email_messages
  where provider = p_provider and provider_message_id = p_provider_message_id;

  if found then
    return query select v_existing.id, v_existing.lead_id, false;
    return;
  end if;

  insert into public.inbound_email_messages (
    provider, provider_message_id, message_id, in_reply_to, from_email,
    from_name, to_email, subject, body_text, raw_headers, dkim_status,
    spf_status, received_at, lead_id
  ) values (
    p_provider, p_provider_message_id, nullif(p_message_id, ''), nullif(p_in_reply_to, ''),
    lower(trim(p_from_email)), nullif(trim(p_from_name), ''), lower(trim(p_to_email)),
    coalesce(p_subject, ''), p_body_text, coalesce(p_raw_headers, '{}'::jsonb),
    nullif(p_dkim_status, ''), nullif(p_spf_status, ''), p_received_at, p_lead_id
  )
  on conflict (provider, provider_message_id) do nothing
  returning id, inbound_email_messages.lead_id into v_message_id, v_lead_id;

  if v_message_id is null then
    select id, inbound_email_messages.lead_id
    into v_message_id, v_lead_id
    from public.inbound_email_messages
    where provider = p_provider and provider_message_id = p_provider_message_id;
  end if;

  if p_lead_id is not null then
    update public.leads
    set status = case when status != 'Closed' then 'Contacted'::public.lead_status else status end,
        last_contacted_at = p_received_at
    where id = p_lead_id;

    update public.follow_up_sequences
    set status = 'Paused', pause_reason = 'Inbound reply received', paused_at = now(), next_action_at = null, updated_at = now()
    where lead_id = p_lead_id and status = 'Active';

    insert into public.background_jobs (job_type, entity_id, dedupe_key, payload)
    values (
      'InboundClassification', v_message_id,
      'inbound-classify:' || v_message_id::text,
      jsonb_build_object('leadId', p_lead_id)
    ) on conflict (dedupe_key) do update
      set status = case
        when public.background_jobs.status = 'Completed' then 'Completed'
        else 'Pending'
      end,
      run_at = case
        when public.background_jobs.status = 'Completed' then public.background_jobs.run_at
        else now()
      end,
      last_error = case
        when public.background_jobs.status = 'Completed' then public.background_jobs.last_error
        else null
      end,
      updated_at = now();

    insert into public.background_jobs (job_type, entity_id, dedupe_key, payload)
    values (
      'LeadScore', p_lead_id,
      'lead-score:' || p_lead_id::text || ':' || v_message_id::text,
      jsonb_build_object('reason', 'inbound_reply')
    ) on conflict (dedupe_key) do nothing;
  end if;

  return query select v_message_id, v_lead_id, false;
end;
$$;

-- Claims run independently in every API instance. Expired leases are recoverable.
create or replace function public.claim_background_jobs(
  p_worker_id text,
  p_limit integer,
  p_lease_seconds integer
)
returns setof public.background_jobs
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select id
    from public.background_jobs
    where (
      status = 'Pending' and run_at <= now()
    ) or (
      status = 'Running' and lease_expires_at < now()
    )
    order by run_at, created_at
    for update skip locked
    limit greatest(1, least(p_limit, 20))
  )
  update public.background_jobs as job
  set status = 'Running',
      lease_owner = p_worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 900))),
      attempt_count = job.attempt_count + 1,
      updated_at = now()
  from candidates
  where job.id = candidates.id
  returning job.*;
$$;

create or replace function public.finish_background_job(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_error text default null,
  p_retry_at timestamptz default null
)
returns public.background_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.background_jobs;
begin
  update public.background_jobs
  set status = p_status,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(coalesce(p_error, ''), 2000),
      run_at = coalesce(p_retry_at, run_at),
      completed_at = case when p_status in ('Completed', 'Failed') then now() else null end,
      updated_at = now()
  where id = p_job_id
    and status = 'Running'
    and lease_owner = p_worker_id
  returning * into v_job;

  return v_job;
end;
$$;

alter table public.inbound_email_messages enable row level security;
alter table public.follow_up_sequences enable row level security;
alter table public.follow_up_steps enable row level security;
alter table public.background_jobs enable row level security;
alter table public.leads enable row level security;
alter table public.lead_email_events enable row level security;

-- No anonymous policies are granted. The backend uses its service-role key.
