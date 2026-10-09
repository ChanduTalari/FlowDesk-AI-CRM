import { AppError } from "../errors/AppError.js";

export const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export const notFoundHandler = (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "The requested endpoint was not found",
    },
  });
};

export const errorHandler = (error, req, res, _next) => {
  const invalidJson = error?.type === "entity.parse.failed";
  const status =
    error instanceof AppError ? error.statusCode : invalidJson ? 400 : 500;
  const code =
    error instanceof AppError
      ? error.code
      : invalidJson
        ? "INVALID_JSON"
        : "INTERNAL_ERROR";
  const message =
    error instanceof AppError && status < 500
      ? error.message
      : invalidJson
        ? "The request body contains invalid JSON"
        : "An unexpected server error occurred";

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, error);
  }

  res.status(status).json({
    error: {
      code,
      message,
      ...(status < 500 && error.details ? { details: error.details } : {}),
    },
  });
};
