import { db } from "@project/database";
import { characters } from "@project/database/src/schema/operational.js";
import {
  items,
  traits,
} from "@project/database/src/schema/reference.js";
import {
  CreateHomebrewItemSchema,
  CreateHomebrewTraitSchema,
  HomebrewLifecycleActionSchema,
  UpdateHomebrewItemSchema,
  UpdateHomebrewTraitSchema,
} from "@project/shared";
import { and, eq } from "drizzle-orm";
import { Router, type Router as ExpressRouter } from "express";
import { createCampaignRoleGuard } from "../middleware/requireCampaignRole.js";
import { invalidateReferenceCache } from "../services/referenceCache.js";

const router: ExpressRouter = Router();

const resolveCampaignIdFromBody = (req: {
  body?: { campaignId?: unknown };
}): string | undefined =>
  typeof req.body?.campaignId === "string" ? req.body.campaignId : undefined;

const requireCampaignAuthorRole = createCampaignRoleGuard({
  resolveCampaignId: (req) => resolveCampaignIdFromBody(req),
  allowedRoles: ["owner", "dm"],
});

const ensureCharacterScopeBelongsToCampaign = async (
  ownerCharacterId: string | undefined,
  campaignId: string,
): Promise<void> => {
  if (!ownerCharacterId) return;

  const [character] = await db
    .select({ id: characters.id })
    .from(characters)
    .where(
      and(
        eq(characters.id, ownerCharacterId),
        eq(characters.campaignId, campaignId),
      ),
    )
    .limit(1);

  if (!character) {
    throw new Error("ownerCharacterId must belong to the target campaign.");
  }
};

