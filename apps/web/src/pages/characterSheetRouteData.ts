import type {
  OperationalInventoryItem,
  OperationalResource,
  ProficiencyLevel,
} from "@project/engine";
import type { RuleSnapshot } from "@project/shared";
import { apiClient, fetchRulesSnapshot } from "../api/client";
import type { CharacterSheetState } from "../store/characterSheetStore";

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
  inventory?: OperationalInventoryItem[];
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
    "itemsById" | "weaponsById" | "resourcesById"
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
    baseScores: {
      str: character.str,
      dex: character.dex,
      con: character.con,
      int: character.int,
      wis: character.wis,
      cha: character.cha,
    },
    inventory: character.inventory || [],
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