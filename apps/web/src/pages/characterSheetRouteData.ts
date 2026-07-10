import type {
  OperationalInventoryItem,
  OperationalResource,
  ProficiencyLevel,
} from "@project/engine";
import { apiClient } from "../api/client";
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
};

export const fetchCharacterSheet = (characterId: string) =>
  apiClient(`/character/${characterId}`) as Promise<CharacterSheetResponse>;

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
  });
};