const getRequiredParam = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} route param is required.`);
  }
  return value;
};

const normalizeLore = (lore: {
  shortDescription: string;
  fullText?: string | undefined;
}): { shortDescription: string; fullText?: string } =>
  lore.fullText === undefined
    ? { shortDescription: lore.shortDescription }
    : { shortDescription: lore.shortDescription, fullText: lore.fullText };

const validateSupersedesTraitScope = async (
  supersedesId: string | undefined,
  campaignId: string,
): Promise<void> => {
  if (!supersedesId) return;

  const [target] = await db
    .select({
      sourceType: traits.sourceType,
      ownerCampaignId: traits.ownerCampaignId,
    })
    .from(traits)
    .where(eq(traits.id, supersedesId))
    .limit(1);

  if (!target) {
    throw new Error("supersedesId references a missing trait.");
  }

  const validTarget =
    target.sourceType === "core" || target.ownerCampaignId === campaignId;
  if (!validTarget) {
    throw new Error("supersedesId must reference core or same-campaign homebrew.");
  }
};

const validateSupersedesItemScope = async (
  supersedesId: string | undefined,
  campaignId: string,
): Promise<void> => {
  if (!supersedesId) return;

  const [target] = await db
    .select({
      sourceType: items.sourceType,
      ownerCampaignId: items.ownerCampaignId,
    })
    .from(items)
    .where(eq(items.id, supersedesId))
    .limit(1);

  if (!target) {
    throw new Error("supersedesId references a missing item.");
  }

  const validTarget =
    target.sourceType === "core" || target.ownerCampaignId === campaignId;
  if (!validTarget) {
    throw new Error("supersedesId must reference core or same-campaign homebrew.");
  }
};

router.post("/traits", requireCampaignAuthorRole, async (req, res, next) => {
  try {
    const payload = CreateHomebrewTraitSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    await ensureCharacterScopeBelongsToCampaign(
      payload.ownerCharacterId,
      payload.campaignId,
    );
    await validateSupersedesTraitScope(payload.supersedesId, payload.campaignId);

    const [existing] = await db
      .select({ id: traits.id })
      .from(traits)
      .where(eq(traits.id, payload.id))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: "Trait id already exists." });
    }

    const traitInsert: typeof traits.$inferInsert = {
      id: payload.id,
      name: payload.name,
      lore: normalizeLore(payload.lore),
      effects: payload.effects,
      isStartingProficiency: payload.isStartingProficiency ?? false,
      sourceType: "homebrew",
      ownerCampaignId: payload.campaignId,
      createdByUserId: userId,
      isPublished: false,
      ...(payload.ownerCharacterId !== undefined
        ? { ownerCharacterId: payload.ownerCharacterId }
        : {}),
      ...(payload.supersedesId !== undefined
        ? { supersedesId: payload.supersedesId }
        : {}),
    };
    await db.insert(traits).values(traitInsert);

    invalidateReferenceCache();
    return res.status(201).json({
      success: true,
      traitId: payload.id,
      message: "Homebrew trait created.",
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/traits/:id",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      const payload = UpdateHomebrewTraitSchema.parse(req.body);
      const traitId = getRequiredParam(req.params.id, "traitId");

      const updates: Partial<typeof traits.$inferInsert> = {};
      if (payload.name !== undefined) updates.name = payload.name;
      if (payload.lore !== undefined) updates.lore = normalizeLore(payload.lore);
      if (payload.effects !== undefined) updates.effects = payload.effects;
      if (payload.isStartingProficiency !== undefined) {
        updates.isStartingProficiency = payload.isStartingProficiency;
      }
      if (payload.ownerCharacterId !== undefined) {
        updates.ownerCharacterId = payload.ownerCharacterId;
      }
      if (payload.supersedesId !== undefined) {
        updates.supersedesId = payload.supersedesId;
      }

      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ error: "At least one mutable field is required." });
      }

      await ensureCharacterScopeBelongsToCampaign(
        payload.ownerCharacterId,
        payload.campaignId,
      );
      await validateSupersedesTraitScope(
        payload.supersedesId,
        payload.campaignId,
      );

      const updated = await db
        .update(traits)
        .set(updates)
        .where(
          and(
            eq(traits.id, traitId),
            eq(traits.sourceType, "homebrew"),
            eq(traits.ownerCampaignId, payload.campaignId),
          ),
        )
        .returning({ id: traits.id });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew trait not found." });
      }

      invalidateReferenceCache();
      return res.status(200).json({ success: true, traitId });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/traits/:id/publish",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      const payload = HomebrewLifecycleActionSchema.parse(req.body);
      const traitId = getRequiredParam(req.params.id, "traitId");
      const updated = await db
        .update(traits)
        .set({ isPublished: true })
        .where(
          and(
            eq(traits.id, traitId),
            eq(traits.sourceType, "homebrew"),
            eq(traits.ownerCampaignId, payload.campaignId),
          ),
        )
        .returning({ id: traits.id });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew trait not found." });
      }

      invalidateReferenceCache();
      return res.status(200).json({ success: true, traitId });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/traits/:id/archive",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      const payload = HomebrewLifecycleActionSchema.parse(req.body);
      const traitId = getRequiredParam(req.params.id, "traitId");
      const updated = await db
        .update(traits)
        .set({ isPublished: false })
        .where(
          and(
            eq(traits.id, traitId),
            eq(traits.sourceType, "homebrew"),
            eq(traits.ownerCampaignId, payload.campaignId),
          ),
        )
        .returning({ id: traits.id });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew trait not found." });
      }

      invalidateReferenceCache();
      return res.status(200).json({ success: true, traitId });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/items", requireCampaignAuthorRole, async (req, res, next) => {
  try {
    const payload = CreateHomebrewItemSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    await ensureCharacterScopeBelongsToCampaign(
      payload.ownerCharacterId,
      payload.campaignId,
    );
    await validateSupersedesItemScope(payload.supersedesId, payload.campaignId);

    const [existing] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, payload.id))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: "Item id already exists." });
    }

    const itemInsert: typeof items.$inferInsert = {
      id: payload.id,
      name: payload.name,
      weight: payload.weight,
      description: payload.description,
      isBundle: payload.isBundle ?? false,
      sourceType: "homebrew",
      ownerCampaignId: payload.campaignId,
      createdByUserId: userId,
      isPublished: false,
      ...(payload.ownerCharacterId !== undefined
        ? { ownerCharacterId: payload.ownerCharacterId }
        : {}),
      ...(payload.supersedesId !== undefined
        ? { supersedesId: payload.supersedesId }
        : {}),
    };
    await db.insert(items).values(itemInsert);

    invalidateReferenceCache();
    return res.status(201).json({
      success: true,
      itemId: payload.id,
      message: "Homebrew item created.",
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/items/:id", requireCampaignAuthorRole, async (req, res, next) => {
  try {
    const payload = UpdateHomebrewItemSchema.parse(req.body);
    const itemId = getRequiredParam(req.params.id, "itemId");
    const updates: Partial<typeof items.$inferInsert> = {};
    if (payload.name !== undefined) updates.name = payload.name;
    if (payload.weight !== undefined) updates.weight = payload.weight;
    if (payload.description !== undefined) updates.description = payload.description;
    if (payload.isBundle !== undefined) updates.isBundle = payload.isBundle;
    if (payload.ownerCharacterId !== undefined) {
      updates.ownerCharacterId = payload.ownerCharacterId;
    }
    if (payload.supersedesId !== undefined) {
      updates.supersedesId = payload.supersedesId;
    }

    if (Object.keys(updates).length === 0) {
      return res
        .status(400)
        .json({ error: "At least one mutable field is required." });
    }

    await ensureCharacterScopeBelongsToCampaign(
      payload.ownerCharacterId,
      payload.campaignId,
    );
    await validateSupersedesItemScope(payload.supersedesId, payload.campaignId);

    const updated = await db
      .update(items)
      .set(updates)
      .where(
        and(
          eq(items.id, itemId),
          eq(items.sourceType, "homebrew"),
          eq(items.ownerCampaignId, payload.campaignId),
        ),
      )
      .returning({ id: items.id });

    if (updated.length === 0) {
      return res.status(404).json({ error: "Homebrew item not found." });
    }

    invalidateReferenceCache();
    return res.status(200).json({ success: true, itemId });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/items/:id/publish",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      const payload = HomebrewLifecycleActionSchema.parse(req.body);
      const itemId = getRequiredParam(req.params.id, "itemId");
      const updated = await db
        .update(items)
        .set({ isPublished: true })
        .where(
          and(
            eq(items.id, itemId),
            eq(items.sourceType, "homebrew"),
            eq(items.ownerCampaignId, payload.campaignId),
          ),
        )
        .returning({ id: items.id });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew item not found." });
      }

      invalidateReferenceCache();
      return res.status(200).json({ success: true, itemId });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/items/:id/archive",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      const payload = HomebrewLifecycleActionSchema.parse(req.body);
      const itemId = getRequiredParam(req.params.id, "itemId");
      const updated = await db
        .update(items)
        .set({ isPublished: false })
        .where(
          and(
            eq(items.id, itemId),
            eq(items.sourceType, "homebrew"),
            eq(items.ownerCampaignId, payload.campaignId),
          ),
        )
        .returning({ id: items.id });

      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew item not found." });
      }

      invalidateReferenceCache();
      return res.status(200).json({ success: true, itemId });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
