import type {
  CharacterSave,
  SpellChoiceNode,
  SpellDefinition,
  TraitDefinition,
} from "@project/shared";
import {
  LANGUAGE_DICTIONARY,
  listProficiencyOptions,
  TOOL_DICTIONARY,
} from "../rules/proficiencyDictionary.js";
import {
  resolveBackgroundDefinition,
  resolveClassDefinition,
  resolveFeatDefinition,
  resolveRaceDefinition,
  resolveSpellDefinition,
  resolveTraitDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { CharacterBootstrapper } from "./characterBootstrapper.js";
import {
  backgroundTraitIds,
  baseRaceTraitIds,
  classChoiceNodes,
  classTraitIds,
  featTraitIds,
  isSpellChoice,
  subraceTraitIds,
  unlockedGrants,
} from "./grantSources.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";
import {
  spellChoiceEntries,
  spellOptions,
  spellsKnownElsewhere,
  type SpellChoiceEntry,
} from "./spellChoices.js";

export interface ChoiceOption {
  id: string;
  label: string;
}

export type ChoiceSourceKind =
  | "race"
  | "subrace"
  | "background"
  | "class"
  | "feat";

export interface ChoiceSource {
  kind: ChoiceSourceKind;
  id: string;
  name: string;
}

export interface ChoiceQuestion {
  id: string;
  target: "class" | "trait";
  classId?: string;
  source: ChoiceSource;
  prompt: string;
  pickCount: number;
  options: ChoiceOption[];
  selected: string[];
  held: string[];
}

const ABILITY_NAMES: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

const humanise = (id: string): string => {
  const words = id.replace(/^(trait|skill|tool|lang)_/, "").split("_").filter(Boolean);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * What a picker shows for an option id: a trait's own name, a spell's name, a
 * language or tool's dictionary name, an ability's full name, or a humanised
 * fallback for anything else (a skill id, or an id nothing recognises).
 */
export const choiceOptionLabel = (
  optionId: string,
  snapshot?: RuleSnapshotLookup,
): string =>
  resolveTraitDefinition(optionId, snapshot)?.name ??
  resolveSpellDefinition(optionId, snapshot)?.name ??
  LANGUAGE_DICTIONARY[optionId]?.name ??
  TOOL_DICTIONARY[optionId]?.name ??
  ABILITY_NAMES[optionId] ??
  humanise(optionId);

const optionsOf = (
  ids: string[],
  snapshot?: RuleSnapshotLookup,
): ChoiceOption[] => ids.map((id) => ({ id, label: choiceOptionLabel(id, snapshot) }));

/** The character's spell choices, and the active traits they were built from. */
interface SpellContext {
  activeTraits: TraitDefinition[];
  entries: SpellChoiceEntry[];
}

/** A spell question's options: each spell, labelled by its name. */
const spellChoiceOptions = (spells: SpellDefinition[]): ChoiceOption[] =>
  spells.map((spell) => ({ id: spell.id, label: spell.name }));

/** What a spell question asks for, after the name of what grants it. */
const spellPrompt = (node: SpellChoiceNode): string =>
  node.maxSpellLevel === 0
    ? `choose ${node.pickCount} cantrip(s)`
    : `choose ${node.pickCount} spell(s) of level ${node.maxSpellLevel === 1 ? "1" : `1 to ${node.maxSpellLevel}`}`;

/** The options of a spell question the character already knows from elsewhere. */
const heldSpells = (
  options: SpellDefinition[],
  spells: SpellContext,
  nodeId: string,
): string[] => {
  const known = spellsKnownElsewhere(spells.entries, spells.activeTraits, nodeId);
  return options.filter((spell) => known.has(spell.id)).map((spell) => spell.id);
};

/**
 * Which of the character's five kinds of source first granted each trait id
 * the character has, in priority order - race, subrace, background, each
 * class in ledger order, then each feat. The first source to grant a trait id
 * owns it, matching how CharacterBootstrapper.resolveGrantedTraitIds already
 * dedupes the same ids.
 *
 * Also returns a rank per source key, in that same priority order, so
 * listChoiceQuestions can sort every question - class progression nodes
 * included - onto one timeline without re-deriving the priority twice.
 */
const buildSourceIndex = (
  save: CharacterSave,
  snapshot?: RuleSnapshotLookup,
): { traitSource: Map<string, ChoiceSource>; rankOf: Map<string, number> } => {
  const traitSource = new Map<string, ChoiceSource>();
  const rankOf = new Map<string, number>();
  let nextRank = 0;

  const addSource = (source: ChoiceSource, traitIds: string[]): void => {
    const key = `${source.kind}:${source.id}`;
    if (!rankOf.has(key)) rankOf.set(key, nextRank++);
    for (const traitId of traitIds) {
      if (!traitSource.has(traitId)) traitSource.set(traitId, source);
    }
  };

  const race = resolveRaceDefinition(save.race.baseRaceId, snapshot);
  addSource(
    { kind: "race", id: save.race.baseRaceId, name: race?.name ?? save.race.baseRaceId },
    baseRaceTraitIds(save.race, snapshot),
  );

  if (save.race.subraceId) {
    const subrace = race?.subraces[save.race.subraceId];
    addSource(
      {
        kind: "subrace",
        id: save.race.subraceId,
        name: subrace?.name ?? save.race.subraceId,
      },
      subraceTraitIds(save.race, snapshot),
    );
  }

  if (save.backgroundId) {
    const background = resolveBackgroundDefinition(save.backgroundId, snapshot);
    addSource(
      {
        kind: "background",
        id: save.backgroundId,
        name: background?.name ?? save.backgroundId,
      },
      backgroundTraitIds(save.backgroundId, snapshot),
    );
  }

  save.classes.forEach((classState, index) => {
    const blueprint = resolveClassDefinition(classState.classId, snapshot);
    addSource(
      {
        kind: "class",
        id: classState.classId,
        name: blueprint?.name ?? classState.classId,
      },
      classTraitIds(classState, index === 0, snapshot),
    );
  });

  for (const featId of save.feats ?? []) {
    const feat = resolveFeatDefinition(featId, snapshot);
    addSource(
      { kind: "feat", id: featId, name: feat?.name ?? featId },
      featTraitIds([featId], snapshot),
    );
  }

  return { traitSource, rankOf };
};

/**
 * Every class progression choice the character has unlocked - trait_choice
 * and spell_choice nodes alike - one class at a time in ledger order, each
 * class's in the order its tracks author them. A spell node with nothing to
 * offer (no pack spell in its level range yet, #31a) is not asked.
 */
const classQuestions = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup | undefined,
  rankOf: Map<string, number>,
  spells: SpellContext,
): { question: ChoiceQuestion; rank: number }[] =>
  save.classes.flatMap((classState) => {
    const blueprint = resolveClassDefinition(classState.classId, snapshot);
    const source: ChoiceSource = {
      kind: "class",
      id: classState.classId,
      name: blueprint?.name ?? classState.classId,
    };
    const rank = rankOf.get(`class:${classState.classId}`) ?? Number.MAX_SAFE_INTEGER;
    const traitNodes = new Map(
      classChoiceNodes(classState, snapshot).map((node) => [node.nodeId, node]),
    );

    return unlockedGrants(classState, snapshot).flatMap((grant) => {
      if (typeof grant === "string") return [];

      if (isSpellChoice(grant)) {
        const options = spellOptions(grant, snapshot);
        if (options.length === 0) return [];
        return [
          {
            rank,
            question: {
              id: grant.nodeId,
              target: "class" as const,
              classId: classState.classId,
              source,
              prompt: `${source.name}: ${spellPrompt(grant)}`,
              pickCount: grant.pickCount,
              options: spellChoiceOptions(options),
              selected: classState.selections[grant.nodeId] ?? [],
              held: heldSpells(options, spells, grant.nodeId),
            },
          },
        ];
      }

      const node = traitNodes.get(grant.nodeId);
      if (!node) return [];
      return [
        {
          rank,
          question: {
            id: node.nodeId,
            target: "class" as const,
            classId: classState.classId,
            source,
            prompt: `${source.name}: choose ${node.pickCount} (${humanise(node.nodeId)})`,
            pickCount: node.pickCount,
            options: optionsOf(
              node.options.map((option) => option.id),
              snapshot,
            ),
            selected: classState.selections[node.nodeId] ?? [],
            held: [],
          },
        },
      ];
    });
  });

/**
 * The choice blocks that live on traits rather than on a class progression
 * track - a half-elf's ability bumps, a dwarf's tool, a bonus language, a
 * fighter's starting skills. A block whose trait resolved to no known source
 * (which compileActiveTraits guarantees does not happen, since it draws from
 * the same sources) is skipped rather than surfaced with a made-up source.
 */
const traitQuestions = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup | undefined,
  traits: TraitDefinition[],
  traitSource: Map<string, ChoiceSource>,
  rankOf: Map<string, number>,
): { question: ChoiceQuestion; rank: number }[] => {
  const selections = CharacterBootstrapper.resolveSelections(save);

  const rankFor = (source: ChoiceSource): number =>
    rankOf.get(`${source.kind}:${source.id}`) ?? Number.MAX_SAFE_INTEGER;

  const proficiencyEntries = ProficiencyExtractor.resolveChoices(
    traits,
    selections,
  ).flatMap((resolution) => {
    const source = traitSource.get(resolution.traitId);
    if (!source) return [];

    const definition = traits
      .find((trait) => trait.id === resolution.traitId)
      ?.proficiencies?.choices.find((choice) => choice.id === resolution.choiceId);

    const roster =
      definition?.options?.length ? definition.options : (listProficiencyOptions(resolution.category) ?? []);

    const held =
      resolution.availableOptions === undefined
        ? []
        : roster.filter(
            (id) =>
              !resolution.availableOptions!.includes(id) &&
              !resolution.accepted.includes(id),
          );

    return [
      {
        rank: rankFor(source),
        question: {
          id: resolution.choiceId,
          target: "trait" as const,
          source,
          prompt: `${resolution.traitName}: choose ${resolution.chooseAmount} ${resolution.category.replace("_", " ")}`,
          pickCount: resolution.chooseAmount,
          options: optionsOf(roster, snapshot),
          selected: save.traitSelections[resolution.choiceId] ?? [],
          held,
        },
      },
    ];
  });

  const modifierEntries = ModifierExtractor.resolveChoices(
    traits,
    selections,
  ).flatMap((resolution) => {
    const source = traitSource.get(resolution.traitId);
    if (!source) return [];

    const definition = traits
      .find((trait) => trait.id === resolution.traitId)
      ?.modifiers?.choices.find((choice) => choice.id === resolution.choiceId);

    return [
      {
        rank: rankFor(source),
        question: {
          id: resolution.choiceId,
          target: "trait" as const,
          source,
          prompt: `${resolution.traitName}: choose ${resolution.chooseAmount}`,
          pickCount: resolution.chooseAmount,
          options: optionsOf(definition?.options ?? [], snapshot),
          selected: save.traitSelections[resolution.choiceId] ?? [],
          held: [],
        },
      },
    ];
  });

  return [...proficiencyEntries, ...modifierEntries];
};

