# FlowDesk — AI CRM

An AI-powered lead-to-close pipeline. Captures leads from a signed webhook or manual entry, scores them with an LLM, ingents inbound replies through SendGrid Inbound Parse, classifies intent, and runs approved 2/7/14-day follow-up sequences — all driven by a durable background worker.

Built with **Express 5**, **Supabase (Postgres)**, **Nodemailer**, **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [SendGrid Inbound Parse](#sendgrid-inbound-parse)
- [AI Automation](#ai-automation)
- [Running Locally](#running-locally)
- [API Reference](#api-reference)
- [Webhook Signature](#webhook-signature)
- [Security](#security)
- [Deployment](#deployment)
- [Known Limitations](#known-limitations)

---

## Features

### Lead management

- Signed webhook intake at `POST /api/webhooks/leads` with HMAC-SHA256 verification and Joi validation
- Idempotent lead creation — repeat submissions for the same email update the existing record instead of duplicating it
- Manual lead creation from the dashboard
- Four-stage pipeline: `New → Emailed → Contacted → Closed`, enforced server-side by a transition RPC
- Search, filtering, and sorting across contacts
- Email suppression with explicit admin reactivation

### Dashboard

Five views behind a collapsible sidebar:

| View | Contents |
| --- | --- |
| **Overview** | KPI cards, top-scored leads, AI triage queue, live activity feed |
| **Leads** | Full sortable table with client-side search and stage filter |
| **Pipeline** | Four-column kanban grouped by sales stage |
| **AI Automations** | Scoring coverage, overdue follow-ups, pending scores, suppressed contacts, top AI picks |
| **Contact Records** | Alphabetized directory of people and companies |

Also included:

- **⌘/Ctrl + K** command palette with full keyboard navigation (`↑`/`↓`/`Enter`/`Esc`)
- Live metrics: active leads, conversion rate, AI response rate, average score
- Derived notification drawer with per-item dismiss and clear-all, persisted across reloads
- Dark mode via class strategy, honouring system preference with no flash of incorrect theme
- Responsive off-canvas navigation for mobile
- 5-second lead sync that pauses when the tab is hidden and resumes on `visibilitychange`

### AI automation

- **Lead scoring** — background job assigns a `0–100` likelihood score with a written rationale and the model that produced it
- **Priority buckets** — `High 75–100`, `Medium 50–74`, `Low 0–49`, `Unscored` for pending
- **Lead briefings** — on-demand summaries split into confirmed facts, remaining unknowns, and a recommended next step
- **Inbound classification** — every reply is categorized (positive sales interest, question/support, negative/unsubscribe, out of office, meeting request) with sentiment, confidence, and DKIM/SPF results surfaced
- **Follow-up sequences** — AI drafts three emails scheduled at 48h / 168h / 336h (2, 7, 14 days), each editable before approval
- **Draft email generation** — intent, sentiment, key topics, and priority for any lead, with send/edit/regenerate controls

### Email and messaging

- Welcome email on lead creation, delivered through a retrying queue
- Full outbound history with `Queued` / `Sent` / `Failed` delivery states
- Unified inbound + outbound conversation view per lead
- Any inbound reply automatically pauses that lead's active follow-up sequences
- Unsubscribe / do-not-contact classification suppresses all future email until an admin reactivates the contact

### Platform

- Durable background worker using Postgres leases — safe to run across multiple backend instances
- Rate limiting on three tiers: standard, webhook, and AI
- Helmet security headers, CORS restricted to exact origins, Joi validation on every route
- Row Level Security enabled on all tables

---

## Architecture

```text
              ┌──────────────────────┐
  Leads  ───▶ │  POST /api/leads     │ ──▶ leads table ──▶ email queue ──▶ SMTP
  (form)      └──────────────────────┘                          │
              ┌──────────────────────┐                            ▼
  Webhook ──▶ │/api/webhooks/leads   │                      lead_email_events
  (HMAC)      └──────────────────────┘
                                                                   │
              ┌──────────────────────┐                            │
  Inbound ──▶ │/api/webhooks/        │ ◀── SendGrid Inbound Parse  │
  (email)     │  inbound-email       │                            │
              └──────────┬───────────┘                            │
                         │                                        │
                         ▼                                        │
              inbound_email_messages                              │
                         │                                        │
                         ▼                                        │
              ┌──────────────────────┐                            │
              │   Background Worker  │ ◀──────────────────────────┘
              │  (poll + lease)      │
              └──────────┬───────────┘
                         ▼
              OpenAI-compatible API
              (scoring · summaries · drafts · classification)
```

The worker polls `background_jobs` on an interval, claims rows with a lease RPC so multiple instances never process the same job, and finishes each job with a success or bounded-retry outcome. Follow-up email delivery is scheduled rather than request-driven, which is why the backend must run continuously.

---

## Project Structure

```text
.
├── client/                     # React 19 + TypeScript + Vite + Tailwind
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx             # View routing for the 5 dashboard sections
│       ├── api/client.ts       # Axios instance, auth interceptor, typed calls
│       ├── components/
│       │   ├── ui/             # Dashboard shell, metrics, table, feed, search
│       │   ├── AuthGate.tsx
│       │   ├── LeadDetails.tsx
│       │   ├── FollowUpSequencePanel.tsx
│       │   ├── EmailHistory.tsx
│       │   └── NewLeadDialog.tsx
│       ├── context/            # Auth + lead state
│       ├── lib/                # formatting, class merging, supabase client
│       └── types/lead.ts
│
├── server/                     # Express 5 API + background worker
│   ├── .env.example
│   ├── server.js               # App wiring, worker boot, graceful shutdown
│   ├── supabase.sql            # Idempotent schema, enums, indexes, RPCs
│   ├── package.json
│   └── src/
│       ├── config/env.js       # Validated, frozen environment object
│       ├── controllers/
│       ├── db/supabase.js
│       ├── errors/
│       ├── middleware/         # auth, validation, rate limits, signatures
│       ├── routes/
│       └── services/           # leads, email, AI, inbound, sequences, worker
│
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Node.js 20 or newer**
- A **Supabase** project
- SMTP credentials — SendGrid, Gmail app password, or any other provider
- Optional: an OpenAI-compatible API key for AI features

---

## Setup

### 1. Install dependencies

```powershell
cd server
npm install
cd ../client
npm install
```

### 2. Apply the Supabase schema

Open the Supabase SQL editor and run the complete `server/supabase.sql` script. It is idempotent, so re-running it is safe.

This creates:

**Tables** — `leads`, `lead_email_events`, `crm_profiles`, `inbound_email_messages`, `follow_up_sequences`, `follow_up_steps`, `background_jobs`

**Enums** — `lead_status` (`New`, `Emailed`, `Contacted`, `Closed`), `email_delivery_status` (`Queued`, `Sent`, `Failed`)

**Functions** — `create_crm_profile`, `upsert_lead`, `transition_lead_status`, `record_inbound_message`, `claim_background_jobs`, `finish_background_job`

Row Level Security is enabled on every table. The backend connects with the service-role key and bypasses RLS; no anonymous read policies are granted. `crm_profiles` has one policy allowing a user to read their own profile.

> The worker depends on `background_jobs` and the claim/finish RPCs. Do not omit them.

### 3. Configure the backend

```powershell
cd server
Copy-Item .env.example .env
```

Required — the server refuses to boot without these:

```env
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
EMAIL_USER=YOUR-SMTP_USERNAME
EMAIL_PASS=YOUR-SMTP-PASSWORD
EMAIL_FROM=noreply@example.com
WEBHOOK_SECRET=generate-a-long-random-secret
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

`CORS_ORIGIN` accepts a comma-separated list of exact origins. Wildcards (`*`) and paths are rejected at startup.

Optional tuning — see `server/.env.example` for the full list:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | API port |
| `EMAIL_HOST` / `EMAIL_PORT` | `smtp.sendgrid.net` / `587` | SMTP endpoint |
| `EMAIL_FROM_NAME` | `AI CRM` | Sender display name |
| `EMAIL_QUEUE_CONCURRENCY` | `2` | Concurrent welcome-email sends |
| `EMAIL_QUEUE_RETRIES` | `3` | Retry attempts per email |
| `SENDGRID_INBOUND_TOKEN` | *(unset)* | Private inbound webhook token; inbound returns 503 when unset |
| `INBOUND_EMAIL_MAX_BODY_LENGTH` | `100000` | Reject oversized inbound bodies |
| `WORKER_POLL_INTERVAL_MS` | `15000` | Background worker poll cadence |
| `WORKER_LEASE_SECONDS` | `120` | Job lease duration |
| `WORKER_CONCURRENCY` | `2` | Parallel job execution (max 20) |
| `WEBHOOK_MAX_AGE_MS` | `300000` | Signature timestamp tolerance |
| `AI_ENABLED` | `false` | Master switch for AI features |
| `OPENAI_API_KEY` | *(unset)* | Required when `AI_ENABLED=true` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Any OpenAI-compatible endpoint |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used for all AI calls |
| `AI_TIMEOUT_MS` | `20000` | Per-request AI timeout |
| `RATE_LIMIT_STANDARD` | `120` | Requests/min per tier |
| `RATE_LIMIT_WEBHOOK` | `60` | Requests/min per tier |
| `RATE_LIMIT_AI` | `20` | Requests/min per tier |

**SendGrid:** `EMAIL_USER=apikey`, `EMAIL_PASS=<your SendGrid API key>`, and `EMAIL_FROM` must be a verified sender identity.

**Gmail:** use an [app password](https://support.google.com/accounts/answer/185833), not your account password.

### 4. Configure the frontend

```powershell
cd client
Copy-Item .env.example .env
```

```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY
```

The frontend uses the **anon** key only. The service-role key never reaches the browser.

### 5. Create the first administrator

Sign-in is invite-only — the app does not create users.

1. In Supabase, go to **Authentication → Users** and invite or create the first user.
2. Copy the user's UUID.
3. In the SQL editor:

```sql
update public.crm_profiles
set role = 'admin', updated_at = now()
where id = '<USER_UUID>';
```

Every `/api/leads` route requires a Supabase bearer token whose profile role is `admin`. Also add your frontend and backend URLs to the Supabase **Authentication → URL Configuration** allowed redirect list.

---

## SendGrid Inbound Parse

1. Create a dedicated receiving subdomain, e.g. `parse.example.com`, and point its MX record to `mx.sendgrid.net` with priority `10`.
2. In SendGrid, configure **Inbound Parse** to POST multipart form data to:
   ```
   https://your-api.example.com/api/webhooks/inbound-email?token=<SENDGRID_INBOUND_TOKEN>
   ```
3. Prefer a receiving subdomain different from your authenticated sending domain, and review SendGrid's DNS-loop guidance.

The receiver stores message bodies and headers, ignores attachment content, matches senders to existing leads, and creates a lead for unknown senders **without** triggering the welcome email. Replies arriving more than once are deduplicated by `Message-ID`.

Set `SENDGRID_INBOUND_TOKEN` to a long random string. Until it is set, the endpoint responds `503`.

---

## AI Automation

**Scoring.** New leads and inbound replies are queued for background scoring. The dashboard buckets scores as `High 75–100`, `Medium 50–74`, `Low 0–49`, with `Unscored` for anything the worker has not processed yet.

**Briefings.** Lead briefings are generated on demand from the current conversation and split into confirmed facts, unknowns, and a recommended next action.

**Sequences.** Three drafts at 2, 7, and 14 days. Every draft is editable while the sequence is in `Draft`; approval is required before anything sends. Sequences can then be paused, resumed, or cancelled. Deleting requires a two-step confirmation.

**Automatic pausing.** Any inbound reply pauses that lead's active sequences. Unsubscribe / do-not-contact classification additionally suppresses all future email until an administrator explicitly reactivates the contact.

**Failure handling.** AI responses are validated against a Joi schema before use; malformed output is rejected rather than persisted. Failed jobs are retained for a bounded number of retries.

**Disabling AI.** Set `AI_ENABLED=false` (the default). The dashboard, pipeline, email history, and inbound ingestion all continue to work without a model.

---

## Running Locally

Start the backend — the background worker boots automatically with it:

```powershell
cd server
npm run dev
```

Validate backend syntax across every module:

```powershell
npm run check
```

In a second terminal, start the frontend:

```powershell
cd client
npm run dev
```

Type-check and build for production:

```powershell
npm run test     # tsc -b
npm run build    # tsc -b && vite build
```

| Service | URL |
| --- | --- |
| API | `http://localhost:3001` |
| Dashboard | `http://localhost:5173` |
| Health check | `http://localhost:3001/health` |

`GET /health` is unauthenticated and reports `ok` / `degraded` based on database reachability — use it as a container or platform health probe.

---

## API Reference

Base path: `/api`. All `/api/leads` routes require `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` for a user whose `crm_profiles.role` is `admin`.

### Public

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | None | Liveness + database check |
| `POST` | `/api/webhooks/leads` | HMAC signature | Create or update a lead |
| `POST` | `/api/webhooks/inbound-email?token=…` | Query token | SendGrid Inbound Parse receiver |

### Leads

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/leads` | Create a lead (admin session) |
| `GET` | `/api/leads` | List leads — `page`, `limit` (max 100), `status`, `priority`, `needsFollowUp` |
| `GET` | `/api/leads/:leadId` | Single lead |
| `PATCH` | `/api/leads/:leadId/status` | Advance the pipeline stage |
| `GET` | `/api/leads/:leadId/emails` | Outbound email history |
| `POST` | `/api/leads/:leadId/emails/send` | Send an email to the lead |
| `GET` | `/api/leads/:leadId/conversation` | Unified inbound + outbound thread |
| `POST` | `/api/leads/:leadId/reactivate-email` | Lift email suppression |

### AI

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/leads/:leadId/ai/analyze` | Score, intent, sentiment, and a draft follow-up |
| `POST` | `/api/leads/:leadId/ai/summary` | Generate a lead briefing |
| `POST` | `/api/leads/:leadId/follow-up-sequences/generate` | Generate a 3-step sequence |
| `GET` | `/api/leads/:leadId/follow-up-sequences` | List a lead's sequences |
| `POST` | `/api/leads/inbound-messages/:messageId/classify/retry` | Retry a failed classification |

### Follow-up sequences

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/leads/follow-up-sequences/:sequenceId` | Full sequence with steps |
| `PATCH` | `/api/leads/follow-up-sequences/:sequenceId/steps/:stepId` | Edit a draft step |
| `POST` | `/api/leads/follow-up-sequences/:sequenceId/approve` | `Draft` → `Active` |
| `POST` | `/api/leads/follow-up-sequences/:sequenceId/pause` | → `Paused` |
| `POST` | `/api/leads/follow-up-sequences/:sequenceId/resume` | → `Active` |
| `POST` | `/api/leads/follow-up-sequences/:sequenceId/cancel` | → `Cancelled` |
| `DELETE` | `/api/leads/follow-up-sequences/:sequenceId` | Delete sequence and pending steps |

### Examples

Create a lead:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/api/leads" `
  -Method Post `
  -ContentType "application/json" `
  -Headers @{ Authorization = "Bearer <SUPABASE_ACCESS_TOKEN>" } `
  -Body (@{
    name = "Jane Cooper"
    email = "jane@example.com"
    source = "Website"
    message = "I would like more information."
  } | ConvertTo-Json)
```

Filter the queue:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/api/leads?page=1&limit=100&priority=High&needsFollowUp=true" `
  -Headers @{ Authorization = "Bearer <SUPABASE_ACCESS_TOKEN>" }
```

Generate and approve a follow-up sequence:

```powershell
Invoke-RestMethod `
  -Uri "http://localhost:3001/api/leads/<LEAD_ID>/follow-up-sequences/generate" `
  -Method Post `
  -Headers @{ Authorization = "Bearer <SUPABASE_ACCESS_TOKEN>" }

Invoke-RestMethod `
  -Uri "http://localhost:3001/api/leads/follow-up-sequences/<SEQUENCE_ID>/approve" `
  -Method Post `
  -Headers @{ Authorization = "Bearer <SUPABASE_ACCESS_TOKEN>" }
```

Simulate an inbound reply:

```powershell
curl.exe -X POST "http://localhost:3001/api/webhooks/inbound-email?token=<SENDGRID_INBOUND_TOKEN>" `
  -F "from=Jane Cooper <jane@example.com>" `
  -F "to=hello@parse.example.com" `
  -F "subject=I would like a demo" `
  -F "text=Please send me pricing and demo availability." `
  -F "headers=Message-ID: <inbound-test-001@example.com>"
```

---

## Webhook Signature

`POST /api/webhooks/leads` requires two headers:

| Header | Value |
| --- | --- |
| `x-webhook-timestamp` | Unix timestamp in **milliseconds** |
| `x-webhook-signature` | Lowercase hex HMAC-SHA256 |

The signature is computed over the timestamp, a literal `.`, then the **raw** request body:

```text
signature = HMAC_SHA256(secret, "<timestamp>." + rawBody)
```

Requests are rejected when the timestamp is missing, non-integer, or older than `WEBHOOK_MAX_AGE_MS` (default 5 minutes). Comparison uses `timingSafeEqual`. The raw body is captured before the JSON parser runs, so sign the exact bytes you send.

```js
import crypto from "node:crypto";

const timestamp = Date.now().toString();
const signature = crypto
  .createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(`${timestamp}.`)
  .update(rawBody)
  .digest("hex");

await fetch("https://your-api.example.com/api/webhooks/leads", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": signature,
  },
  body: rawBody,
});
```

---

## Security

- **Never commit `.env` files.** Only `.env.example` templates are tracked. Rotate any credential that has ever been exposed outside its intended environment.
- **Never expose** `SUPABASE_SERVICE_ROLE_KEY`, SMTP credentials, `OPENAI_API_KEY`, `WEBHOOK_SECRET`, or `SENDGRID_INBOUND_TOKEN` in browser code or in Git. The frontend uses the anon key exclusively.
- **Use HTTPS** for the public API, the inbound webhook, and the SMTP connection.
- **Redact query strings** from reverse-proxy and hosting logs — the SendGrid inbound token travels in the URL.
- **Restrict `CORS_ORIGIN`** to your deployed frontend origin. Wildcards are rejected by config validation.
- **Verify `EMAIL_FROM`** is a confirmed sender identity before enabling outbound mail.
- **RLS is enabled** on all tables; the service-role key bypasses it, so the API's `requireAdmin` middleware is the only access control on CRM data.
- **AI requests may contain lead and email content.** Before going to production, confirm your provider's retention and training policies and define your own deletion and retention requirements.

---

## Deployment

Recommended order:

1. Configure environment variables on the host
2. Apply `server/supabase.sql`
3. Create the first user and assign the `admin` role
4. Deploy the backend as a **long-running process**
5. Deploy the frontend as static assets
6. Configure SendGrid inbound DNS and the webhook URL

Notes:

- The backend **must run continuously**. AI scoring and scheduled follow-up delivery are worker-driven; request-only or serverless execution cannot run the delayed workflow.
- Database leases make the worker safe across multiple backend instances, but each instance still needs a live process.
- Build the frontend with `npm run build` and serve `client/dist` from any static host or CDN.
- Set `VITE_API_BASE_URL` at build time — Vite inlines `VITE_*` variables into the bundle.
- The server handles `SIGINT`/`SIGTERM` gracefully, draining in-flight requests and closing the worker with a 30-second ceiling.

---

## Known Limitations

- **No automated test suite.** `server` `npm run check` is a `node --check` syntax pass over every module; `client` `npm run test` is a TypeScript type-check. Neither runs behavioural tests.
- **No CI configuration** is included in this repository.
- The dashboard fetches at most 100 leads per request (`limit` is capped at 100 by validation) and offers no server-side pagination UI.
- The activity feed and notifications are derived client-side from lead timestamps rather than a persisted event stream.
- Lead data is not paginated beyond the 100-row cap, so very large datasets would need cursor pagination before production scale.