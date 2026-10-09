import { env } from "../config/env.js";
import { supabase } from "../db/supabase.js";
import { AppError } from "../errors/AppError.js";
import { generateLeadScore } from "./aiService.js";
import {
  classifyStoredMessage,
  getConversation,
} from "./inboundEmailService.js";
import { executeDueStep } from "./followUpSequenceService.js";

export const enqueueJob = async ({
  jobType,
  entityId,
  dedupeKey,
  payload = {},
  runAt = new Date().toISOString(),
}) => {
  const { data, error } = await supabase
    .from("background_jobs")
    .upsert(
      {
        job_type: jobType,
        entity_id: entityId,
        dedupe_key: dedupeKey,
        payload,
        run_at: runAt,
        status: "Pending",
        last_error: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "dedupe_key" },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Unable to enqueue background job:", error);
    throw new AppError(
      "Unable to schedule background work",
      500,
      "BACKGROUND_JOB_ENQUEUE_FAILED",
    );
  }
  return data;
};

export const enqueueLeadScore = async (leadId, reason) =>
  enqueueJob({
    jobType: "LeadScore",
    entityId: leadId,
    dedupeKey: `lead-score:${leadId}`,
    payload: { reason },
  });

export const backfillLeadScores = async () => {
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .is("likely_score", null)
    .neq("status", "Closed")
    .eq("email_suppressed", false)
    .limit(100);
  if (error) throw error;
  await Promise.all(
    (data ?? []).map((lead) => enqueueLeadScore(lead.id, "startup_backfill")),
  );
};

export const claimJobs = async (workerId, limit, leaseSeconds) => {
  const { data, error } = await supabase.rpc("claim_background_jobs", {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw error;
  return data ?? [];
};

const completeLeadScore = async (leadId) => {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !lead)
    throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
  const analysis = await generateLeadScore(lead, await getConversation(leadId));
  const { data, error: updateError } = await supabase
    .from("leads")
    .update({
      likely_score: analysis.likelyScore,
      likely_score_reason: analysis.scoreReason,
      likely_score_generated_at: new Date().toISOString(),
      likely_score_model: env.ai.model,
    })
    .eq("id", leadId)
    .select()
    .single();
  if (updateError) throw updateError;
  return data;
};

export const processJob = async (job) => {
  if (job.job_type === "LeadScore") return completeLeadScore(job.entity_id);
  if (job.job_type === "InboundClassification")
    return classifyStoredMessage(job.entity_id);
  if (job.job_type === "FollowUpSend") return executeDueStep(job);
  throw new AppError(
    "Unsupported background job",
    500,
    "UNSUPPORTED_BACKGROUND_JOB",
  );
};

export const finishJob = async (
  { id, lease_owner, attempt_count, max_attempts },
  error = null,
) => {
  if (!error)
    return supabase.rpc("finish_background_job", {
      p_job_id: id,
      p_worker_id: lease_owner,
      p_status: "Completed",
    });
  const retryable = attempt_count < max_attempts;
  const retryAt = new Date(
    Date.now() + Math.min(60 * 60_000, 2 ** attempt_count * 5_000),
  ).toISOString();
  return supabase.rpc("finish_background_job", {
    p_job_id: id,
    p_worker_id: lease_owner,
    p_status: retryable ? "Pending" : "Failed",
    p_error: String(error.message ?? error).slice(0, 2000),
    p_retry_at: retryAt,
  });
};
