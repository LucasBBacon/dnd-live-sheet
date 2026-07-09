import type { NextFunction, Request, Response } from "express";
import {
  type CampaignRole,
  getCampaignMembershipRole,
} from "../services/campaignAccess.js";

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

    const role = await getCampaignMembershipRole(userId, campaignId);

    if (!role) {
      return res.status(403).json({ error: "Forbidden campaign access." });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        error: "Insufficient campaign role for this action.",
      });
    }

    return next();
  };
};
