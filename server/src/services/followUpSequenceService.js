import { supabase } from "../db/supabase.js";
import { AppError } from "../errors/AppError.js";
import { generateFollowUpSequence } from "./aiService.js";
import { getConversation } from "./inboundEmailService.js";
import { sendLeadEmail } from "./emailService.js";

const toStep = (row) => ({
  id: row.id,
  sequenceId: row.sequence_id,
  stepNumber: row.step_number,
  delayHours: row.delay_hours,
  subject: row.subject,
  body: row.body,
  status: row.status,
  scheduledAt: row.scheduled_at,
  sentAt: row.sent_at,
  emailEventId: row.email_event_id,
  attemptCount: row.attempt_count,
  errorMessage: row.error_message,
});

const toSequence = (row, steps = []) => ({
  id: row.id,
  leadId: row.lead_id,
  status: row.status,
  currentStep: row.current_step,
  nextActionAt: row.next_action_at,
  pauseReason: row.pause_reason,
  approvedAt: row.approved_at,
  pausedAt: row.paused_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  steps,
});

const requireSequence = async (sequenceId) => {
  const { data, error } = await supabase
    .from("follow_up_sequences")
    .select("*")
    .eq("id", sequenceId)
    .maybeSingle();
  if (error || !data)
    throw new AppError(
      "Follow-up sequence not found",
      404,
      "FOLLOW_UP_SEQUENCE_NOT_FOUND",
    );
  return data;
};

const loadSteps = async (sequenceId) => {
  const { data, error } = await supabase
    .from("follow_up_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_number");
  if (error)
    throw new AppError(
      "Unable to load follow-up sequence",
      500,
      "FOLLOW_UP_SEQUENCE_FETCH_FAILED",
    );
  return data ?? [];
};

export const getLeadSequences = async (leadId) => {
  const { data, error } = await supabase
    .from("follow_up_sequences")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error)
    throw new AppError(
      "Unable to load follow-up sequences",
      500,
      "FOLLOW_UP_SEQUENCE_FETCH_FAILED",
    );
  return Promise.all(
    (data ?? []).map(async (row) =>
      toSequence(row, (await loadSteps(row.id)).map(toStep)),
    ),
  );
};

export const getSequence = async (sequenceId) =>
  toSequence(
    await requireSequence(sequenceId),
    (await loadSteps(sequenceId)).map(toStep),
  );

export const generateSequence = async (lead, userId) => {
  const drafts = await generateFollowUpSequence(
    lead,
    await getConversation(lead.id),
  );
  const { data: existing, error: activeError } = await supabase
    .from("follow_up_sequences")
    .select("id")
    .eq("lead_id", lead.id)
    .in("status", ["Draft", "Active", "Paused"])
    .limit(1)
    .maybeSingle();
  if (activeError)
    throw new AppError(
      "Unable to check existing sequences",
      500,
      "FOLLOW_UP_SEQUENCE_FETCH_FAILED",
    );
  if (existing)
    throw new AppError(
      "Cancel the current draft or sequence before generating another",
      409,
      "FOLLOW_UP_SEQUENCE_EXISTS",
    );

  const { data: sequence, error } = await supabase
    .from("follow_up_sequences")
    .insert({ lead_id: lead.id, created_by: userId })
    .select()
    .single();
  if (error || !sequence)
    throw new AppError(
      "Unable to create follow-up sequence",
      500,
      "FOLLOW_UP_SEQUENCE_CREATE_FAILED",
    );

  const { data: steps, error: stepError } = await supabase
    .from("follow_up_steps")
    .insert(
      drafts.steps.map((step) => ({
        sequence_id: sequence.id,
        step_number: drafts.steps.indexOf(step) + 1,
        delay_hours: step.delayHours,
        subject: step.subject,
        body: step.body,
      })),
    )
    .select();
  if (stepError) {
    await supabase.from("follow_up_sequences").delete().eq("id", sequence.id);
    throw new AppError(
      "Unable to create follow-up steps",
      500,
      "FOLLOW_UP_STEP_CREATE_FAILED",
    );
  }
  return toSequence(sequence, (steps ?? []).map(toStep));
};

