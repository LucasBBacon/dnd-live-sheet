import type {
  OperationalResource,
  ProficiencyLevel,
} from "@project/engine";
import type { RuleSnapshot } from "@project/shared";
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
  raceId: string | null;
  subraceId: string | null;
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
  proficiencies?: Record<string, ProficiencyLevel>;
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
  ruleSnapshot: Pick<
    RuleSnapshot,
    "equipmentById" | "itemsById" | "weaponsById" | "resourcesById"
  > | null;
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
  initializeStore({
    id: character.id,
    campaignId: character.campaignId,
    level: character.level || 1,
    classLevels: character.classLevels || {},
    raceId: character.raceId ?? null,
    subraceId: character.subraceId ?? null,
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
    proficiencies: character.proficiencies || {},
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