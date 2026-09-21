import {
  CharacterChoicesSchema,
  emptyCharacterChoices,
  type CharacterChoices,
  type CharacterSave,
} from "@project/shared";
import {
  AbilityEngine,
  CharacterBootstrapper,
  EffectManager,
  gatherSheetModifiers,
  type Ability,
  type RuleSnapshotLookup,
} from "@project/engine";

/** The columns of a characters row that a save is built from. */
export interface CharacterSaveSource {
  raceId: string;
  subraceId: string | null;
  backgroundId?: string | null;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  currentHp: number | null;
  maxHp: number | null;
}

/** A character_classes ledger row, as the save builder reads it. */
export interface CharacterClassSource {
  classId: string;
  classLevel: number;
  subclassId: string | null;
}

/**
 * The engine's save for a stored character.
 *
 * The one builder the gateway, character creation and level-up share, so the
 * three cannot disagree about what a character is. Its choices come from
 * characters.choices, keyed by the question each answers.
 */
export const toCharacterSave = (
  character: CharacterSaveSource,
  classes: CharacterClassSource[],
  choices: CharacterChoices = emptyCharacterChoices(),
): CharacterSave => ({
  attributes: {
    str: character.str,
    dex: character.dex,
    con: character.con,
    int: character.int,
    wis: character.wis,
    cha: character.cha,
  },
  race: {
    baseRaceId: character.raceId,
    hasSubraces: character.subraceId !== null,
    subraceId: character.subraceId,
  },
  ...(character.backgroundId ? { backgroundId: character.backgroundId } : {}),
  classes:
    classes.length > 0
      ? classes.map((entry) => ({
          classId: entry.classId,
          level: entry.classLevel,
          ...(entry.subclassId !== null && { subclassId: entry.subclassId }),
          selections: choices.classSelections[entry.classId] ?? {},
        }))
      : [{ classId: "class_fighter", level: 1, selections: {} }],
  traitSelections: choices.traitSelections,
  feats: choices.feats,
  hp: {
    current: character.currentHp ?? character.maxHp ?? 1,
    temporary: 0,
    baseRolledHp: character.maxHp ?? 1,
    hitDiceSpent: {},
  },
});

/**
 * A character's actual ability scores: the stored, pre-racial scores plus
 * every trait modifier - racial bonuses, feats, class features - through the
 * same gather the sheet uses. Magic items are deliberately left out: callers
 * here do not load inventory, and whether an item counts toward a
 * prerequisite is a table ruling (#77).
 */
export const finalAbilityScores = (
  save: CharacterSave,
  snapshot: RuleSnapshotLookup,
) => {
  const modifiers = gatherSheetModifiers({
    activeTraits: CharacterBootstrapper.compileActiveTraits(save, snapshot),
    selections: CharacterBootstrapper.resolveSelections(save),
    inventory: [],
    effectManager: new EffectManager(),
    snapshot,
  });
  const score = (base: number, ability: Ability) =>
    AbilityEngine.calculateScore(base, ability, modifiers, []).score;

  return {
    str: score(save.attributes.str, "STR"),
    dex: score(save.attributes.dex, "DEX"),
    con: score(save.attributes.con, "CON"),
    int: score(save.attributes.int, "INT"),
    wis: score(save.attributes.wis, "WIS"),
    cha: score(save.attributes.cha, "CHA"),
  };
};

/**
 * A character's stored choices, validated.
 *
 * A value that fails to parse is logged against the character and read as no
 * answers: one corrupt row should cost that character its picks, not stop the
 * player joining the table.
 */
export const readStoredChoices = (
  value: unknown,
  characterId: string,
): CharacterChoices => {
  const parsed = CharacterChoicesSchema.safeParse(value ?? {});
  if (parsed.success) return parsed.data;

  console.error(
    `Stored choices for character ${characterId} failed to parse; treating them as empty.`,
    parsed.error.issues,
  );
  return emptyCharacterChoices();
};
