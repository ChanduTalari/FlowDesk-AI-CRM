import { Router } from "express";
import { env } from "../config/env.js";
import { asyncRoute } from "../middleware/errorHandler.js";
import { webhookRateLimiter } from "../middleware/rateLimit.js";
import { AppError } from "../errors/AppError.js";
import {
  ingestInboundEmail,
  parseSendGridPayload,
} from "../services/inboundEmailService.js";

export const createInboundEmailRouter = () => {
  const router = Router();

  router.post(
    "/",
    webhookRateLimiter,
    asyncRoute(async (req, res) => {
      if (!env.inboundEmail.sendGridToken) {
        throw new AppError(
          "Inbound email processing is not configured",
          503,
          "INBOUND_EMAIL_DISABLED",
        );
      }

      if (req.query.token !== env.inboundEmail.sendGridToken) {
        throw new AppError(
          "Invalid inbound webhook token",
          401,
          "INVALID_INBOUND_TOKEN",
        );
      }

      const body = { ...(req.body ?? {}) };
      delete body.attachment1;
      delete body.attachment2;
      const text = parseSendGridPayload(body);
      if (text.bodyText.length > env.inboundEmail.maxBodyLength) {
        throw new AppError(
          "Inbound email body is too large",
          413,
          "INBOUND_BODY_TOO_LARGE",
        );
      }

      const result = await ingestInboundEmail(text);
      res
        .status(result.duplicate ? 200 : 202)
        .json({ accepted: true, ...result });
    }),
  );

  return router;
};
