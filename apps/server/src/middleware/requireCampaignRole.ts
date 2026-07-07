import { db } from "@project/database";
import { campaignMembers } from "@project/database/src/schema/operational.js";
import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

type CampaignRole = "owner" | "dm" | "player";

type CampaignRoleGuardOptions = {
  resolveCampaignId: (req: Request) => string | undefined;
  allowedRoles?: CampaignRole[];
};

export const createCampaignRoleGuard = ({
  resolveCampaignId,
  allowedRoles = ["owner", "dm"],
}: CampaignRoleGuardOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    const campaignId = resolveCampaignId(req);
    if (!campaignId) {
      return res.status(400).json({ error: "campaignId is required." });
    }

    const [membership] = await db
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(
        and(
          eq(campaignMembers.userId, userId),
          eq(campaignMembers.campaignId, campaignId),
        ),
      )
      .limit(1);

    if (!membership) {
      return res.status(403).json({ error: "Forbidden campaign access." });
    }

    if (!allowedRoles.includes(membership.role)) {
      return res.status(403).json({
        error: "Insufficient campaign role for this action.",
      });
    }

    return next();
  };
};
