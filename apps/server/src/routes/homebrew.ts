import { db } from "@project/database";
import { characters } from "@project/database/src/schema/operational.js";
import { items, traits } from "@project/database/src/schema/reference.js";
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

// #region Homebrew Utilities

/**
 * Resolves the campaignId from the request body if it exists and is a string.
 * @param req - The Express request object.
 * @returns The campaignId if it exists and is a string, otherwise undefined.
 */
const resolveCampaignIdFromBody = (req: {
  body?: { campaignId?: unknown };
}): string | undefined =>
  typeof req.body?.campaignId === "string" ? req.body.campaignId : undefined;

  /**
   * Creates a middleware that requires the user to have a specific role in the campaign.
   * @param options - The options for the middleware.
   * @param options.resolveCampaignId - A function that resolves the campaignId from the request.
   * @param options.allowedRoles - An array of roles that are allowed to access the route.
   * @returns An Express middleware function that checks if the user has the required role in the campaign.
   */
const requireCampaignAuthorRole = createCampaignRoleGuard({
  resolveCampaignId: (req) => resolveCampaignIdFromBody(req),
  allowedRoles: ["owner", "dm"],
});

/**
 * Ensures that the provided ownerCharacterId belongs to the specified campaignId.
 * @param ownerCharacterId - The ID of the character to check.
 * @param campaignId - The ID of the campaign to check against.
 * @throws An error if the ownerCharacterId does not belong to the specified campaignId.
 */
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

/**
 * Validates that the provided value is a non-empty string and returns it.
 * @param value - The value to validate.
 * @param name - The name of the parameter for error messaging.
 * @throws An error if the value is not a non-empty string.
 * @returns The validated string value.
 */
