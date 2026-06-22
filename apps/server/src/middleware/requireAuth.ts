import type { NextFunction, Request, Response } from "express";
import type { AuthProvider } from "../core/auth/AuthInterface.js";

// extend express request
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

// Higher order func to inject auth provider dependency
export const createAuthMiddleware = (provider: AuthProvider) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await provider.authenticate(req);

      if (!user) {
        return res.status(401).json({ error: "Unauthorized request" });
      }

      req.user = user;
      return next();
    } catch (error) {
      console.error("Auth pipeline failure:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };
};
