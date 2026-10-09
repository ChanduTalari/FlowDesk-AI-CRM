import "./src/config/env.js";

import cors from "cors";
import express from "express";
import helmet from "helmet";
import multer from "multer";
import { env } from "./src/config/env.js";
import { supabase } from "./src/db/supabase.js";
import {
  errorHandler,
  notFoundHandler,
} from "./src/middleware/errorHandler.js";
import { requireAdmin } from "./src/middleware/requireAdmin.js";
import { standardRateLimiter } from "./src/middleware/rateLimit.js";
import { verifyWebhookSignature } from "./src/middleware/verifyWebhookSignature.js";
import {
  createAdminLeadsRouter,
  createWebhookLeadsRouter,
} from "./src/routes/leads.js";
import { createInboundEmailRouter } from "./src/routes/inboundEmail.js";
import { BackgroundWorker } from "./src/services/backgroundWorker.js";
import { EmailQueue } from "./src/services/emailQueue.js";
import { sendWelcomeEmail } from "./src/services/emailService.js";

const app = express();
const emailQueue = new EmailQueue(sendWelcomeEmail, {
  concurrency: env.emailQueue.concurrency,
  retries: env.emailQueue.retries,
});
const backgroundWorker = new BackgroundWorker();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));

// Capture the exact bytes before the general JSON parser consumes the stream.
app.use(
  "/api/webhooks/leads",
  express.raw({ type: "application/json", limit: "100kb" }),
  createWebhookLeadsRouter(emailQueue),
);

// SendGrid Inbound Parse sends multipart form data and uses a private URL token.
app.use(
  "/api/webhooks/inbound-email",
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 10 },
  }).any(),
  express.urlencoded({ extended: false, limit: "2mb" }),
  createInboundEmailRouter(),
);

app.use(express.json({ limit: "100kb" }));

app.get("/health", async (_req, res) => {
  const { error } = await supabase.from("leads").select("id").limit(1);
  res.status(error ? 503 : 200).json({
    status: error ? "degraded" : "ok",
    database: error ? "unavailable" : "available",
  });
});

app.use(
  "/api/leads",
  standardRateLimiter,
  requireAdmin,
  createAdminLeadsRouter(emailQueue),
);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`AI CRM API listening on port ${env.port}`);
});

void backgroundWorker.start();

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}; shutting down`);

  server.close(async () => {
    await Promise.all([emailQueue.close(), backgroundWorker.close()]);
    process.exit(0);
  });

  // Prevent an unbounded graceful shutdown if an SMTP request hangs.
  setTimeout(() => process.exit(1), 30_000).unref();
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
