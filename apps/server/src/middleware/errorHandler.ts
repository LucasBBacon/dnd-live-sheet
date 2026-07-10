import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

type StatusCodeError = Error & { statusCode?: number };

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const cause =
    err && typeof err === "object" && "cause" in err
      ? (err as { cause?: unknown }).cause
      : undefined;

  console.error(`[Error] ${req.method} ${req.path}:`, {
    name: err.name,
    message: err.message,
    cause,
  });

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation Failed",
      details: err.flatten(),
    });
  }

  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as StatusCodeError).statusCode === "number"
  ) {
    return res.status((err as StatusCodeError).statusCode!).json({
      error: err.name,
      message: err.message,
    });
  }

  return res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Unexpected failure while processing request.",
  });
};
