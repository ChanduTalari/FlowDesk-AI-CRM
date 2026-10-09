import Joi from "joi";
import { Router } from "express";
import {
  handleCreateLead,
  handleDeleteSequence,
  handleGenerateLeadAnalysis,
  handleGenerateSequence,
  handleGenerateSummary,
  handleGetConversation,
  handleGetEmailHistory,
  handleGetLead,
  handleGetLeadSequences,
  handleGetSequence,
  handleListLeads,
  handleReactivateEmail,
  handleRetryClassification,
  handleSendLeadEmail,
  handleSequenceStatus,
  handleUpdateLeadStatus,
  handleUpdateSequenceStep,
} from "../controllers/leadController.js";
import { AppError } from "../errors/AppError.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { aiRateLimiter, webhookRateLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { verifyWebhookSignature } from "../middleware/verifyWebhookSignature.js";

const leadStatuses = ["New", "Emailed", "Contacted", "Closed"];

const createLeadSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Name is required",
    "string.max": "Name must be 255 characters or fewer",
  }),
  email: Joi.string().trim().email().lowercase().max(255).required().messages({
    "string.empty": "Email is required",
    "string.email": "Enter a valid email address",
  }),
  source: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "Source is required",
  }),
  message: Joi.string().trim().allow("").max(5000).required(),
});

const listLeadsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(100),
  status: Joi.string()
    .valid(...leadStatuses)
    .optional(),
  priority: Joi.string()
    .valid("All", "High", "Medium", "Low", "Unscored")
    .optional(),
  needsFollowUp: Joi.boolean().optional(),
});

const leadIdSchema = Joi.object({
  leadId: Joi.string().uuid().required(),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...leadStatuses)
    .required(),
});

const sendEmailSchema = Joi.object({
  subject: Joi.string().min(1).max(255).required(),
  body: Joi.string().min(1).max(10_000).required(),
});

const sequenceIdSchema = Joi.object({
  sequenceId: Joi.string().uuid().required(),
});
const stepIdSchema = Joi.object({
  sequenceId: Joi.string().uuid().required(),
  stepId: Joi.string().uuid().required(),
});
const messageIdSchema = Joi.object({
  messageId: Joi.string().uuid().required(),
});
const stepUpdateSchema = Joi.object({
  subject: Joi.string().min(1).max(255).required(),
  body: Joi.string().min(1).max(10_000).required(),
});
const sequenceReasonSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional(),
});

const parseWebhookBody = (req, _res, next) => {
  if (!Buffer.isBuffer(req.body)) {
    return next(
      new AppError(
        "The webhook request body is unavailable",
        400,
        "WEBHOOK_BODY_UNAVAILABLE",
      ),
    );
  }

  try {
    req.body = JSON.parse(req.body.toString("utf8"));
  } catch {
    return next(
      new AppError(
        "The webhook request body contains invalid JSON",
        400,
        "INVALID_JSON",
      ),
    );
  }

  return next();
};

export const createWebhookLeadsRouter = (emailQueue) => {
  const router = Router();

  router.post(
    "/",
    webhookRateLimiter,
    verifyWebhookSignature,
    parseWebhookBody,
    validate(createLeadSchema),
    asyncRoute((req, res) => handleCreateLead(req, res, emailQueue)),
  );

  return router;
};

export const createAdminLeadsRouter = (emailQueue) => {
  const router = Router();

  router.post(
    "/",
    validate(createLeadSchema),
    asyncRoute((req, res) => handleCreateLead(req, res, emailQueue)),
  );

  router.get(
    "/",
    validate(listLeadsSchema, "query"),
    asyncRoute(handleListLeads),
  );

  router.get(
    "/:leadId",
    validate(leadIdSchema, "params"),
    asyncRoute(handleGetLead),
  );

  router.get(
    "/:leadId/conversation",
    validate(leadIdSchema, "params"),
    asyncRoute(handleGetConversation),
  );

  router.post(
    "/:leadId/ai/summary",
    validate(leadIdSchema, "params"),
    aiRateLimiter,
    asyncRoute(handleGenerateSummary),
  );

  router.post(
    "/:leadId/follow-up-sequences/generate",
    validate(leadIdSchema, "params"),
    aiRateLimiter,
    asyncRoute(handleGenerateSequence),
  );

  router.get(
    "/:leadId/follow-up-sequences",
    validate(leadIdSchema, "params"),
    asyncRoute(handleGetLeadSequences),
  );

  router.post(
    "/:leadId/reactivate-email",
    validate(leadIdSchema, "params"),
    asyncRoute(handleReactivateEmail),
  );

  router.get(
    "/follow-up-sequences/:sequenceId",
    validate(sequenceIdSchema, "params"),
    asyncRoute(handleGetSequence),
  );

  router.patch(
    "/follow-up-sequences/:sequenceId/steps/:stepId",
    validate(stepIdSchema, "params"),
    validate(stepUpdateSchema),
    asyncRoute(handleUpdateSequenceStep),
  );

  router.delete(
    "/follow-up-sequences/:sequenceId",
    validate(sequenceIdSchema, "params"),
    validate(sequenceReasonSchema),
    asyncRoute(handleDeleteSequence),
  );

  router.post(
    "/follow-up-sequences/:sequenceId/approve",
    validate(sequenceIdSchema, "params"),
    asyncRoute(handleSequenceStatus("Active")),
  );
  router.post(
    "/follow-up-sequences/:sequenceId/pause",
    validate(sequenceIdSchema, "params"),
    validate(sequenceReasonSchema),
    asyncRoute(handleSequenceStatus("Paused")),
  );
  router.post(
    "/follow-up-sequences/:sequenceId/resume",
    validate(sequenceIdSchema, "params"),
    asyncRoute(handleSequenceStatus("Active")),
  );
  router.post(
    "/follow-up-sequences/:sequenceId/cancel",
    validate(sequenceIdSchema, "params"),
    validate(sequenceReasonSchema),
    asyncRoute(handleSequenceStatus("Cancelled")),
  );

  router.post(
    "/inbound-messages/:messageId/classify/retry",
    validate(messageIdSchema, "params"),
    asyncRoute(handleRetryClassification),
  );

  router.patch(
    "/:leadId/status",
    validate(leadIdSchema, "params"),
    validate(updateStatusSchema),
    asyncRoute(handleUpdateLeadStatus),
  );

  router.get(
    "/:leadId/emails",
    validate(leadIdSchema, "params"),
    asyncRoute(handleGetEmailHistory),
  );

  router.post(
    "/:leadId/emails/send",
    validate(leadIdSchema, "params"),
    validate(sendEmailSchema),
    asyncRoute(handleSendLeadEmail),
  );

  router.post(
    "/:leadId/ai/analyze",
    validate(leadIdSchema, "params"),
    aiRateLimiter,
    asyncRoute(handleGenerateLeadAnalysis),
  );

  return router;
};
