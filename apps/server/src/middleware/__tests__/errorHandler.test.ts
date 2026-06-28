import { describe, expect, it, beforeEach, vi } from "vitest";
import { errorHandler } from "../../errorHandler";

describe("Error Handler Middleware", () => {
  let res: any;
  let next: any;

  beforeEach(() => {
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it("handles standard Error with message", () => {
    const err = new Error("Test error message");
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Test error message",
      })
    );
  });

  it("handles errors with custom status code", () => {
    const err = new Error("Not found") as any;
    err.statusCode = 404;
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("defaults to 500 status code when none specified", () => {
    const err = new Error("Generic error");
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("handles null error gracefully", () => {
    errorHandler(null, {}, res, next);

    expect(res.status).toHaveBeenCalled();
  });

  it("handles error without message", () => {
    const err = {} as any;
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("handles 400 Bad Request errors", () => {
    const err = new Error("Validation failed") as any;
    err.statusCode = 400;
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles 401 Unauthorized errors", () => {
    const err = new Error("Unauthorized") as any;
    err.statusCode = 401;
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("handles 403 Forbidden errors", () => {
    const err = new Error("Forbidden") as any;
    err.statusCode = 403;
    const req = {} as any;

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("always calls json response", () => {
    const err = new Error("Test");
    errorHandler(err, {}, res, next);

    expect(res.json).toHaveBeenCalled();
  });
});
