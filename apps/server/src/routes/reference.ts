import { Router, type Router as ExpressRouter } from "express";
import {
  getHeaderOrAuthUserId,
  isUserCampaignMember,
} from "../services/campaignAccess.js";
import { getReferenceProvider } from "../services/referenceProvider/index.js";
import type { TraitCategory } from "../services/referenceProvider/types.js";

const router: ExpressRouter = Router();

type ScopedContext = {
  campaignId?: string;
  characterId?: string;
};

const requireScopedAccessIfPresent = async (
  req: {
    query: Record<string, unknown>;
    user?: { id?: string };
    headers: Record<string, unknown>;
  },
  res: {
    status: (code: number) => { json: (body: unknown) => unknown };
  },
): Promise<{ ok: true; scope: ScopedContext } | { ok: false }> => {
  const campaignId =
    typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
  const characterId =
    typeof req.query.characterId === "string"
      ? req.query.characterId
      : undefined;

  if (!campaignId && characterId) {
    res.status(400).json({
      error: "characterId scoped reads require campaignId context.",
    });
    return { ok: false };
  }

  if (!campaignId) return { ok: true, scope: {} };

  const userId = getHeaderOrAuthUserId(req);
  if (!userId) {
    res.status(401).json({ error: "campaignId scoped reads require auth." });
    return { ok: false };
  }

  const hasAccess = await isUserCampaignMember(userId, campaignId);
  if (!hasAccess) {
    res.status(403).json({ error: "Forbidden campaign access." });
    return { ok: false };
  }

  return {
    ok: true,
    scope: characterId ? { campaignId, characterId } : { campaignId },
  };
};

router.get("/races", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const provider = getReferenceProvider();
    const races = await provider.getRaces(scoped.scope);
    return res.status(200).json({ races });
  } catch (error) {
    next(error);
  }
});

router.get("/classes", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const provider = getReferenceProvider();
    const classes = await provider.getClasses(scoped.scope);
    return res.status(200).json({ classes });
  } catch (error) {
    next(error);
  }
});

router.get("/feats", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const provider = getReferenceProvider();
    const feats = await provider.getFeats(scoped.scope);
    return res.status(200).json({ feats });
  } catch (error) {
    next(error);
  }
});

router.get("/level-up/options", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const classId =
      typeof req.query.classId === "string" ? req.query.classId : undefined;
    const subclassId =
      typeof req.query.subclassId === "string"
        ? req.query.subclassId
        : undefined;
    const currentClassLevelRaw =
      typeof req.query.currentClassLevel === "string"
        ? Number.parseInt(req.query.currentClassLevel, 10)
        : 0;
    const currentClassLevel = Number.isFinite(currentClassLevelRaw)
      ? Math.max(0, currentClassLevelRaw)
      : 0;

    if (!classId && subclassId) {
      return res.status(400).json({
        error: "subclassId requires classId context.",
      });
    }

    const provider = getReferenceProvider();
    const payload = await provider.getLevelUpOptions({
      scope: scoped.scope,
      ...(classId !== undefined ? { classId } : {}),
      ...(subclassId !== undefined ? { subclassId } : {}),
      currentClassLevel,
    });

    return res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

router.get("/classes/:id/subclasses", async (req, res, next) => {
  try {
    const classId = req.params.id;
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const provider = getReferenceProvider();
    const subclasses = await provider.getSubclasses(scoped.scope, classId);
    return res.status(200).json({ subclasses });
  } catch (error) {
    next(error);
  }
});

router.get("/classes/:id/timeline", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const classId = req.params.id;
    const requestedSubclassId =
      typeof req.query.subclassId === "string"
        ? req.query.subclassId
        : undefined;

    const provider = getReferenceProvider();
    const timeline = await provider.getClassTimeline(
      scoped.scope,
      classId,
      requestedSubclassId,
    );

    return res.status(200).json({ timeline });
  } catch (error) {
    next(error);
  }
});

router.get("/backgrounds", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const provider = getReferenceProvider();
    const backgrounds = await provider.getBackgrounds(scoped.scope);
    return res.status(200).json({ backgrounds });
  } catch (error) {
    next(error);
  }
});

router.get("/traits", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const categoryRaw =
      typeof req.query.category === "string" ? req.query.category : undefined;

    if (
      categoryRaw !== undefined &&
      categoryRaw !== "skills" &&
      categoryRaw !== "tools_and_languages"
    ) {
      return res.status(400).json({
        error: "Invalid trait category. Use 'skills' or 'tools_and_languages'.",
      });
    }

    const category = categoryRaw as TraitCategory | undefined;
    const provider = getReferenceProvider();
    const traits = await provider.getTraits(scoped.scope, category);

    return res.status(200).json({ traits });
  } catch (error) {
    next(error);
  }
});

router.get("/traits/:id", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const traitId = req.params.id;
    const provider = getReferenceProvider();
    const trait = await provider.getTraitById(scoped.scope, traitId);

    if (!trait) {
      return res.status(404).json({ error: "Reference data not found" });
    }

    return res.status(200).json({ trait });
  } catch (error) {
    next(error);
  }
});

router.get("/version", async (_req, res, next) => {
  try {
    const provider = getReferenceProvider();
    const version = await provider.getVersion();

    return res.status(200).json(version);
  } catch (error) {
    next(error);
  }
});

router.get("/items", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const searchString =
      typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const provider = getReferenceProvider();
    const { rows: items, total } = await provider.searchItems({
      scope: scoped.scope,
      query: searchString,
      limit,
      offset,
    });

    return res.status(200).json({
      items,
      meta: {
        count: total,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/rules/snapshot", async (req, res, next) => {
  try {
    const scoped = await requireScopedAccessIfPresent(req, res);
    if (!scoped.ok) return;

    const provider = getReferenceProvider();
    const payload = await provider.getRulesSnapshot(scoped.scope);

    return res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

export default router;