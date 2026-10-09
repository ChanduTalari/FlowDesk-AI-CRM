import { env } from "../config/env.js";
import { supabase } from "../db/supabase.js";
import { AppError } from "../errors/AppError.js";
import {
  generateFollowUpSummary,
  generateLeadAnalysis,
} from "../services/aiService.js";
import { enqueueLeadScore } from "../services/aiJobService.js";
import { sendLeadEmail } from "../services/emailService.js";
import {
  changeSequenceStatus,
  deleteSequence,
  generateSequence,
  getLeadSequences,
  getSequence,
  updateStep,
} from "../services/followUpSequenceService.js";
import {
  getConversation,
  getInboundMessages,
  retryClassification,
} from "../services/inboundEmailService.js";
import {
  createLead,
  getEmailHistory,
  getLead,
  listLeads,
  reactivateLeadEmail,
  toLead,
  updateLeadScore,
  updateLeadStatus,
} from "../services/leadService.js";

export const handleCreateLead = async (req, res, emailQueue) => {
  const result = await createLead(req.validated.body);
  res
    .status(result.isNew ? 201 : 200)
    .json({ data: result.lead, meta: { created: result.isNew } });
  if (result.isNew) {
    emailQueue.enqueue(result.lead);
    void enqueueLeadScore(result.lead.id, "lead_created").catch((error) =>
      console.error("Unable to enqueue lead score:", error),
    );
  }
};

export const handleListLeads = async (req, res) =>
  res.json(await listLeads(req.validated.query));
export const handleGetLead = async (req, res) =>
  res.json({ data: await getLead(req.validated.params.leadId) });
export const handleGetEmailHistory = async (req, res) =>
  res.json({ data: await getEmailHistory(req.validated.params.leadId) });

export const handleGetConversation = async (req, res) => {
  const [messages, outbound, inbound] = await Promise.all([
    getConversation(req.validated.params.leadId),
    getEmailHistory(req.validated.params.leadId),
    getInboundMessages(req.validated.params.leadId),
  ]);
  res.json({ data: { messages, outbound, inbound } });
};

export const handleGenerateSummary = async (req, res) => {
  const lead = await getLead(req.validated.params.leadId);
  const conversation = await getConversation(lead.id);
  const summary = await generateFollowUpSummary(lead, conversation);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .update({
      ai_summary: JSON.stringify(summary),
      ai_summary_generated_at: now,
      ai_summary_model: env.ai.model,
    })
    .eq("id", lead.id)
    .select()
    .single();
  if (error || !data) {
    throw new AppError(
      "Unable to save AI briefing",
      500,
      "AI_SUMMARY_SAVE_FAILED",
    );
  }
  res.json({ data: summary, meta: { lead: toLead(data) } });
};

export const handleSendLeadEmail = async (req, res) => {
  const lead = await getLead(req.validated.params.leadId);
  const event = await sendLeadEmail(
    { ...lead, emailSuppressed: lead.emailSuppressed },
    req.validated.body,
  );
  res.status(201).json({ data: event, meta: { lead: await getLead(lead.id) } });
};

export const handleUpdateLeadStatus = async (req, res) =>
  res.json({
    data: await updateLeadStatus(
      req.validated.params.leadId,
      req.validated.body.status,
    ),
  });
export const handleReactivateEmail = async (req, res) =>
  res.json({ data: await reactivateLeadEmail(req.validated.params.leadId) });

export const handleGenerateLeadAnalysis = async (req, res) => {
  const lead = await getLead(req.validated.params.leadId);
  const analysis = await generateLeadAnalysis(
    lead,
    await getConversation(lead.id),
  );
  const updatedLead = await updateLeadScore(
    lead.id,
    analysis.analysis.likelyScore,
    analysis.analysis.scoreReason,
    env.ai.model,
  );
  res.json({ data: analysis, meta: { lead: updatedLead } });
};

export const handleGenerateSequence = async (req, res) => {
  const lead = await getLead(req.validated.params.leadId);
  res
    .status(201)
    .json({ data: await generateSequence(lead, req.auth.user.id) });
};
export const handleGetLeadSequences = async (req, res) =>
  res.json({ data: await getLeadSequences(req.validated.params.leadId) });
export const handleGetSequence = async (req, res) =>
  res.json({ data: await getSequence(req.validated.params.sequenceId) });
export const handleUpdateSequenceStep = async (req, res) =>
  res.json({
    data: await updateStep(
      req.validated.params.sequenceId,
      req.validated.params.stepId,
      req.validated.body,
      req.auth.user.id,
    ),
  });
export const handleSequenceStatus = (status) => async (req, res) =>
  res.json({
    data: await changeSequenceStatus(
      req.validated.params.sequenceId,
      status,
      req.auth.user.id,
      req.validated.body?.reason,
    ),
  });
export const handleDeleteSequence = async (req, res) =>
  res.json({
    data: await deleteSequence(
      req.validated.params.sequenceId,
      req.validated.body?.reason,
    ),
  });
export const handleRetryClassification = async (req, res) =>
  res.json({ data: await retryClassification(req.validated.params.messageId) });
