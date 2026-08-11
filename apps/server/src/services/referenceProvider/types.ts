import type { RuleSnapshot } from "@project/shared";

export type ScopedContext = {
  campaignId?: string;
  characterId?: string;
};

export type TraitCategory = "skills" | "tools_and_languages";

export type RulesSnapshotPayload = Pick<
  RuleSnapshot,
  "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
>;

export type LevelUpOptionsInput = {
  scope: ScopedContext;
  classId?: string | undefined;
  subclassId?: string | undefined;
  currentClassLevel: number;
};

export type SearchItemsInput = {
  scope: ScopedContext;
  query: string;
  limit: number;
  offset: number;
};

export type ReferenceProvider = {
  source: "static" | "db";
  warm: () => Promise<void>;
  getRaces: (scope: ScopedContext) => Promise<unknown[]>;
  getClasses: (scope: ScopedContext) => Promise<unknown[]>;
  getFeats: (scope: ScopedContext) => Promise<unknown[]>;
  getLevelUpOptions: (input: LevelUpOptionsInput) => Promise<{
    classes: unknown[];
    feats: unknown[];
    subclasses: unknown[];
    timeline: unknown[];
    nextLevel: unknown | null;
    supportByClass: Record<string, unknown>;
    selected: {
      classId: string | null;
      subclassId: string | null;
    };
  }>;
  getSubclasses: (scope: ScopedContext, classId: string) => Promise<unknown[]>;
  getClassTimeline: (
    scope: ScopedContext,
    classId: string,
    requestedSubclassId?: string,
  ) => Promise<unknown[]>;
  getBackgrounds: (scope: ScopedContext) => Promise<unknown[]>;
  getTraits: (
    scope: ScopedContext,
    category?: TraitCategory,
  ) => Promise<unknown[]>;
  getTraitById: (scope: ScopedContext, traitId: string) => Promise<unknown | null>;
  getVersion: () => Promise<{ version: number; loadedAt: number }>;
  searchItems: (
    input: SearchItemsInput,
  ) => Promise<{ rows: unknown[]; total: number }>;
  getRulesSnapshot: (scope: ScopedContext) => Promise<{
    version: number;
    loadedAt: number;
    snapshot: RulesSnapshotPayload | unknown;
  }>;
};
