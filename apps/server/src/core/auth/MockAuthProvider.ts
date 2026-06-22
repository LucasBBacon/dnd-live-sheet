import type { Request } from "express";
import type { AuthenticatedUser, AuthProvider } from "./AuthInterface.js";

export class MockAuthProvider implements AuthProvider {
  async authenticate(req: Request): Promise<AuthenticatedUser | null> {
    // trust the header for testing...
    const testerId = req.headers["x-tester-id"];

    if (typeof testerId !== "string") {
      return null;
    }

    return { id: testerId };
  }
}
