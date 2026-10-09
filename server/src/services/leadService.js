import { AppError } from "../errors/AppError.js";
import { supabase } from "../db/supabase.js";

const parseSummary = (value) => {
  if (!value) return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return { summary: String(value), observedFacts: [], unknowns: [] };
  }
};

export const toLead = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  source: row.source ?? null,
  message: row.message ?? null,
  status: row.status,
  lastContactedAt: row.last_contacted_at ?? null,
  likelyScore: row.likely_score ?? null,
  likelyScoreReason: row.likely_score_reason ?? null,
  likelyScoreGeneratedAt: row.likely_score_generated_at ?? null,
  likelyScoreModel: row.likely_score_model ?? null,
  aiSummary: parseSummary(row.ai_summary),
  aiSummaryGeneratedAt: row.ai_summary_generated_at ?? null,
  aiSummaryModel: row.ai_summary_model ?? null,
  emailSuppressed: Boolean(row.email_suppressed),
  createdAt: row.created_at,
  priority: getPriority(row.likely_score),
  needsFollowUp: isFollowUpDue(row),
});

const getPriority = (score) => {
  if (score === null || score === undefined) return "Unscored";
  if (score >= 75) return "High";
  if (score >= 50) return "Medium";
  return "Low";
};

const isFollowUpDue = (row) =>
  row.status !== "Closed" &&
  !row.email_suppressed &&
  new Date(row.last_contacted_at ?? row.created_at).getTime() <=
    Date.now() - 3 * 24 * 60 * 60 * 1000;

export const createLead = async (input) => {
  const normalizedEmail = input.email.trim().toLowerCase();
  const { data, error } = await supabase
    .rpc("upsert_lead", {
      p_name: input.name.trim(),
      p_email: normalizedEmail,
      p_source: input.source.trim(),
      p_message: input.message.trim(),
    })
    .single();

  if (error || !data) {
    console.error(
      "Supabase lead upsert failed:",
      error ?? "No result returned",
    );
    throw new AppError(
      "Unable to create or update lead",
      500,
      "LEAD_SAVE_FAILED",
    );
  }

  return {
    lead: toLead(data.lead),
    isNew: data.is_new,
  };
};

export const listLeads = async ({
  page,
  limit,
  status,
  priority,
  needsFollowUp,
}) => {
  const allQuery = supabase.from("leads").select("*", { count: "exact" });
  if (status) allQuery.eq("status", status);
  const { data: allRows, error: allError, count } = await allQuery;
  if (allError) {
    console.error("Supabase lead list failed:", allError);
    throw new AppError("Unable to retrieve leads", 500, "LEADS_FETCH_FAILED");
  }

  const rows = allRows ?? [];
  const filtered = rows.filter((row) => {
    const rowPriority = getPriority(row.likely_score);
    const matchesPriority =
      !priority || priority === "All" || rowPriority === priority;
    const matchesFollowUp = needsFollowUp !== true || isFollowUpDue(row);
    return matchesPriority && matchesFollowUp;
  });
  const total = filtered.length;
  const offset = (page - 1) * limit;
  const data = filtered
    .sort(
      (first, second) =>
        (second.likely_score ?? -1) - (first.likely_score ?? -1) ||
        new Date(second.created_at) - new Date(first.created_at),
    )
    .slice(offset, offset + limit);
  const scoredRows = filtered.filter((row) => row.likely_score !== null);

  return {
    data: data.map((row) => ({
      ...toLead(row),
      priority: getPriority(row.likely_score),
      needsFollowUp: isFollowUpDue(row),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    },
    meta: {
      totalLeads: rows.length,
      filteredLeadCount: filtered.length,
      averageScore: scoredRows.length
        ? Math.round(
            scoredRows.reduce((sum, row) => sum + row.likely_score, 0) /
              scoredRows.length,
          )
        : 0,
      highPriorityCount: filtered.filter(
        (row) => (row.likely_score ?? -1) >= 75,
      ).length,
      unscoredCount: filtered.filter((row) => row.likely_score === null).length,
      overdueFollowUpCount: filtered.filter(isFollowUpDue).length,
      suppressedCount: filtered.filter((row) => row.email_suppressed).length,
    },
  };
};

export const getLead = async (leadId) => {
  const { data, error } = await supabase
    .from("leads")
    .select()
    .eq("id", leadId)
    .maybeSingle();

  if (error || !data) {
    throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
  }

  return toLead(data);
};

export const updateLeadScore = async (
  leadId,
  likelyScore,
  likelyScoreReason,
  model = null,
) => {
  const { data, error } = await supabase
    .from("leads")
    .update({
      likely_score: likelyScore,
      likely_score_reason: likelyScoreReason,
      likely_score_generated_at: new Date().toISOString(),
      likely_score_model: model,
    })
    .eq("id", leadId)
    .select()
    .single();

  if (error || !data) {
    throw new AppError(
      "Unable to save lead score",
      500,
      "LEAD_SCORE_SAVE_FAILED",
    );
  }

  return toLead(data);
};

export const reactivateLeadEmail = async (leadId) => {
  const { data, error } = await supabase
    .from("leads")
    .update({ email_suppressed: false, email_suppressed_at: null })
    .eq("id", leadId)
    .select()
    .single();
  if (error || !data)
    throw new AppError(
      "Unable to reactivate lead email",
      500,
      "EMAIL_REACTIVATION_FAILED",
    );
  return toLead(data);
};

export const updateLeadStatus = async (leadId, status) => {
  await getLead(leadId);

  const { data, error } = await supabase
    .rpc("transition_lead_status", {
      p_lead_id: leadId,
      p_status: status,
    })
    .single();

  if (error) {
    console.error("Supabase lead status transition failed:", error);
    throw new AppError(
      "Unable to update lead status",
      500,
      "LEAD_STATUS_UPDATE_FAILED",
    );
  }

  if (!data) {
    throw new AppError(
      "The requested lead status transition is not allowed",
      409,
      "INVALID_STATUS_TRANSITION",
    );
  }

  return toLead(data);
};

export const getEmailHistory = async (leadId) => {
  const { data, error } = await supabase
    .from("lead_email_events")
    .select()
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false });

  if (error) {
    console.error("Supabase email history fetch failed:", error);
    throw new AppError(
      "Unable to retrieve email history",
      500,
      "EMAIL_HISTORY_FETCH_FAILED",
    );
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    deliveryStatus: row.delivery_status,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body ?? null,
    messageId: row.message_id ?? null,
    errorMessage: row.error_message ?? null,
    sentAt: row.sent_at,
    createdAt: row.created_at,
  }));
};
