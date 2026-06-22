import type { Request } from "express";

// define the strict contract app expects from provider
export interface AuthenticatedUser {
  id: string;
  // TODO: roles, subscription tiers ;) , etc...
}

export interface AuthProvider {
  authenticate(req: Request): Promise<AuthenticatedUser | null>;
}
