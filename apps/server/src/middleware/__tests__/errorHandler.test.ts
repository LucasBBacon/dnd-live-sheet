import { describe, expect, it, beforeEach, vi } from "vitest";
import { globalErrorHandler } from "../errorHandler";
import { ZodError } from "zod";

describe("Error Handler Middleware", () => {
  let res: any;
  let next: any;

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
    // Mock console.error to avoid spam in test output
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns 500 for standard Error", () => {
    const err = new Error("Test error message");
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });

  it("logs error details to console", () => {
    const err = new Error("Test error") as any;
    err.cause = "root cause";
    const req = { method: "POST", path: "/api/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[Error] POST /api/test"),
      expect.any(Object),
    );
  });

  it("includes error name and message in logging", () => {
    const err = new Error("Something went wrong");
    const req = { method: "GET", path: "/path" } as any;

    globalErrorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: "Error",
        message: "Something went wrong",
      }),
    );
  });

  it("includes cause in logging when present", () => {
    const err = new Error("Wrapped error") as any;
    err.cause = "Original error";
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cause: "Original error",
      }),
    );
  });

  it("handles ZodError with 400 status", () => {
    const zodErr = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        path: ["name"],
        message: "Expected string, received number",
      } as any,
    ]);
    const req = { method: "POST", path: "/api/data" } as any;

    globalErrorHandler(zodErr, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Validation Failed",
        details: expect.any(Object),
      }),
    );
  });

  it("returns development error message in dev mode", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const err = new Error("Dev error message");
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Dev error message",
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it("returns generic error message in production mode", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const err = new Error("Sensitive error");
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Unexpected failure while processing request.",
      }),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it("always calls json response", () => {
    const err = new Error("Test");
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(res.json).toHaveBeenCalled();
  });

  it("chains status and json calls", () => {
    const err = new Error("Test");
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledBefore(res.json as any);
  });

  it("handles errors with custom cause object", () => {
    const err = new Error("Main error") as any;
    err.cause = { details: "Some details", code: "ERR_001" };
    const req = { method: "POST", path: "/api/users" } as any;

    globalErrorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cause: { details: "Some details", code: "ERR_001" },
      }),
    );
  });

  it("ignores cause if error object malformed", () => {
    const err = { message: "Malformed" };
    const req = { method: "GET", path: "/test" } as any;

    globalErrorHandler(err as any, req, res, next);

    expect(console.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cause: undefined,
      }),
    );
  });
});
