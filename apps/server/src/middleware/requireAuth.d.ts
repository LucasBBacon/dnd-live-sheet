import type { NextFunction, Request, Response } from "express";
import type { AuthProvider } from "../core/auth/AuthInterface.js";
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
            };
        }
    }
}
export declare const createAuthMiddleware: (provider: AuthProvider) => (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=requireAuth.d.ts.map