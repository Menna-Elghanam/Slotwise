import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { reportError } from "./error-tracking.js";

/** An expected error whose message is safe to show to the client. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
};

// Express recognises an error handler only by its 4 parameters, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Controllers call `schema.parse(req.body)`; invalid input lands here.
  if (err instanceof z.ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: z.flattenError(err).fieldErrors,
      },
    });
    return;
  }

  // Unexpected error: log and report the details, but never leak them to the client.
  req.log.error({ err }, "Unhandled error");
  reportError(err, { method: req.method, path: req.path });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
};
