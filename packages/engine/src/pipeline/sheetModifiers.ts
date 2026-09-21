import type {
  InventoryInstance,
  RuntimeModifier,
  TraitDefinition,
} from "@project/shared";
import type { EffectManager } from "../calculators/effects.js";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { InventoryExtractor } from "./inventoryExtractor.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { StateExtractor } from "./stateExtractor.js";

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

export interface SheetStateInput {
  activeTraits: TraitDefinition[];
  inventory: InventoryInstance[];
  /** Given on the server, where live effects are part of the base states. */
  effectManager?: EffectManager;
  snapshot?: RuleSnapshotLookup;
}

/**
 * The states a character's sheet gates its modifiers on that hold regardless
 * of conditions: those its traits grant, those its live effects grant (when an
 * effect manager is given) and those its worn equipment puts on it, such as
 * status_wearing_armor. The web store composes effect states separately, so it
 * omits the manager; the server's buildLiveSheet passes it (#73).
 */
export const gatherBaseStates = ({
  activeTraits,
  inventory,
  effectManager,
  snapshot,
}: SheetStateInput): string[] =>
  Array.from(
    new Set([
      ...StateExtractor.extractStates(activeTraits),
      ...(effectManager?.getActiveStates() ?? []),
      ...InventoryExtractor.extractStates(inventory, snapshot),
    ]),
  );
