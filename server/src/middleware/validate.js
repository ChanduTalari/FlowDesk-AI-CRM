import { AppError } from "../errors/AppError.js";

export const validate =
  (schema, source = "body") =>
  (req, res, next) => {
    const result = schema.validate(req[source] ?? {}, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (result.error) {
      const details = result.error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return next(
        new AppError(
          `${source} validation failed`,
          400,
          "VALIDATION_ERROR",
          details,
        ),
      );
    }

    req.validated ??= {};
    req.validated[source] = result.value;
    return next();
  };