const getRequiredParam = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} route param is required.`);
  }
  return value;
};

/**
 * Normalizes the lore object to ensure that it always has a shortDescription and optionally a fullText.
 * @param lore - The lore object to normalize.
 * @returns An object containing the normalized lore with shortDescription and optional fullText.
 */
const normalizeLore = (lore: {
  shortDescription: string;
  fullText?: string | undefined;
}): { shortDescription: string; fullText?: string } =>
  lore.fullText === undefined
    ? { shortDescription: lore.shortDescription }
    : { shortDescription: lore.shortDescription, fullText: lore.fullText };

/**
 * Validates that the provided supersedesId (if any) references a valid trait in the same campaign or core traits.
 * @param supersedesId - The ID of the trait that this one supersedes, if applicable.
 * @param campaignId - The ID of the campaign to check against.
 * @throws An error if the supersedesId does not reference a valid trait in the same campaign or core traits.
 */
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

  // target trait validation
  const validTarget =
    target.sourceType === "core" || target.ownerCampaignId === campaignId;
  if (!validTarget) {
    throw new Error(
      "supersedesId must reference core or same-campaign homebrew.",
    );
  }
};

/**
 * Validates that the provided supersedesId (if any) references a valid item in the same campaign or core items.
 * @param supersedesId - The ID of the item that this one supersedes, if applicable.
 * @param campaignId - The ID of the campaign to check against.
 * @returns A promise that resolves if the supersedesId is valid, or rejects with an error if it is not.
 */
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
    throw new Error(
      "supersedesId must reference core or same-campaign homebrew.",
    );
  }
};

// #endregion

// #region POST /api/homebrew/traits

/**
 * POST /api/homebrew/traits
 * Creates a new homebrew trait for the specified campaign.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 * Validates that the ownerCharacterId (if provided) belongs to the campaign.
 * Validates that the supersedesId (if provided) references a valid trait in the same campaign or core traits.
 */
router.post("/traits", requireCampaignAuthorRole, async (req, res, next) => {
  try {
    // generate a new UUID for the trait and validate the request body against the schema
    const payload = CreateHomebrewTraitSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    // validate that the ownerCharacterId belongs to campaign,
    // and that the supersedesId references a valid trait in the same campaign (or in core traits)
    await ensureCharacterScopeBelongsToCampaign(
      payload.ownerCharacterId,
      payload.campaignId,
    );
    await validateSupersedesTraitScope(
      payload.supersedesId,
      payload.campaignId,
    );

    // check if the trait ID already exists in db
    const [existing] = await db
      .select({ id: traits.id })
      .from(traits)
      .where(eq(traits.id, payload.id))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: "Trait id already exists." });
    }

    // insert the new trait into the database
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

    // invalidate the reference cache so that the new trait is included in future queries
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

// #endregion

// #region PATCH /api/homebrew/traits/:id

/**
 * PATCH /api/homebrew/traits/:id
 * Updates an existing homebrew trait for the specified campaign.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 * Validates that the ownerCharacterId (if provided) belongs to the campaign.
 * Validates that the supersedesId (if provided) references a valid trait in the same campaign or core traits.
 */
router.patch(
  "/traits/:id",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      // validate the request body against the schema and extract the traitId from the route parameters
      const payload = UpdateHomebrewTraitSchema.parse(req.body);
      const traitId = getRequiredParam(req.params.id, "traitId");

      // prepare the updates object with only the fields that are provided in the request body
      const updates: Partial<typeof traits.$inferInsert> = {};
      if (payload.name !== undefined) updates.name = payload.name;
      if (payload.lore !== undefined)
        updates.lore = normalizeLore(payload.lore);
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

      // if no mutable fields are provided, return a 400 error
      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ error: "At least one mutable field is required." });
      }

      // validate that the ownerCharacterId belongs to campaign,
      // and that the supersedesId references a valid trait in the same campaign (or in core traits)
      await ensureCharacterScopeBelongsToCampaign(
        payload.ownerCharacterId,
        payload.campaignId,
      );
      await validateSupersedesTraitScope(
        payload.supersedesId,
        payload.campaignId,
      );

      // update the trait in the database and return the updated trait ID
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

        // if no rows were updated, return a 404 error indicating that the trait was not found
      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew trait not found." });
      }

      // invalidate the reference cache so that the updated trait is reflected in future queries
      invalidateReferenceCache();
      return res.status(200).json({ success: true, traitId });
    } catch (error) {
      next(error);
    }
  },
);

// #endregion

// #region POST /api/homebrew/traits/:id/publish

/**
 * POST /api/homebrew/traits/:id/publish
 * 
 * Publishes an existing homebrew trait for the specified campaign, making it available for use.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 * Validates that the trait exists and belongs to the specified campaign.
 * Invalidates the reference cache so that the published trait is reflected in future queries.
 */
router.post(
  "/traits/:id/publish",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      // validate the request body against the schema and extract the traitId from the route parameters
      // update the trait in the db to set isPublished to true, and return the updated trait ID
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

      // if no rows were updated, return a 404 error indicating that the trait was not found
      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew trait not found." });
      }

      // invalidate the reference cache so that the published trait is reflected in future queries
      invalidateReferenceCache();
      return res.status(200).json({ success: true, traitId });
    } catch (error) {
      next(error);
    }
  },
);

// #endregion

// #region POST /api/homebrew/traits/:id/archive

/**
 * POST /api/homebrew/traits/:id/archive
 * 
 * Archives an existing homebrew trait for the specified campaign, making it unavailable for use.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 * Validates that the trait exists and belongs to the specified campaign.
 * Invalidates the reference cache so that the archived trait is reflected in future queries.
 */
router.post(
  "/traits/:id/archive",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      // validate the request body against the schema and extract the traitId from the route parameters
      // update the trait in the db to set isPublished to false, and return the updated trait ID
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

      // if no rows were updated, return a 404 error indicating that the trait was not found
      if (updated.length === 0) {
        return res.status(404).json({ error: "Homebrew trait not found." });
      }

      // invalidate the reference cache so that the archived trait is reflected in future queries
      invalidateReferenceCache();
      return res.status(200).json({ success: true, traitId });
    } catch (error) {
      next(error);
    }
  },
);

// #endregion

// #region POST /api/homebrew/items

/**
 * POST /api/homebrew/items
 * 
 * Creates a new homebrew item for the specified campaign.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 */
router.post("/items", requireCampaignAuthorRole, async (req, res, next) => {
  try {
    // validate the request body against the schema and extract the userId from the request
    const payload = CreateHomebrewItemSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized request" });
    }

    // validate that the ownerCharacterId belongs to campaign,
    // and that the supersedesId references a valid item in the same campaign (or in core items)
    await ensureCharacterScopeBelongsToCampaign(
      payload.ownerCharacterId,
      payload.campaignId,
    );
    await validateSupersedesItemScope(payload.supersedesId, payload.campaignId);

    // check if the item ID already exists in db
    const [existing] = await db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.id, payload.id))
      .limit(1);
    if (existing) {
      return res.status(409).json({ error: "Item id already exists." });
    }

    // insert the new item into the database
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

    // invalidate the reference cache so that the new item is included in future queries
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

// #endregion

// #region PATCH /api/homebrew/items/:id

/**
 * PATCH /api/homebrew/items/:id
 * 
 * Updates an existing homebrew item for the specified campaign.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 */
router.patch(
  "/items/:id",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      // validate the request body against the schema and extract the itemId from the route parameters
      const payload = UpdateHomebrewItemSchema.parse(req.body);
      const itemId = getRequiredParam(req.params.id, "itemId");
      const updates: Partial<typeof items.$inferInsert> = {};
      if (payload.name !== undefined) updates.name = payload.name;
      if (payload.weight !== undefined) updates.weight = payload.weight;
      if (payload.description !== undefined)
        updates.description = payload.description;
      if (payload.isBundle !== undefined) updates.isBundle = payload.isBundle;
      if (payload.ownerCharacterId !== undefined) {
        updates.ownerCharacterId = payload.ownerCharacterId;
      }
      if (payload.supersedesId !== undefined) {
        updates.supersedesId = payload.supersedesId;
      }

      // if no mutable fields are provided, return a 400 error
      if (Object.keys(updates).length === 0) {
        return res
          .status(400)
          .json({ error: "At least one mutable field is required." });
      }

      // validate that the ownerCharacterId belongs to campaign,
      // and that the supersedesId references a valid item in the same campaign (or in core items)
      await ensureCharacterScopeBelongsToCampaign(
        payload.ownerCharacterId,
        payload.campaignId,
      );
      await validateSupersedesItemScope(
        payload.supersedesId,
        payload.campaignId,
      );

      // update the item in the database and return the updated item ID
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

      // invalidate the reference cache so that the updated item is reflected in future queries
      invalidateReferenceCache();
      return res.status(200).json({ success: true, itemId });
    } catch (error) {
      next(error);
    }
  },
);

// #endregion

// #region POST /api/homebrew/items/:id/publish

/**
 * POST /api/homebrew/items/:id/publish
 * 
 * Publishes an existing homebrew item for the specified campaign, making it available for use.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 */
router.post(
  "/items/:id/publish",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      // validate the request body against the schema and extract the itemId from the route parameters
      // update the item in the db to set isPublished to true, and return the updated item ID
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

      // invalidate the reference cache so that the published item is reflected in future queries
      invalidateReferenceCache();
      return res.status(200).json({ success: true, itemId });
    } catch (error) {
      next(error);
    }
  },
);

// #endregion

// #region POST /api/homebrew/items/:id/archive

/**
 * POST /api/homebrew/items/:id/archive
 * 
 * Archives an existing homebrew item for the specified campaign, making it unavailable for use.
 * Requires the user to have the "owner" or "dm" role in the campaign.
 */

router.post(
  "/items/:id/archive",
  requireCampaignAuthorRole,
  async (req, res, next) => {
    try {
      // validate the request body against the schema and extract the itemId from the route parameters
      // update the item in the db to set isPublished to false, and return the updated item ID
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
      
      // invalidate the reference cache so that the archived item is reflected in future queries
      invalidateReferenceCache();
      return res.status(200).json({ success: true, itemId });
    } catch (error) {
      next(error);
    }
  },
);

// #endregion

export default router;
