import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

const makeLimiter = (limit, message) =>
  rateLimit({
    windowMs: env.rateLimit.windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message,
        },
      });
    },
  });

export const standardRateLimiter = makeLimiter(
  env.rateLimit.standardLimit,
  "Too many requests. Please try again shortly.",
);

export const webhookRateLimiter = makeLimiter(
  env.rateLimit.webhookLimit,
  "Too many webhook requests. Please retry later.",
);

export const aiRateLimiter = makeLimiter(
  env.rateLimit.aiLimit,
  "Too many AI requests. Please retry later.",
);
