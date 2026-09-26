import type {
  ActionActivation,
  ActionGrant,
  CharacterSave,
  DamageSegment,
  Lore,
  RuntimeModifier,
  SpellComponents,
  SpellDefinition,
  SpellDuration,
  SpellRange,
  Spellcasting,
  SpellcastingFocusCategory,
} from "@project/shared";
import type { Ability } from "../types/core.js";
import { SpellcastingEngine, pactSlotLevel } from "../calculators/spellcasting.js";
import {
  classLevelsAndSubclassIds,
  collectCastingSources,
} from "../rules/casterLevel.js";
import {
  resolveClassDefinition,
  resolveSpellDefinition,
  resolveSubclassDefinition,
  resolveTraitDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { resolveSegmentDice, type ScalingLevels } from "./actionScaling.js";
import { CharacterBootstrapper } from "./characterBootstrapper.js";
import {
  backgroundTraitIds,
  classTraitIds,
  featTraitIds,
  raceTraitIds,
} from "./grantSources.js";
import { spellChoiceEntries } from "./spellChoices.js";

/** Who a spell is cast through, as the sheet labels it. */
export type SpellSource =
  | { kind: "class"; classId: string; label: string }
  | { kind: "trait"; traitId: string; label: string };

/** What casting it costs. A slot's level is chosen when it is cast. */
export type SpellPayment =
  | { kind: "at_will" }
  | { kind: "slot" }
  | { kind: "resource"; resourceId: string };

/** A pool that pays for spells, and the slot level it casts at. */
export interface SlotPool {
  resourceId: string;
  level: number;
}

/**
 * A spell the character has, through one source.
 *
 * One per source rather than one per spell, because the source decides the
 * numbers and the price: a drow Light cleric's Faerie Fire is a Charisma
 * spell once a day through Drow Magic, and a Wisdom spell paid with a slot
 * through the cleric.
 */
export interface CastableSpell {
  spellId: string;
  name: string;
  level: number;
  school: SpellDefinition["school"];
  lore?: Lore;
  range?: SpellRange;
  components?: SpellComponents;
  duration?: SpellDuration;
  activation: ActionActivation;
  source: SpellSource;
  /** Absent only when no casting ability could be found for the source. */
  ability?: Ability;
  attackBonus?: number;
  saveDc?: number;
  payment: SpellPayment;
  /** False for a prepared caster's leveled pick: preparation is not tracked. */
  preparationTracked: boolean;
  /** The foci this source can use. A component pouch always works. */
  focusCategories: SpellcastingFocusCategory[];
  /** The resolved action's id. Absent for a stub: listed, never cast. */
  actionId?: string;
}

export interface SpellSynthesisInput {
  save: CharacterSave;
  snapshot?: RuleSnapshotLookup;
  /** Final ability scores. */
  abilityScores: Record<Ability, number>;
  proficiencyBonus: number;
  /** Every active runtime modifier; SPELLCASTING_MOD bonuses come from here. */
  modifiers: RuntimeModifier[];
  activeStates: string[];
}

export interface SpellSynthesis {
  spells: CastableSpell[];
  /** Every implemented spell's resolved action, one per castable entry. */
  actions: ActionGrant[];
  slotPools: SlotPool[];
}

const ABILITIES: readonly Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

const asAbility = (stat: string | undefined): Ability | undefined =>
  ABILITIES.find((ability) => ability === stat);

/** `2d6+1` → `4d6+1`: a critical hit rolls the dice twice, never the modifier. */
const doubleDice = (dice: string): string =>
  dice.replace(/^(\d+)d/, (_, count: string) => `${Number(count) * 2}d`);

/** The value of the highest rung reached, or one below them all. */
const rungAt = (
  thresholds: Array<{ minimumLevel: number; value: number }>,
  level: number,
): number => {
  let best: { minimumLevel: number; value: number } | undefined;
  for (const rung of thresholds) {
    if (rung.minimumLevel <= level && (!best || rung.minimumLevel > best.minimumLevel)) {
      best = rung;
    }
  }
  return best?.value ?? 1;
};

interface CasterNumbers {
  ability: Ability;
  attackBonus: number;
  saveDc: number;
}

type CoreEffect = Exclude<ActionGrant["effect"], { type: "macro" }>;

/**
 * One effect with its caster stamped in, ahead of the roll the way weapons
 * are: attack bonus and beam count on an attack, DC and area on a save, and
 * every damage die at the character's level.
 */
const resolveSpellEffect = (
  effect: CoreEffect,
  numbers: CasterNumbers,
  spell: SpellDefinition,
  levels: ScalingLevels,
): CoreEffect => {
  const scale = (segments: DamageSegment[]) =>
    segments.map((segment) => resolveSegmentDice(segment, levels));

  switch (effect.type) {
    case "attack": {
      const damage = scale(effect.damage);
      return {
        ...effect,
        attackStat: numbers.ability,
        attackBonus: numbers.attackBonus,
        damage,
        // a spell attack has no weapon analysis to resolve its critical pool,
        // so it is doubled here: a critical beam rolls 2d10
        criticalDamage: damage.map((segment) => ({
          ...segment,
          baseDice: doubleDice(segment.baseDice),
          ...(segment.perSlotAbove !== undefined && {
            perSlotAbove: doubleDice(segment.perSlotAbove),
          }),
        })),
        ...(effect.repeat !== undefined && {
          repeatCount: rungAt(effect.repeat.thresholds, levels.total),
        }),
      };
    }
    case "save":
      return {
        ...effect,
        savingThrow: {
          ...effect.savingThrow,
          dcCalculation: {
            ...effect.savingThrow.dcCalculation,
            scalingStat: numbers.ability,
          },
          dc: numbers.saveDc,
        },
        ...(spell.range?.area !== undefined && { areaOfEffect: spell.range.area }),
        ...(effect.damage !== undefined && { damage: scale(effect.damage) }),
      };
    case "damage_rider":
      return { ...effect, damage: scale(effect.damage) };
    default:
      return effect;
  }
};

const resolveSpellAction = (
  spell: SpellDefinition,
  numbers: CasterNumbers,
  levels: ScalingLevels,
  actionId: string,
  payment: SpellPayment,
): ActionGrant => {
  const effect = spell.action.effect;
  return {
    ...spell.action,
    id: actionId,
    effect:
      effect.type === "macro"
        ? {
            ...effect,
            effects: effect.effects.map((nested) =>
              resolveSpellEffect(nested, numbers, spell, levels),
            ),
          }
        : resolveSpellEffect(effect, numbers, spell, levels),
    ...(payment.kind === "resource" && { consumesResource: payment.resourceId }),
  };
};

/**
 * Every spell the character has, as the sheet lists and casts them.
 *
 * Two places grant spells: a trait's fixed `spells` block (Drow Magic, a
 * domain's spells), and the character's stored picks (a warlock's cantrips, a
 * wizard's spellbook). Each spell becomes one entry per source, carrying the
 * source's casting ability, numbers, price and foci. An implemented spell also
 * yields its resolved action - the caster's numbers stamped in, dice at the
 * character's level - under `${spell.action.id}@${sourceKey}`, which is how
 * the server finds it. A stub is listed and never becomes an action.
 * @param input The character, the pack, and the numbers the character casts with
 * @returns The spells, their actions, and the slot pools that pay for them
 */
export const synthesizeSpells = (input: SpellSynthesisInput): SpellSynthesis => {
  const { save, snapshot } = input;
  const { classLevels, subclassIds } = classLevelsAndSubclassIds(save.classes);
  const levels: ScalingLevels = {
    total: save.classes.reduce((sum, classState) => sum + classState.level, 0),
    classes: classLevels,
  };

  /** A class's spellcasting block: its own, or its chosen subclass's. */
  const castingOf = (classId: string): Spellcasting | undefined => {
    const own = resolveClassDefinition(classId, snapshot)?.spellcasting;
    if (own) return own;
    const subclassId = subclassIds[classId];
    return subclassId
      ? resolveSubclassDefinition(subclassId, snapshot)?.spellcasting
      : undefined;
  };

  /** "Cleric", or "Eldritch Knight" where the subclass is what casts. */
  const classSource = (classId: string): SpellSource => {
    const blueprint = resolveClassDefinition(classId, snapshot);
    const subclassId = subclassIds[classId];
    const subclassName =
      !blueprint?.spellcasting && subclassId
        ? resolveSubclassDefinition(subclassId, snapshot)?.name
        : undefined;
    return {
      kind: "class",
      classId,
      label: subclassName ?? blueprint?.name ?? classId,
    };
  };

  // which class, if any, granted each trait: a Light cleric's domain spells
  // are the cleric's, cast with Wisdom and a holy symbol; Drow Magic is
  // nobody's, cast with the Charisma it names and a component pouch
  const traitClass = new Map<string, string | undefined>();
  for (const traitId of [
    ...raceTraitIds(save.race, snapshot),
    ...backgroundTraitIds(save.backgroundId, snapshot),
    ...featTraitIds(save.feats ?? [], snapshot),
  ]) {
    traitClass.set(traitId, undefined);
  }
  save.classes.forEach((classState, index) => {
    for (const traitId of classTraitIds(classState, index === 0, snapshot)) {
      if (!traitClass.has(traitId)) traitClass.set(traitId, classState.classId);
    }
  });

  const spells: CastableSpell[] = [];
  const actions: ActionGrant[] = [];
  const seen = new Set<string>();

  const add = (
    spell: SpellDefinition,
    entry: {
      source: SpellSource;
      sourceKey: string;
      ability: Ability | undefined;
      payment: SpellPayment;
      preparationTracked: boolean;
      focusCategories: SpellcastingFocusCategory[];
    },
  ) => {
    const actionId = `${spell.action.id}@${entry.sourceKey}`;
    if (seen.has(actionId)) return;
    seen.add(actionId);

    const numbers: CasterNumbers | undefined =
      entry.ability === undefined
        ? undefined
        : {
            ability: entry.ability,
            ...SpellcastingEngine.numbersFor(
              entry.ability,
              input.abilityScores,
              input.proficiencyBonus,
              input.modifiers,
              input.activeStates,
            ),
          };
    const castable =
      spell.implementation?.mode !== "unimplemented" && numbers !== undefined;

    if (castable) {
      actions.push(resolveSpellAction(spell, numbers, levels, actionId, entry.payment));
    }

    spells.push({
      spellId: spell.id,
      name: spell.name,
      level: spell.level,
      school: spell.school,
      ...(spell.lore !== undefined && { lore: spell.lore }),
      ...(spell.range !== undefined && { range: spell.range }),
      ...(spell.components !== undefined && { components: spell.components }),
      ...(spell.duration !== undefined && { duration: spell.duration }),
      activation: spell.action.activation,
      source: entry.source,
      ...(numbers !== undefined && {
        ability: numbers.ability,
        attackBonus: numbers.attackBonus,
        saveDc: numbers.saveDc,
      }),
      payment: entry.payment,
      preparationTracked: entry.preparationTracked,
      focusCategories: entry.focusCategories,
      ...(castable && { actionId }),
    });
  };

  // 1 - fixed grants on the character's traits
  for (const [traitId, classId] of traitClass) {
    const trait = resolveTraitDefinition(traitId, snapshot);
    for (const grant of trait?.spells?.fixed ?? []) {
      const reached =
        grant.unlockScaling === "class_level" && classId !== undefined
          ? (classLevels[classId] ?? 0)
          : levels.total;
      if (reached < (grant.unlockLevel ?? 1)) continue;

      const spell = resolveSpellDefinition(grant.spellId, snapshot);
      if (!trait || !spell) continue;

      const casting = classId === undefined ? undefined : castingOf(classId);
      // an always-prepared spell is the class's own spell, cast from its
      // slots; anything else is the trait's, at its own price
      const classOwned =
        grant.usage.kind === "always_prepared" ? classId : undefined;
      const payment: SpellPayment =
        spell.level === 0 || grant.usage.kind === "at_will"
          ? { kind: "at_will" }
          : grant.usage.kind === "resource" && grant.usage.resourceId !== undefined
            ? { kind: "resource", resourceId: grant.usage.resourceId }
            : { kind: "slot" };

      add(spell, {
        source:
          classOwned !== undefined
            ? classSource(classOwned)
            : { kind: "trait", traitId, label: trait.name },
        sourceKey: classOwned ?? traitId,
        ability: asAbility(grant.castingStat) ?? casting?.ability,
        payment,
        preparationTracked: true,
        focusCategories: casting?.focusCategories ?? [],
      });
    }
  }

  // 2 - stored picks, from class tracks and from trait spell blocks
  const activeTraits = CharacterBootstrapper.compileActiveTraits(save, snapshot);
  for (const entry of spellChoiceEntries(save, activeTraits, snapshot)) {
    const classId =
      entry.target === "class" ? entry.classId : traitClass.get(entry.trait.id);
    const casting = classId === undefined ? undefined : castingOf(classId);

    for (const spellId of entry.selected) {
      const spell = resolveSpellDefinition(spellId, snapshot);
      if (!spell) continue;

      add(spell, {
        source:
          entry.target === "class"
            ? classSource(entry.classId)
            : { kind: "trait", traitId: entry.trait.id, label: entry.trait.name },
        sourceKey: entry.target === "class" ? entry.classId : entry.trait.id,
        ability: asAbility(entry.node.castingStat) ?? casting?.ability,
        payment: spell.level === 0 ? { kind: "at_will" } : { kind: "slot" },
        preparationTracked: !(
          entry.target === "class" &&
          casting?.preparation === "prepared" &&
          spell.level > 0
        ),
        focusCategories: casting?.focusCategories ?? [],
      });
    }
  }

  // 3 - the pools that pay: every slot pool a trait grants, at its level
  const pactSource = collectCastingSources(classLevels, subclassIds, snapshot).find(
    (source) => source.progression === "pact",
  );
  const slotPools: SlotPool[] = [];
  const pooled = new Set<string>();
  for (const trait of activeTraits) {
    for (const resource of trait.resources ?? []) {
      if (pooled.has(resource.id)) continue;
      if (!("spellSlot" in resource) || resource.spellSlot === undefined) continue;

      const level =
        resource.spellSlot.kind === "level"
          ? resource.spellSlot.level
          : pactSource
            ? pactSlotLevel(pactSource.level)
            : undefined;
      if (level === undefined) continue;

      pooled.add(resource.id);
      slotPools.push({ resourceId: resource.id, level });
    }
  }

  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  slotPools.sort((a, b) => a.level - b.level);

  return { spells, actions, slotPools };
};
