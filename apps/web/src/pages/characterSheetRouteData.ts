import type { OperationalResource } from "@project/engine";
import {
  CharacterChoicesSchema,
  emptyCharacterChoices,
  type RuleSnapshot,
} from "@project/shared";
import { apiClient, fetchRulesSnapshot } from "../api/client";
import {
  toInventoryInstance,
  type CharacterSheetState,
} from "../store/characterSheetStore";

export type CharacterSheetPayload = {
  id: string;
  campaignId: string | null;
  level: number;
  classLevels: Record<string, number>;
  classes?: Array<{
    classId: string;
    level: number;
    subclassId: string | null;
  }>;
  raceId: string | null;
  subraceId: string | null;
  // the route spreads the whole characters row, so this already arrives
  backgroundId?: string | null;
  // characters.choices, straight off the row; parsed at this boundary
  choices?: unknown;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  // straight off the API, so slot is still an unvalidated string here
  inventory: Array<{
    id: string;
    itemId: string;
    quantity: number;
    slot: string;
    isAttuned: boolean;
    customName?: string;
  }>;
  currentHp: number;
  maxHp: number;
  resources?: OperationalResource[];
  traitGrants?: Array<{
    id: string;
    traitId: string;
    source: string;
  }>;
};

export type CharacterSheetResponse = {
  character: CharacterSheetPayload;
  ruleSnapshot: Pick<RuleSnapshot, "equipmentById" | "resourcesById"> | null;
};

export const fetchCharacterSheet = async (
  characterId: string,
): Promise<CharacterSheetResponse> => {
  const characterResponse = (await apiClient(
    `/character/${characterId}`,
  )) as { character: CharacterSheetPayload };

  const scope = {
    campaignId: characterResponse.character.campaignId,
    characterId: characterResponse.character.id,
  };

  const ruleSnapshotResponse = await fetchRulesSnapshot(scope).catch(() => null);

  return {
    character: characterResponse.character,
    ruleSnapshot: ruleSnapshotResponse?.snapshot ?? null,
  };
};

export const hydrateCharacterSheet = (
  initializeStore: CharacterSheetState["initialize"],
  character: CharacterSheetPayload,
) => {
  const storedChoices = CharacterChoicesSchema.safeParse(character.choices ?? {});
  if (!storedChoices.success) {
    console.error(
      `Stored choices for character ${character.id} failed to parse; treating them as empty.`,
      storedChoices.error.issues,
    );
  }

  initializeStore({
    id: character.id,
    campaignId: character.campaignId,
    level: character.level || 1,
    classLevels: character.classLevels || {},
    subclassIds: Object.fromEntries(
      (character.classes ?? []).map((entry) => [entry.classId, entry.subclassId]),
    ),
    raceId: character.raceId ?? null,
    subraceId: character.subraceId ?? null,
    backgroundId: character.backgroundId ?? null,
    choices: storedChoices.success ? storedChoices.data : emptyCharacterChoices(),
    // API payload keeps the flat lowercase column names; the store is keyed by
    // the engine's uppercase Ability type, so translate at this boundary.
    baseScores: {
      STR: character.str,
      DEX: character.dex,
      CON: character.con,
      INT: character.int,
      WIS: character.wis,
      CHA: character.cha,
    },
    // normalize slots at the boundary, translating any legacy names
    inventory: character.inventory.map(toInventoryInstance),
    currentHp: character.currentHp,
    maxHp: character.maxHp,
    resources: character.resources || [],
    traitGrants: character.traitGrants || [],
    ruleSnapshot: null,
  });
};

export const hydrateCharacterSheetWithRules = (
  initializeStore: CharacterSheetState["initialize"],
  payload: CharacterSheetResponse,
) => {
  hydrateCharacterSheet(initializeStore, payload.character);
  if (!payload.ruleSnapshot) return;

  initializeStore({
    ruleSnapshot: payload.ruleSnapshot,
  });
};