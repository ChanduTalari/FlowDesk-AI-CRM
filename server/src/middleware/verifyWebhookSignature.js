import crypto from "node:crypto";
import { AppError } from "../errors/AppError.js";
import { env } from "../config/env.js";

const headerValue = (req, name) => req.get(name)?.trim() ?? "";

export const verifyWebhookSignature = (req, _res, next) => {
  try {
    const timestampValue = headerValue(req, "x-webhook-timestamp");
    const providedSignature = headerValue(req, "x-webhook-signature");
    const timestamp = Number(timestampValue);

    if (
      !timestampValue ||
      !Number.isInteger(timestamp) ||
      Math.abs(Date.now() - timestamp) > env.webhook.maxAgeMs
    ) {
      throw new AppError(
        "The webhook timestamp is missing or stale",
        401,
        "WEBHOOK_SIGNATURE_INVALID",
      );
    }

    if (!/^[a-fA-F0-9]{64}$/.test(providedSignature)) {
      throw new AppError(
        "The webhook signature is invalid",
        401,
        "WEBHOOK_SIGNATURE_INVALID",
      );
    }

    const rawBody = req.rawBody ?? req.body;

    if (!Buffer.isBuffer(rawBody)) {
      throw new AppError(
        "The webhook request body is unavailable",
        400,
        "WEBHOOK_BODY_UNAVAILABLE",
      );
    }

    req.rawBody = rawBody;
    const signedPayload = `${timestamp}.`;
    const expectedSignature = crypto
      .createHmac("sha256", env.webhook.secret)
      .update(signedPayload)
      .update(rawBody)
      .digest("hex");

    const signatureIsValid = crypto.timingSafeEqual(
      Buffer.from(providedSignature, "hex"),
      Buffer.from(expectedSignature, "hex"),
    );

    if (!signatureIsValid) {
      throw new AppError(
        "The webhook signature is invalid",
        401,
        "WEBHOOK_SIGNATURE_INVALID",
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
