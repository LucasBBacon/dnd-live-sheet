import { db } from "@project/database";
import { campaignMembers } from "@project/database/src/schema/operational.js";
import { and, eq } from "drizzle-orm";
import type { Socket } from "socket.io";

export type CampaignRole = "owner" | "dm" | "player";

type UserCarrier = {
  user?: { id?: string };
  headers: Record<string, unknown>;
};

export const getHeaderOrAuthUserId = (
  carrier: UserCarrier,
): string | undefined => {
  if (typeof carrier.user?.id === "string") {
    return carrier.user.id;
  }

  const headerUserId = carrier.headers["x-tester-id"];
  return typeof headerUserId === "string" ? headerUserId : undefined;
};

export const getUserIdFromSocket = (socket: Socket): string | undefined => {
  const authUserId =
    typeof socket.handshake.auth?.userId === "string"
      ? socket.handshake.auth.userId
      : undefined;

  if (authUserId) {
    return authUserId;
  }

  const headerUserId = socket.handshake.headers["x-tester-id"];
  return typeof headerUserId === "string" ? headerUserId : undefined;
};

export const getCampaignMembershipRole = async (
  userId: string,
  campaignId: string,
): Promise<CampaignRole | null> => {
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

  return (membership?.role as CampaignRole | undefined) ?? null;
};

export const isUserCampaignMember = async (
  userId: string,
  campaignId: string,
): Promise<boolean> => {
  const role = await getCampaignMembershipRole(userId, campaignId);
  return role !== null;
};
