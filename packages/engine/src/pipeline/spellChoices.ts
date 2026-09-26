import type {
  CharacterSave,
  SpellChoiceNode,
  SpellDefinition,
  TraitDefinition,
} from "@project/shared";
import type { RuleSnapshotLookup } from "../rules/ruleLookup.js";
import { isSpellChoice, unlockedGrants } from "./grantSources.js";

/**
 * The spells a spell_choice node offers, in pack order.
 *
 * A cantrip node (maxSpellLevel 0) offers every level-0 spell. It is not
 * filtered by listSource: the pack has no spell lists yet (#31a), and this is
 * the one place list membership goes when it does.
 *
 * A leveled node offers nothing until then. With no list to filter on, it
 * would offer every leveled pack spell whatever the class; since
 * feat/spell-casting gave Faerie Fire and Burning Hands real levels, a new
 * wizard would be asked to fill a six-spell spellbook from those two, and
 * could not finish creation. An empty roster is neither asked
 * (listChoiceQuestions) nor reported unanswered (collectSaveIssues), which is
 * what every character got while every spell was a level-0 placeholder.
 * #31a removes this rule.
 * @param node The spell choice, from a class track or a trait's spells block
 * @param snapshot Pack content, when the caller has any loaded
 * @returns The spells a player may pick for this node
 */
export const spellOptions = (
  node: SpellChoiceNode,
  snapshot?: RuleSnapshotLookup,
): SpellDefinition[] =>
  node.maxSpellLevel > 0
    ? []
    : Object.values(snapshot?.spellsById ?? {}).filter(
        (spell) => spell.level === 0,
      );

/**
 * One spell choice a character has, and where its answer is stored: a class
 * track's node answers into that class's selections, a trait's spells block
 * into traitSelections - both keyed by the node's nodeId.
 */
export type SpellChoiceEntry =
  | {
      target: "class";
      classId: string;
      node: SpellChoiceNode;
      selected: string[];
    }
  | {
      target: "trait";
      trait: TraitDefinition;
      node: SpellChoiceNode;
      selected: string[];
    };

/**
 * Every spell choice a character has: each class's unlocked spell_choice
 * nodes, in ledger order and then track order, followed by each active
 * trait's spells block.
 * @param save The character
 * @param activeTraits CharacterBootstrapper.compileActiveTraits(save, snapshot)
 * @param snapshot Pack content, when the caller has any loaded
 * @returns One entry per spell choice, with the picks stored for it
 */
export const spellChoiceEntries = (
  save: CharacterSave,
  activeTraits: TraitDefinition[],
  snapshot?: RuleSnapshotLookup,
): SpellChoiceEntry[] => [
  ...save.classes.flatMap((classState) =>
    unlockedGrants(classState, snapshot)
      .filter(isSpellChoice)
      .map(
        (node): SpellChoiceEntry => ({
          target: "class",
          classId: classState.classId,
          node,
          selected: classState.selections[node.nodeId] ?? [],
        }),
      ),
  ),
  ...activeTraits.flatMap((trait) =>
    (trait.spells?.choices ?? []).map(
      (node): SpellChoiceEntry => ({
        target: "trait",
        trait,
        node,
        selected: save.traitSelections[node.nodeId] ?? [],
      }),
    ),
  ),
];

/**
 * Every trait spell block's picks - a High Elf's cantrip, a feat's - which
 * count as known wherever they came from (an invocation prerequisite's
 * Eldritch Blast). The one derivation save validation and
 * listChoiceQuestions share.
 * @param entries spellChoiceEntries for the character
 * @returns The picked spell ids of every target "trait" entry
 */
export const traitSpellPicks = (entries: SpellChoiceEntry[]): string[] =>
  entries
    .filter((entry) => entry.target === "trait")
    .flatMap((entry) => entry.selected);

/**
 * The spells a character already knows from anywhere but one spell choice:
 * every active trait's fixed spells, and every other spell choice's picks.
 * What a picker marks held, and what a pick on that choice buys nothing from.
 * @param entries spellChoiceEntries for the same character
 * @param activeTraits The active traits the entries were built from
 * @param nodeId The spell choice being answered; its own picks do not count
 * @returns The spell ids already known
 */
export const spellsKnownElsewhere = (
  entries: SpellChoiceEntry[],
  activeTraits: TraitDefinition[],
  nodeId: string,
): Set<string> => {
  const known = new Set<string>();
  for (const trait of activeTraits) {
    for (const spell of trait.spells?.fixed ?? []) known.add(spell.spellId);
  }
  for (const entry of entries) {
    if (entry.node.nodeId === nodeId) continue;
    for (const spellId of entry.selected) known.add(spellId);
  }
  return known;
};
