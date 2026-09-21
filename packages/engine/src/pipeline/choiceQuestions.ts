import type { CharacterSave } from "@project/shared";
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
  subraceTraitIds,
} from "./grantSources.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";

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
 * What a picker shows for an option id: a trait's own name, a language or
 * tool's dictionary name, an ability's full name, or a humanised fallback for
 * anything else (a skill id, or an id nothing recognises).
 */
export const choiceOptionLabel = (
  optionId: string,
  snapshot?: RuleSnapshotLookup,
): string =>
  resolveTraitDefinition(optionId, snapshot)?.name ??
  LANGUAGE_DICTIONARY[optionId]?.name ??
  TOOL_DICTIONARY[optionId]?.name ??
  ABILITY_NAMES[optionId] ??
  humanise(optionId);

const optionsOf = (
  ids: string[],
  snapshot?: RuleSnapshotLookup,
): ChoiceOption[] => ids.map((id) => ({ id, label: choiceOptionLabel(id, snapshot) }));

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
 * Every class progression trait_choice node the character has unlocked, one
 * question per class in ledger order. spell_choice nodes are never asked
 * here - they are not trait choices, and have no vocabulary of trait options
 * this function could label.
 */
const classQuestions = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup | undefined,
  rankOf: Map<string, number>,
): { question: ChoiceQuestion; rank: number }[] =>
  save.classes.flatMap((classState) => {
    const blueprint = resolveClassDefinition(classState.classId, snapshot);
    const source: ChoiceSource = {
      kind: "class",
      id: classState.classId,
      name: blueprint?.name ?? classState.classId,
    };
    const rank = rankOf.get(`class:${classState.classId}`) ?? Number.MAX_SAFE_INTEGER;

    return classChoiceNodes(classState, snapshot).map((node) => ({
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
    }));
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
  traitSource: Map<string, ChoiceSource>,
  rankOf: Map<string, number>,
): { question: ChoiceQuestion; rank: number }[] => {
  const traits = CharacterBootstrapper.compileActiveTraits(save, snapshot);
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
 * Every question a character must answer to finish assembling their sheet:
 * every unfinished class progression trait_choice node, and every unfinished
 * trait choice block, race through feat.
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

  const entries = [
    ...classQuestions(save, snapshot, rankOf),
    ...traitQuestions(save, snapshot, traitSource, rankOf),
  ];

  return entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.question);
};
