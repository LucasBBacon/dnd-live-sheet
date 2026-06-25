import type { Request } from "express";
import type { AuthenticatedUser, AuthProvider } from "./AuthInterface.js";
export declare class MockAuthProvider implements AuthProvider {
    authenticate(req: Request): Promise<AuthenticatedUser | null>;
}
//# sourceMappingURL=MockAuthProvider.d.ts.map