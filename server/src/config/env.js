import dotenv from "dotenv";

dotenv.config();

const requiredVariables = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EMAIL_USER",
  "EMAIL_PASS",
  "EMAIL_FROM",
  "WEBHOOK_SECRET",
];

const missingVariables = requiredVariables.filter(
  (variable) => !process.env[variable]?.trim(),
);

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVariables.join(", ")}`,
  );
}

const parsePort = (value, fallback = 3001) => {
  const port = Number.parseInt(value ?? String(fallback), 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
};

const parsePositiveInteger = (
  value,
  fallback,
  maximum = Number.MAX_SAFE_INTEGER,
) => {
  const parsedValue = Number.parseInt(value ?? String(fallback), 10);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1 ||
    parsedValue > maximum
  ) {
    throw new Error(`Invalid positive integer environment value: ${value}`);
  }

  return parsedValue;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  throw new Error(`Invalid boolean environment value: ${value}`);
};

const corsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  throw new Error("CORS_ORIGIN must contain at least one exact origin");
}

for (const origin of corsOrigins) {
  let parsedOrigin;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS_ORIGIN value: ${origin}`);
  }

  if (
    origin === "*" ||
    parsedOrigin.pathname !== "/" ||
    !["http:", "https:"].includes(parsedOrigin.protocol)
  ) {
    throw new Error(
      `CORS_ORIGIN must contain exact http or https origins: ${origin}`,
    );
  }
}

const aiEnabled = parseBoolean(process.env.AI_ENABLED, false);
const aiApiKey = process.env.OPENAI_API_KEY?.trim();

if (aiEnabled && !aiApiKey) {
  throw new Error("OPENAI_API_KEY is required when AI_ENABLED is true");
}

const normalizeBaseUrl = (value) => String(value ?? "").replace(/\/$/, "");

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePort(process.env.PORT),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  corsOrigins: Object.freeze(corsOrigins),
  emailQueue: Object.freeze({
    concurrency: parsePositiveInteger(process.env.EMAIL_QUEUE_CONCURRENCY, 2),
    retries: parsePositiveInteger(process.env.EMAIL_QUEUE_RETRIES, 3),
  }),
  rateLimit: Object.freeze({
    windowMs: parsePositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    standardLimit: parsePositiveInteger(process.env.RATE_LIMIT_STANDARD, 120),
    webhookLimit: parsePositiveInteger(process.env.RATE_LIMIT_WEBHOOK, 60),
    aiLimit: parsePositiveInteger(process.env.RATE_LIMIT_AI, 20),
  }),
  webhook: Object.freeze({
    secret: process.env.WEBHOOK_SECRET,
    maxAgeMs: parsePositiveInteger(
      process.env.WEBHOOK_MAX_AGE_MS,
      5 * 60 * 1000,
    ),
  }),
  email: Object.freeze({
    host: process.env.EMAIL_HOST ?? "smtp.sendgrid.net",
    port: parsePort(process.env.EMAIL_PORT, 587),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME ?? "AI CRM",
  }),
  inboundEmail: Object.freeze({
    sendGridToken: process.env.SENDGRID_INBOUND_TOKEN?.trim() || null,
    maxBodyLength: parsePositiveInteger(
      process.env.INBOUND_EMAIL_MAX_BODY_LENGTH,
      100_000,
    ),
  }),
  followUp: Object.freeze({
    defaultDelaysHours: Object.freeze([48, 168, 336]),
  }),
  worker: Object.freeze({
    pollIntervalMs: parsePositiveInteger(
      process.env.WORKER_POLL_INTERVAL_MS,
      15_000,
    ),
    leaseSeconds: parsePositiveInteger(process.env.WORKER_LEASE_SECONDS, 120),
    concurrency: parsePositiveInteger(process.env.WORKER_CONCURRENCY, 2, 20),
  }),
  ai: Object.freeze({
    enabled: aiEnabled,
    baseUrl: normalizeBaseUrl(
      process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    ),
    apiKey: aiApiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: parsePositiveInteger(process.env.AI_TIMEOUT_MS, 20_000),
  }),
});
