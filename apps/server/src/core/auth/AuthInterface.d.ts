import type { Request } from "express";
export interface AuthenticatedUser {
    id: string;
}
export interface AuthProvider {
    authenticate(req: Request): Promise<AuthenticatedUser | null>;
}
//# sourceMappingURL=AuthInterface.d.ts.map