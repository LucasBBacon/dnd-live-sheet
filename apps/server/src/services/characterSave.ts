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
  listChoiceQuestions,
  type Ability,
  type ChoiceQuestion,
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

/** What one level-up changes, as buildLevelUpSaves reads it. */
export interface LevelUpSaveInput<Entry extends CharacterClassSource> {
  character: CharacterSaveSource;
  /** the stored class ledger, in classLedgerOrder */
  ledger: Entry[];
  storedChoices: CharacterChoices;
  targetClassId: string;
  /** the subclass this level-up names, if any; the stored one otherwise */
  subclassId?: string | null | undefined;
  /** a feat this level-up takes, already checked by the caller */
  featId?: string | null | undefined;
  /** this level-up's class progression answers, keyed by node */
  selectedTraits?: Record<string, string[]> | undefined;
  /** this level-up's trait choice block answers, keyed by block */
  traitSelections?: Record<string, string[]> | undefined;
}

/** The character on either side of one level-up. */
export interface LevelUpSaves<Entry extends CharacterClassSource> {
  isMulticlassDip: boolean;
  /** the target class's level after this level-up */
  targetClassLevel: number;
  /** the stored ledger row for the target class, absent for a dip */
  targetClassRecord: Entry | undefined;
  /** the subclass the target class has after this level: requested ?? stored */
  subclassId: string | null;
  ledgerAfterLevel: CharacterClassSource[];
  choicesAfterLevel: CharacterChoices;
  before: CharacterSave;
  after: CharacterSave;
}

/**
 * The character before and after one level-up - the one construction the
 * level-up options (which list the questions the wizard asks) and
 * applyLevelUp (which requires their answers) share, so the two can never
 * disagree about what a level newly asks.
 *
 * The target class gains a level (or joins the ledger, for a dip); its
 * subclass is the requested one, else the one already stored for it; a feat
 * joins choices.feats; this level-up's answers merge over the stored ones.
 */
export const buildLevelUpSaves = <Entry extends CharacterClassSource>(
  input: LevelUpSaveInput<Entry>,
): LevelUpSaves<Entry> => {
  const { character, ledger, storedChoices, targetClassId } = input;
  const targetClassRecord = ledger.find((entry) => entry.classId === targetClassId);
  const isMulticlassDip = !targetClassRecord && ledger.length > 0;
  const targetClassLevel = (targetClassRecord?.classLevel || 0) + 1;
  // `||`, not `??`: a blank subclassId in a payload means "none named"
  const subclassId = input.subclassId || targetClassRecord?.subclassId || null;

  const ledgerAfterLevel: CharacterClassSource[] = ledger.map((entry) => ({
    classId: entry.classId,
    classLevel: entry.classId === targetClassId ? targetClassLevel : entry.classLevel,
    subclassId: entry.classId === targetClassId ? subclassId : entry.subclassId,
  }));
  if (!targetClassRecord) {
    ledgerAfterLevel.push({ classId: targetClassId, classLevel: targetClassLevel, subclassId });
  }

  const existingClassPicks = storedChoices.classSelections[targetClassId];
  const classSelections = { ...storedChoices.classSelections };
  // only stake out a classSelections entry for this class when there is
  // something to put in it - a level-up that answers nothing must not leave
  // behind an empty {} the class never actually picked anything for
  if (existingClassPicks || input.selectedTraits) {
    classSelections[targetClassId] = {
      ...(existingClassPicks ?? {}),
      ...(input.selectedTraits ?? {}),
    };
  }
  const choicesAfterLevel: CharacterChoices = {
    classSelections,
    traitSelections: {
      ...storedChoices.traitSelections,
      ...(input.traitSelections ?? {}),
    },
    feats: input.featId ? [...storedChoices.feats, input.featId] : storedChoices.feats,
  };

  return {
    isMulticlassDip,
    targetClassLevel,
    targetClassRecord,
    subclassId,
    ledgerAfterLevel,
    choicesAfterLevel,
    before: toCharacterSave(character, ledger, storedChoices),
    after: toCharacterSave(character, ledgerAfterLevel, choicesAfterLevel),
  };
};

/**
 * The questions a level-up newly asks: every question the character has
 * after it whose id it did not already have before. A question open since
 * creation or an earlier level is never among them - it may be answered, but
 * this level does not require it.
 */
export const questionsNewAtLevel = (
  saves: { before: CharacterSave; after: CharacterSave },
  snapshot: RuleSnapshotLookup,
): ChoiceQuestion[] => {
  const beforeIds = new Set(
    listChoiceQuestions(saves.before, snapshot).map((question) => question.id),
  );
  return listChoiceQuestions(saves.after, snapshot).filter(
    (question) => !beforeIds.has(question.id),
  );
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
