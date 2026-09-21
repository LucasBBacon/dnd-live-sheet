import type {
  InventoryInstance,
  RuntimeModifier,
  TraitDefinition,
} from "@project/shared";
import type { EffectManager } from "../calculators/effects.js";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { InventoryExtractor } from "./inventoryExtractor.js";
import { ModifierExtractor } from "./modifierExtractor.js";

export interface SheetModifierInput {
  /** The character's compiled traits (CharacterBootstrapper.compileActiveTraits). */
  activeTraits: TraitDefinition[];
  /** The save's picks, keyed by question (CharacterBootstrapper.resolveSelections). */
  selections: Record<string, string[]>;
  inventory: InventoryInstance[];
  /** Live effects: spells, conditions, anything applied at the table. */
  effectManager: EffectManager;
  snapshot?: RuleSnapshotLookup;
}

/**
 * Every modifier a character sheet applies: its traits' (with the choices
 * made in their choice blocks), its equipment's, and its live effects'.
 *
 * The one definition the server's buildLiveSheet and the web sheet share.
 * The web sheet used to apply only equipment, so racial ability bonuses,
 * fighting styles and live effects never reached it (#73).
 */
export const gatherSheetModifiers = ({
  activeTraits,
  selections,
  inventory,
  effectManager,
  snapshot,
}: SheetModifierInput): RuntimeModifier[] => [
  ...ModifierExtractor.extractModifiers(activeTraits, selections),
  ...InventoryExtractor.extractModifiers(inventory, snapshot),
  ...effectManager.getActiveModifiers(),
];
