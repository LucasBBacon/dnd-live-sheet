import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export const globalErrorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation Failed",
      details: err.flatten(),
    });
  }
};