export const updateStep = async (sequenceId, stepId, input, userId) => {
  const sequence = await requireSequence(sequenceId);
  if (sequence.status !== "Draft" || sequence.created_by !== userId)
    throw new AppError(
      "Only your draft sequence can be edited",
      409,
      "FOLLOW_UP_SEQUENCE_LOCKED",
    );
  const { data, error } = await supabase
    .from("follow_up_steps")
    .update({
      subject: input.subject,
      body: input.body,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .eq("sequence_id", sequenceId)
    .select()
    .single();
  if (error || !data)
    throw new AppError(
      "Unable to update follow-up step",
      404,
      "FOLLOW_UP_STEP_NOT_FOUND",
    );
  return toStep(data);
};

const assertTransition = (from, to) => {
  const allowed = {
    Draft: ["Active", "Cancelled"],
    Active: ["Paused", "Completed", "Cancelled"],
    Paused: ["Active", "Cancelled", "Completed"],
  };
  if (!allowed[from]?.includes(to))
    throw new AppError(
      `Cannot change sequence from ${from} to ${to}`,
      409,
      "INVALID_FOLLOW_UP_TRANSITION",
    );
};

export const changeSequenceStatus = async (
  sequenceId,
  status,
  userId,
  reason = null,
) => {
  const sequence = await requireSequence(sequenceId);
  assertTransition(sequence.status, status);
  const now = new Date().toISOString();
  const patch = {
    status,
    updated_at: now,
    next_action_at: null,
    pause_reason: status === "Paused" ? reason : null,
  };
  if (status === "Active")
    Object.assign(patch, {
      approved_by: userId,
      approved_at: sequence.approved_at ?? now,
      paused_at: null,
    });
  if (status === "Paused") patch.paused_at = now;
  if (status === "Completed") patch.completed_at = now;
  if (status === "Cancelled") {
    patch.cancelled_at = now;
    patch.pause_reason = reason ?? patch.pause_reason;
  }

  const { data, error } = await supabase
    .from("follow_up_sequences")
    .update(patch)
    .eq("id", sequenceId)
    .eq("status", sequence.status)
    .select()
    .maybeSingle();
  if (error || !data)
    throw new AppError(
      "The sequence changed; refresh and try again",
      409,
      "FOLLOW_UP_TRANSITION_CONFLICT",
    );
  if (status === "Active") {
    const baseScheduleTime =
      sequence.status === "Paused" ? now : (sequence.approved_at ?? now);
    const approvalTime = new Date(baseScheduleTime).getTime();
    const { data: steps, error: loadError } = await supabase
      .from("follow_up_steps")
      .select("id,delay_hours")
      .eq("sequence_id", sequenceId)
      .neq("status", "Sent")
      .order("step_number");
    if (loadError)
      throw new AppError(
        "Unable to schedule follow-up steps",
        500,
        "FOLLOW_UP_SCHEDULE_FAILED",
      );
    await Promise.all(
      steps.map((step) =>
        supabase
          .from("follow_up_steps")
          .update({
            scheduled_at: new Date(
              approvalTime + step.delay_hours * 3600_000,
            ).toISOString(),
            status: "Scheduled",
            updated_at: now,
          })
          .eq("id", step.id),
      ),
    );
    await Promise.all(
      steps.map((step) =>
        supabase.from("background_jobs").upsert(
          {
            job_type: "FollowUpSend",
            entity_id: step.id,
            dedupe_key: `follow-up-send:${step.id}`,
            payload: { sequenceId, stepId: step.id },
            run_at: new Date(
              approvalTime + step.delay_hours * 3600_000,
            ).toISOString(),
            status: "Pending",
            last_error: null,
            completed_at: null,
            updated_at: now,
          },
          { onConflict: "dedupe_key" },
        ),
      ),
    );
    if (steps.length)
      await supabase
        .from("follow_up_sequences")
        .update({
          next_action_at: new Date(
            approvalTime + steps[0].delay_hours * 3600_000,
          ).toISOString(),
          updated_at: now,
        })
        .eq("id", sequenceId);
  }
  if (status === "Cancelled") {
    await supabase
      .from("follow_up_steps")
      .update({ status: "Cancelled", updated_at: now })
      .eq("sequence_id", sequenceId)
      .in("status", ["Draft", "Scheduled", "Processing", "Failed"]);
    const { data: pendingSteps } = await supabase
      .from("follow_up_steps")
      .select("id")
      .eq("sequence_id", sequenceId);
    if (pendingSteps?.length)
      await supabase
        .from("background_jobs")
        .update({
          status: "Failed",
          last_error: "Sequence cancelled",
          completed_at: now,
          updated_at: now,
        })
        .in(
          "entity_id",
          pendingSteps.map((step) => step.id),
        )
        .eq("job_type", "FollowUpSend")
        .in("status", ["Pending", "Running"]);
  }
  return getSequence(sequenceId);
};

export const deleteSequence = async (sequenceId, reason = null) => {
  const sequence = await requireSequence(sequenceId);
  const { data: steps, error: stepError } = await supabase
    .from("follow_up_steps")
    .select("id")
    .eq("sequence_id", sequenceId);
  if (stepError)
    throw new AppError(
      "Unable to load follow-up steps",
      500,
      "FOLLOW_UP_STEP_FETCH_FAILED",
    );

  const stepIds = (steps ?? []).map((step) => step.id);
  if (stepIds.length) {
    const { error: jobError } = await supabase
      .from("background_jobs")
      .delete()
      .eq("job_type", "FollowUpSend")
      .in("entity_id", stepIds);
    if (jobError)
      throw new AppError(
        "Unable to remove scheduled follow-up emails",
        500,
        "FOLLOW_UP_SCHEDULE_DELETE_FAILED",
      );
  }

  const { error } = await supabase
    .from("follow_up_sequences")
    .delete()
    .eq("id", sequenceId);
  if (error)
    throw new AppError(
      "Unable to delete follow-up sequence",
      500,
      "FOLLOW_UP_SEQUENCE_DELETE_FAILED",
    );

  return {
    id: sequenceId,
    leadId: sequence.lead_id,
    reason,
    deletedStepCount: stepIds.length,
  };
};

export const cancelActiveSequencesForLead = async (leadId, reason) => {
  const now = new Date().toISOString();
  const { data: sequences } = await supabase
    .from("follow_up_sequences")
    .select("id")
    .eq("lead_id", leadId)
    .in("status", ["Draft", "Active", "Paused"]);
  if (!sequences?.length) return;
  const sequenceIds = sequences.map((sequence) => sequence.id);
  await supabase
    .from("follow_up_sequences")
    .update({
      status: "Cancelled",
      pause_reason: reason,
      cancelled_at: now,
      next_action_at: null,
      updated_at: now,
    })
    .in("id", sequenceIds);
  const { data: steps } = await supabase
    .from("follow_up_steps")
    .select("id")
    .in("sequence_id", sequenceIds);
  if (steps?.length)
    await supabase
      .from("follow_up_steps")
      .update({ status: "Cancelled", updated_at: now })
      .in(
        "id",
        steps.map((step) => step.id),
      )
      .in("status", ["Draft", "Scheduled", "Processing", "Failed"]);
  if (steps?.length)
    await supabase
      .from("background_jobs")
      .update({
        status: "Failed",
        last_error: reason,
        completed_at: now,
        updated_at: now,
      })
      .in(
        "entity_id",
        steps.map((step) => step.id),
      )
      .eq("job_type", "FollowUpSend")
      .in("status", ["Pending", "Running"]);
};

export const executeDueStep = async (job) => {
  const { data: step, error } = await supabase
    .from("follow_up_steps")
    .select("*")
    .eq("id", job.entity_id)
    .single();
  if (error || !step)
    throw new AppError(
      "Follow-up step not found",
      404,
      "FOLLOW_UP_STEP_NOT_FOUND",
    );
  const { data: sequence, error: sequenceError } = await supabase
    .from("follow_up_sequences")
    .select("*")
    .eq("id", step.sequence_id)
    .eq("status", "Active")
    .maybeSingle();
  if (sequenceError) {
    throw new AppError(
      "Unable to load follow-up sequence",
      500,
      "FOLLOW_UP_SEQUENCE_FETCH_FAILED",
    );
  }
  if (!sequence) return null;
  if (step.status === "Processing") {
    await supabase
      .from("follow_up_steps")
      .update({
        status: "Failed",
        error_message:
          "Worker lease expired after an uncertain delivery state; manual review is required before retrying.",
      })
      .eq("id", step.id);
    await supabase
      .from("follow_up_sequences")
      .update({
        status: "Paused",
        pause_reason: "Uncertain delivery requires manual review",
        paused_at: new Date().toISOString(),
        next_action_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", step.sequence_id)
      .eq("status", "Active");
    return null;
  }
  const { data: claimed, error: claimError } = await supabase
    .from("follow_up_steps")
    .update({
      status: "Processing",
      attempt_count: step.attempt_count + 1,
      error_message: null,
    })
    .eq("id", step.id)
    .in("status", ["Scheduled", "Failed"])
    .select()
    .maybeSingle();
  if (claimError || !claimed)
    throw new AppError(
      "Follow-up step was already claimed",
      409,
      "FOLLOW_UP_STEP_CLAIMED",
    );

  try {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", sequence.lead_id)
      .maybeSingle();
    if (leadError || !lead || lead.email_suppressed)
      throw new AppError(
        "Follow-up email is suppressed or lead is missing",
        409,
        "FOLLOW_UP_EMAIL_BLOCKED",
      );
    const event = await sendLeadEmail(
      {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        emailSuppressed: lead.email_suppressed,
      },
      { subject: step.subject, body: step.body },
      {
        sequenceStepId: step.id,
        idempotencyKey: `follow-up-step:${step.id}`,
        deterministicMessageId: `follow-up-step-${step.id}`,
      },
    );
    const now = new Date().toISOString();
    await supabase
      .from("follow_up_steps")
      .update({
        status: "Sent",
        sent_at: now,
        email_event_id: event.id,
        error_message: null,
      })
      .eq("id", step.id);
    const { data: remaining } = await supabase
      .from("follow_up_steps")
      .select("status")
      .eq("sequence_id", step.sequence_id)
      .neq("status", "Sent");
    if (!remaining?.length)
      await supabase
        .from("follow_up_sequences")
        .update({
          status: "Completed",
          completed_at: now,
          next_action_at: null,
          updated_at: now,
        })
        .eq("id", step.sequence_id)
        .eq("status", "Active");
    return event;
  } catch (sendError) {
    await supabase
      .from("follow_up_steps")
      .update({
        status: "Failed",
        error_message: String(sendError?.message ?? sendError).slice(0, 1000),
      })
      .eq("id", step.id);
    throw sendError;
  }
};