/**
 * The spell choices that live on traits rather than on a class track - a
 * High Elf's cantrip. Ranked with the source that granted the trait; one with
 * nothing to offer is not asked, exactly as for a class spell node.
 */
const traitSpellQuestions = (
  snapshot: RuleSnapshotLookup | undefined,
  traitSource: Map<string, ChoiceSource>,
  rankOf: Map<string, number>,
  spells: SpellContext,
): { question: ChoiceQuestion; rank: number }[] =>
  spells.entries.flatMap((entry) => {
    if (entry.target !== "trait") return [];
    const source = traitSource.get(entry.trait.id);
    const options = spellOptions(entry.node, snapshot);
    if (!source || options.length === 0) return [];

    return [
      {
        rank: rankOf.get(`${source.kind}:${source.id}`) ?? Number.MAX_SAFE_INTEGER,
        question: {
          id: entry.node.nodeId,
          target: "trait" as const,
          source,
          prompt: `${entry.trait.name}: ${spellPrompt(entry.node)}`,
          pickCount: entry.node.pickCount,
          options: spellChoiceOptions(options),
          selected: entry.selected,
          held: heldSpells(options, spells, entry.node.nodeId),
        },
      },
    ];
  });

/**
 * Every question a character must answer to finish assembling their sheet:
 * every class progression trait_choice and spell_choice node, every trait
 * choice block and every trait spell choice, race through feat. A spell
 * choice with nothing to offer is left out (spellOptions).
 *
 * Answered and unanswered questions both come back - a builder that only
 * wants what is left can filter on `selected.length < pickCount` itself; this
 * function's job is only to say what a question is, not whether it is done.
 */
export const listChoiceQuestions = (
  save: CharacterSave,
  snapshot?: RuleSnapshotLookup,
): ChoiceQuestion[] => {
  const { traitSource, rankOf } = buildSourceIndex(save, snapshot);
  const activeTraits = CharacterBootstrapper.compileActiveTraits(save, snapshot);
  const spells: SpellContext = {
    activeTraits,
    entries: spellChoiceEntries(save, activeTraits, snapshot),
  };

  const entries = [
    ...classQuestions(save, snapshot, rankOf, spells),
    ...traitQuestions(save, snapshot, activeTraits, traitSource, rankOf),
    ...traitSpellQuestions(snapshot, traitSource, rankOf, spells),
  ];

  return entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.question);
};
