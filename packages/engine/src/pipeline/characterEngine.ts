import { STANDARD_ACTIONS } from "@project/shared";
import type {
  ActorInstance,
  ActionGrant,
  CalculationResult,
  CharacterSave,
  EngineEvent,
  FixedProficiencyGrant,
  InventoryInstance,
  RuntimeModifier,
} from "@project/shared";
import { resolveActionScaling } from "./actionScaling.js";
import {
  AbilityEngine,
  type DerivedAbility,
} from "../calculators/abilities.js";
import { SKILL_MAP } from "@project/shared";
import type { Ability } from "../types/core.js";
import { SkillEngine, type DerivedSkill } from "../calculators/skills.js";
import { SaveEngine, type DerivedSave } from "../calculators/saves.js";
import {
  SpellcastingEngine,
  type DerivedSpellcasting,
} from "../calculators/spellcasting.js";
import {
  classLevelsAndSubclassIds,
  collectCastingSources,
} from "../rules/casterLevel.js";
import { CombatEngine } from "../calculators/combat.js";
import type { EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import { CharacterBootstrapper } from "./characterBootstrapper.js";
import { ActionResolver } from "./actionResolver.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";
import { gatherBaseStates, gatherSheetModifiers } from "./sheetModifiers.js";
import {
  synthesizeSpells,
  type CastableSpell,
  type SlotPool,
} from "./spellSynthesizer.js";
import {
  dynamicAttackApplies,
  dynamicAttackId,
} from "./dynamicWeaponAttacks.js";
import { DerivedStatEngine } from "../calculators/derivedStats.js";
import { SpeedEngine } from "../calculators/speed.js";
import { WeaponSynthesizer } from "./weaponSynthesizer.js";
import { InventoryWeightCalculator } from "../calculators/weight.js";
import {
  DEFAULT_ENCUMBRANCE_RULES,
  EncumbranceEngine,
  POWERFUL_BUILD_STATE,
  CARRYING_CAPACITY_DOUBLED_STATE,
  type EncumbranceResult,
  type EncumbranceRules,
} from "../calculators/encumbrance.js";
import {
  ContainerEngine,
  type ContainerReport,
} from "../calculators/containers.js";
import {
  ItemRequirementEngine,
  type ItemRequirementResult,
} from "../calculators/itemRequirements.js";
import { DEFAULT_WALKING_SPEED } from "../rules/raceTypes.js";
import {
  resolveEquipmentDefinition,
  resolveRaceDefinition,
  resolveWeaponDefinition,
  type RuleSnapshotLookup,
} from "../rules/ruleLookup.js";
import { resolveSummonActorBlueprint } from "../rules/summonActorDictionary.js";

/**
 * Everything stage one is allowed to see.
 *
 * Narrow on purpose. The field that matters is baseStates: naming it that,
 * rather than activeStates, is what makes the pipeline's one invariant a
 * signature rather than a comment. A calculator below this line cannot read a
 * state that encumbrance derived, because it is not in scope.
 */
interface StageOneInput {
  attributes: CharacterSave["attributes"];
  classes: CharacterSave["classes"];
  baseRolledHp: number;
  totalLevel: number;
  profBonus: number;
  proficiencies: FixedProficiencyGrant[];
  modifiers: RuntimeModifier[];
  baseStates: string[];
}

/** The five outputs that must be final before encumbrance can be computed. */
interface StageOneResult {
  abilities: Record<Ability, DerivedAbility>;
  maxHp: CalculationResult;
  armorClass: CalculationResult;
  initiative: CalculationResult;
  skills: Record<string, DerivedSkill>;
  saves: Record<string, DerivedSave>;
}

export interface LiveSheetOptions {
  /** Homebrew and imported rules, when the host app has a snapshot loaded. */
  snapshot?: RuleSnapshotLookup;
  /** Campaign setting. Defaults to standard 5e, where nothing slows you down. */
  encumbranceRules?: EncumbranceRules;
}

/**
 * An action an item grants, bound to the stack it came from.
 *
 * Keyed by instance rather than by item id because two stacks of the same item
 * are two rows on the sheet, and Use has to spend the one that was pressed.
 */
export interface ItemActionGrant {
  instanceId: string;
  itemId: string;
  action: ActionGrant;
}

export interface LiveCharacterSheet {
  // core stats
  abilities: Record<Ability, DerivedAbility>;
  proficiencyBonus: number;

  // derived combat stats
  maxHp: CalculationResult;
  currentHp: number;
  tempHp: number;
  armorClass: CalculationResult;
  initiative: CalculationResult;
  speed: CalculationResult;
  /** How many attacks one Attack action grants. Base one, raised by Extra Attack. */
  attacksPerAction: CalculationResult;

  // skills and saves
  skills: Record<string, DerivedSkill>; // keyed by skillId
  saves: Record<string, DerivedSave>; // keyed by Ability (STR, DEX, …)
  /**
   * The save DC and attack bonus for each class that casts, empty for a
   * character that casts nothing. One entry per class, because a wizard/cleric
   * has two of each and one number would be wrong for half their spells.
   */
  spellcasting: DerivedSpellcasting[];
  /**
   * Every spell the character has, one entry per source, stubs included - see
   * synthesizeSpells. The implemented ones' resolved actions are in `actions`.
   */
  spells: CastableSpell[];
  /** The spell slot pools the character holds, and the level each casts at. */
  slotPools: SlotPool[];

  // load
  encumbrance: EncumbranceResult;
  /**
   * What sits in each container the character carries, and whether it fits.
   * Partitions the same weight `encumbrance` totals; it never changes it.
   */
  containers: ContainerReport;
  /** Worn items whose ability requirement the character does not meet. */
  equipmentRequirements: ItemRequirementResult;

  // executable actions (traits, spells, weapons)
  actions: ActionGrant[];
  /**
   * Actions granted by carried items.
   *
   * Deliberately apart from `actions`: these are used from the inventory row,
   * and the combat list stays the combat list. Kept in the sheet rather than
   * recomputed by the server so both surfaces read the same gather.
   */
  itemActions: ItemActionGrant[];
  activeActors: ActorInstance[];
  summons: Array<{
    templateId: string;
    label: string;
    instanceId: string;
    sourceName: string;
  }>;

  // current environment
  /**
   * Trait- and effect-granted states: everything true about the character
   * before the load in their pack is known. This is what stage one gates on.
   */
  baseStates: string[];
  /**
   * baseStates plus whatever encumbrance derived. The full picture, and what
   * the UI and the roll layer should read.
   */
  activeStates: string[];
}

const buildActiveActors = (effectManager: EffectManager): ActorInstance[] =>
  effectManager.getActiveActors().length > 0
    ? effectManager.getActiveActors()
    : effectManager
        .getActiveEffects()
        .filter((effect) => effect.kind === "summon")
        .flatMap((effect) => {
          const entities = effect.summonEntities ?? [];
          if (entities.length === 0) {
            return effect.grantedStates.map((state, index) => {
              const blueprint = resolveSummonActorBlueprint(state);
              return {
                instanceId: `${effect.instanceId}:${state}:${index}`,
                templateId: state,
                displayLabel: blueprint?.label ?? state,
                controller:
                  blueprint?.controllerRules.defaultController ?? "player",
                lifecycleState: "active",
                currentStates: [...(blueprint?.baseStates ?? [state])],
                availableActions: blueprint?.authoredActions ?? [],
                combatProfile: blueprint?.combatProfile,
                statusSummary: blueprint
                  ? `Active ${blueprint.label}`
                  : `Active summon from ${effect.sourceName}`,
                sourceEffectInstanceId: effect.instanceId,
              };
            });
          }

          return entities.map((entry, index) => {
            const blueprint = resolveSummonActorBlueprint(entry.templateId);
            return {
              instanceId: `${effect.instanceId}:${entry.templateId}:${index}`,
              templateId: entry.templateId,
              displayLabel: blueprint?.label ?? entry.label,
              controller:
                blueprint?.controllerRules.defaultController ?? "player",
              lifecycleState: "active",
              currentStates: [...(blueprint?.baseStates ?? [entry.templateId])],
              availableActions: blueprint?.authoredActions ?? [],
              combatProfile: blueprint?.combatProfile,
              statusSummary: blueprint
                ? `Active ${blueprint.label}`
                : `Active summon from ${effect.sourceName}`,
              sourceEffectInstanceId: effect.instanceId,
            };
          });
        });

export class CharacterEngine {
  public static dispatchTraitEvent(
    eventName: EngineEvent,
    save: CharacterSave,
    effectManager: EffectManager,
    resourceManager: ResourceManager,
    snapshot?: RuleSnapshotLookup,
  ) {
    const activeTraits = CharacterBootstrapper.hydrateRuntimeManagers(
      save,
      effectManager,
      resourceManager,
      snapshot,
    );
    const actionLookup = Object.fromEntries(
      activeTraits.flatMap((trait) =>
        (trait.actions ?? []).map((action) => [action.id, action]),
      ),
    );

    const triggerGrants = activeTraits.flatMap((trait) => trait.triggers ?? []);

    return ActionResolver.dispatchEvent(
      eventName,
      triggerGrants,
      actionLookup,
      {
        effectManager,
        resourceManager,
      },
    );
  }

  public static buildLiveSheet(
    save: CharacterSave,
    inventory: InventoryInstance[],
    effectManager: EffectManager,
    resourceManager: ResourceManager,
    options: LiveSheetOptions = {},
  ): LiveCharacterSheet {
    // region Aggregation and Extraction

    // 1- compile active traits from blueprints, preferring the loaded rule pack
    const activeTraits = CharacterBootstrapper.hydrateRuntimeManagers(
      save,
      effectManager,
      resourceManager,
      options.snapshot,
    );
    // flattening loses which trait each modifier came from, and an appended
    // critical die wants to name itself in the damage breakdown - so stamp the
    // trait's name on the way past, the way actionResolver stamps sourceName
    // onto a blueprint's modifiers. An authored sourceName wins, since only the
    // pack knows when a modifier should credit something other than its trait.
    const criticalHitModifiers = activeTraits.flatMap((trait) =>
      (trait.criticalHitModifiers ?? []).map((modifier) => ({
        ...modifier,
        sourceName: modifier.sourceName ?? trait.name,
      })),
    );

    // 2 - extract static math and proficiencies
    // both extractors read from the same flattened pick table: trait choice
    // blocks and class progression nodes share one namespace once the traits
    // have been compiled and no longer remember who granted them
    const selections = CharacterBootstrapper.resolveSelections(save);
    const proficiencies = ProficiencyExtractor.extractProficiencies(
      activeTraits,
      selections,
    );

    // 3 - merge static trait math with worn equipment and dynamic live math
    // (spells, conditions)
    const baseStates = gatherBaseStates({
      activeTraits,
      inventory,
      effectManager,
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
    });
    const summons = effectManager
      .getActiveEffects()
      .filter((effect) => effect.kind === "summon")
      .flatMap((effect) => {
        const entities = effect.summonEntities ?? [];
        if (entities.length > 0) {
          return entities.map((entry) => ({
            templateId: entry.templateId,
            label: entry.label,
            instanceId: effect.instanceId,
            sourceName: effect.sourceName,
          }));
        }

        return effect.grantedStates.map((state) => ({
          templateId: state,
          label: state,
          instanceId: effect.instanceId,
          sourceName: effect.sourceName,
        }));
      });
    const activeActors = buildActiveActors(effectManager);
    const allModifiers = gatherSheetModifiers({
      activeTraits,
      selections,
      inventory,
      effectManager,
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
    });

    // endregion

    // region Calculations (stage one)
    //
    // Everything here reads baseStates. The derived states are not built until
    // the load region below, and computeStageOne cannot see them.

    const totalLevel = save.classes.reduce((sum, cls) => sum + cls.level, 0);
    const profBonus = AbilityEngine.getProficiencyBonus(totalLevel);

    const { abilities, maxHp, armorClass, initiative, skills, saves } =
      this.computeStageOne({
        attributes: save.attributes,
        classes: save.classes,
        baseRolledHp: save.hp.baseRolledHp,
        totalLevel,
        profBonus,
        proficiencies,
        modifiers: allModifiers,
        baseStates,
      });

    // endregion

    // region Load (stage two)
    //
    // The pipeline's one two-phase dependency. Encumbrance needs the *final*
    // STR score, so it cannot run until stage one is done - and its own output
    // must never flow back into stage one, or a belt of giant strength would
    // change the capacity that changed the state that changed the score.
    //
    // The invariant, stated once because everything here rests on it: nothing
    // above this line may read activeStates.

    const race = resolveRaceDefinition(save.race.baseRaceId, options.snapshot);

    const encumbrance = EncumbranceEngine.calculate({
      totalHundredths: InventoryWeightCalculator.totalHundredths(
        inventory,
        options.snapshot,
      ),
      strScore: abilities.STR.score,
      // a save can name a race the loaded rulebook no longer has; medium is the
      // assumption that changes the least
      size: race?.size ?? "medium",
      hasPowerfulBuild: baseStates.includes(POWERFUL_BUILD_STATE),
      hasCarryingCapacityDoubled: baseStates.includes(
        CARRYING_CAPACITY_DOUBLED_STATE,
      ),
      rules: options.encumbranceRules ?? DEFAULT_ENCUMBRANCE_RULES,
    });

    // reads inventory and nothing else, so it has no stake in the two-stage
    // seam - it sits here because this is where carrying is reasoned about
    const containers = ContainerEngine.report(inventory, options.snapshot);

    // belongs to stage two for the same reason encumbrance does: it tests the
    // *final* scores, so a belt of giant strength decides whether the wearer
    // still pays for their plate. Shared with the spellcasting calc below,
    // which needs the same final-score record for the same reason.
    const abilityScores = Object.fromEntries(
      Object.entries(abilities).map(([ability, derived]) => [
        ability,
        derived.score,
      ]),
    ) as Record<Ability, number>;

    const equipmentRequirements = ItemRequirementEngine.evaluate({
      items: inventory,
      abilityScores,
      snapshot: options.snapshot,
    });

    const activeStates = Array.from(
      new Set([
        ...baseStates,
        ...encumbrance.states,
        ...equipmentRequirements.states,
      ]),
    );

    const speed = SpeedEngine.calculateSpeed(
      race?.speed ?? DEFAULT_WALKING_SPEED,
      allModifiers,
      // baseStates, not activeStates: the tier already arrives below as a
      // typed argument, so letting it in through the state list too would make
      // a SPEED modifier gated on "encumbered" stack on top of TIER_PENALTY -
      // the same ten feet counted twice. accepted trade-off: this also means a
      // SPEED modifier authored with forbiddenStates: ["encumbered"] stays
      // active while encumbered, since encumbrance never reaches this list.
      // nothing authors that today, so it is latent rather than a live bug
      baseStates,
      encumbrance.tier,
      equipmentRequirements.charges.map((charge) => ({
        name: charge.label,
        feet: charge.feet,
      })),
    );

    // shared by both stat blocks below - a save's classes are the only
    // source either one should read a class-id-to-level map from
    const { classLevels, subclassIds } = classLevelsAndSubclassIds(
      save.classes,
    );

    // reads only modifiers and levels, so it has no stake in the two-stage
    // seam; it sits here because this is where the turn's shape is reasoned about
    const attacksPerAction = DerivedStatEngine.calculateAttacksPerAction(
      allModifiers,
      {
        total: totalLevel,
        classes: classLevels,
      },
      activeStates,
    );

    // belongs to stage two like the weapon attacks above: a SPELLCASTING_MOD
    // bonus can be gated on states, so this needs the final activeStates,
    // not the baseStates that saves and skills were computed with
    const castingSources = collectCastingSources(
      classLevels,
      subclassIds,
      options.snapshot,
    );
    const spellcasting = SpellcastingEngine.calculate(
      castingSources,
      abilityScores,
      profBonus,
      allModifiers,
      activeStates,
    );

    // every spell the character has, the caster's numbers stamped in. Stage
    // two for the reason spellcasting is: a SPELLCASTING_MOD bonus can be
    // gated on states
    const spellSynthesis = synthesizeSpells({
      save,
      ...(options.snapshot !== undefined && { snapshot: options.snapshot }),
      abilityScores,
      proficiencyBonus: profBonus,
      modifiers: allModifiers,
      activeStates,
    });

    // endregion

    // region State Synthesis

    // 1 - synthesize actions
    // aggregate static actions from traits
    // the standard actions come first because everyone has them, and they are
    // not granted by anything - Dodge is not a trait, it is a rule
    const actions: ActionGrant[] = [
      ...STANDARD_ACTIONS,
      // a dynamic_weapon_attack is a template, not a swing: the loop further
      // down turns it into one concrete attack per held weapon it applies to,
      // and the bare template has nothing to roll. Left in, it showed as a
      // button that spent the activation and reached the resolver's default
      // case.
      ...activeTraits.flatMap((t) =>
        (t.actions || [])
          .filter((action) => action.effect.type !== "dynamic_weapon_attack")
          // every damage die at this character's level: a breath weapon's
          // ladder was authored and never read
          .map((action) =>
            resolveActionScaling(action, { total: totalLevel, classes: classLevels }),
          ),
      ),
      // a spell's action is keyed by its source, so the server's lookup by
      // id finds exactly the casting the player pressed
      ...spellSynthesis.actions,
    ];

    // Carried, not equipped: a vial in your pack is throwable. This is why the
    // gather cannot ride along with the weapon loop below, which skips
    // anything without a hand slot.
    const itemActions: ItemActionGrant[] = [];
    for (const instance of inventory) {
      const definition = resolveEquipmentDefinition(
        instance.itemId,
        options.snapshot,
      );

      for (const action of definition?.actions ?? []) {
        itemActions.push({
          instanceId: instance.id,
          itemId: instance.itemId,
          action,
        });
      }
    }

    for (const instance of inventory) {
      if (!instance.slot || instance.slot === "backpack") continue;

      const weapon = resolveWeaponDefinition(instance.itemId, options.snapshot);
      if (!weapon) continue;

      const weaponAttackContext = {
        hand:
          instance.slot === "off_hand"
            ? ("off_hand" as const)
            : ("main_hand" as const),
        attackUsage:
          instance.slot === "off_hand"
            ? ("two_weapon_bonus" as const)
            : ("standard" as const),
        isTwoHandedGrip: activeStates.includes("two_handed_grip"),
      };

      const attackAnalysis = CombatEngine.calculateWeaponAttack(
        weapon,
        {
          STR: abilities.STR.score,
          DEX: abilities.DEX.score,
          CON: abilities.CON.score,
          INT: abilities.INT.score,
          WIS: abilities.WIS.score,
          CHA: abilities.CHA.score,
        },
        profBonus,
        proficiencies,
        allModifiers,
        activeStates,
        criticalHitModifiers,
        false,
        undefined,
        weaponAttackContext,
        save.classes.reduce(
          (levelsByClass, classState) => {
            levelsByClass[classState.classId] = classState.level;
            return levelsByClass;
          },
          {} as Record<string, number>,
        ),
      );

      const governingStat = attackAnalysis.breakdown.governingStat as Ability;
      const synthesizedActions = weapon.properties.includes("thrown")
        ? WeaponSynthesizer.generateThrownWeaponActions(
            weapon,
            governingStat,
            weaponAttackContext,
            attackAnalysis.criticalDamageMaximized,
          )
        : [
            WeaponSynthesizer.generateWeaponAction(
              weapon,
              governingStat,
              weaponAttackContext,
              attackAnalysis.criticalDamageMaximized,
            ),
          ];

      for (const action of synthesizedActions) {
        if (action.effect.type !== "attack") continue;

        action.effect.attackBonus = attackAnalysis.attackBonus;
        action.effect.damageBonus = attackAnalysis.damageBonus;

        // the critical pool was matched against one attack classification, and
        // a thrown weapon yields two actions from this single analysis. Stamping
        // it on the swing it does not describe would give a melee-only rule -
        // Brutal Critical, Savage Attacks - to the ranged throw as well.
        if (action.effect.attackType === attackAnalysis.attackType) {
          action.effect.criticalDamage = attackAnalysis.criticalDamage;
        }
      }

      actions.push(...synthesizedActions);
    }

    for (const trait of activeTraits) {
      for (const dynamicAction of trait.actions ?? []) {
        if (dynamicAction.effect.type !== "dynamic_weapon_attack") continue;
        const template = dynamicAction.effect;

        for (const instance of inventory) {
          // only a weapon in a hand is held, and useCombat draws cards for
          // the two hands alone
          const hand = instance.slot;
          if (hand !== "main_hand" && hand !== "off_hand") continue;
          const weapon = resolveWeaponDefinition(instance.itemId, options.snapshot);
          // the same question useCombat asks of the same two hands before it
          // draws a card, so the sheet offers exactly the swings this
          // synthesises
          if (!weapon || !dynamicAttackApplies(template, weapon, activeStates)) {
            continue;
          }

          // "a melee weapon attack", never two-weapon fighting: an off-hand
          // swing is an ordinary attack and keeps its ability modifier
          const weaponAttackContext = {
            hand,
            attackUsage: "standard" as const,
            isTwoHandedGrip: activeStates.includes("two_handed_grip"),
          };
          const attackAnalysis = CombatEngine.calculateWeaponAttack(
            weapon,
            {
              STR: abilities.STR.score,
              DEX: abilities.DEX.score,
              CON: abilities.CON.score,
              INT: abilities.INT.score,
              WIS: abilities.WIS.score,
              CHA: abilities.CHA.score,
            },
            profBonus,
            proficiencies,
            allModifiers,
            activeStates,
            criticalHitModifiers,
            false,
            undefined,
            weaponAttackContext,
            save.classes.reduce(
              (levelsByClass, classState) => {
                levelsByClass[classState.classId] = classState.level;
                return levelsByClass;
              },
              {} as Record<string, number>,
            ),
          );
          const governingStat = attackAnalysis.breakdown.governingStat as Ability;
          const generated = WeaponSynthesizer.generateWeaponAction(
            weapon,
            governingStat,
            weaponAttackContext,
            attackAnalysis.criticalDamageMaximized,
          );
          if (generated.effect.type !== "attack") continue;

          generated.id = dynamicAttackId(dynamicAction.id, hand);
          generated.name = `${dynamicAction.name}: ${weapon.name}`;
          generated.activation = dynamicAction.activation;
          if (dynamicAction.tableNote !== undefined) {
            generated.tableNote = dynamicAction.tableNote;
          }
          generated.effect.attackBonus = attackAnalysis.attackBonus;
          generated.effect.damageBonus = attackAnalysis.damageBonus;
          generated.effect.criticalDamage = attackAnalysis.criticalDamage;
          actions.push(generated);
        }
      }
    }

    // endregion

    // region Snapshot

    return {
      abilities,
      proficiencyBonus: profBonus,

      maxHp,
      currentHp: save.hp.current,
      tempHp: save.hp.temporary,
      armorClass,
      initiative,
      speed,
      attacksPerAction,

      skills,
      encumbrance,
      containers,
      equipmentRequirements,
      actions,
      itemActions,
      activeActors,
      summons,
      saves,
      spellcasting,
      spells: spellSynthesis.spells,
      slotPools: spellSynthesis.slotPools,
      baseStates,
      activeStates,
    };

    // endregion
  }

  /**
   * Abilities, HP, AC, initiative and skills, from base states only.
   *
   * Split out of buildLiveSheet so the seam is structural: encumbrance runs on
   * the final STR score this produces, and if its verdict could flow back in
   * here, a belt of giant strength would change the capacity that changed the
   * state that changed the score - no fixed point.
   */
  private static computeStageOne({
    attributes,
    classes,
    baseRolledHp,
    totalLevel,
    profBonus,
    proficiencies,
    modifiers,
    baseStates,
  }: StageOneInput): StageOneResult {
    // 1 - ability scores
    const abilities = {} as Record<Ability, DerivedAbility>;
    const abilityKeys: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

    for (const key of abilityKeys) {
      abilities[key] = AbilityEngine.calculateScore(
        attributes[key.toLowerCase() as keyof typeof attributes],
        key,
        modifiers,
        baseStates,
      );
    }

    // 2 - derived stats
    const levelProfile = {
      total: totalLevel,
      classes: classes.reduce(
        (acc, cls) => {
          acc[cls.classId] = cls.level;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };

    const maxHp = DerivedStatEngine.calculateMaxHp(
      // the UI/Bootstrapper calculates the flat base rolled HP during level up
      baseRolledHp,
      abilities.CON.modifier,
      levelProfile,
      modifiers,
      baseStates,
    );

    const armorClass = DerivedStatEngine.calculateAC(
      Object.fromEntries(
        Object.entries(abilities).map(([ability, derived]) => [
          ability,
          derived.modifier,
        ]),
      ) as Record<Ability, number>,
      modifiers,
      baseStates,
    );

    const initiative = DerivedStatEngine.calculateInitiative(
      abilities.DEX.modifier,
      profBonus,
      proficiencies,
      modifiers,
      baseStates,
    );

    // 3 - skills
    const skills = {} as Record<string, DerivedSkill>;

    for (const skillId of Object.keys(SKILL_MAP)) {
      const governingStat = SKILL_MAP[skillId]?.ability as Ability;
      skills[skillId] = SkillEngine.calculateSkill(
        skillId,
        abilities[governingStat].score,
        profBonus,
        proficiencies,
        modifiers,
        baseStates,
      );
    }

    const saves = SaveEngine.calculateSaves(
      {
        STR: abilities.STR.score,
        DEX: abilities.DEX.score,
        CON: abilities.CON.score,
        INT: abilities.INT.score,
        WIS: abilities.WIS.score,
        CHA: abilities.CHA.score,
      },
      profBonus,
      proficiencies,
      modifiers,
      baseStates,
    );

    return { abilities, maxHp, armorClass, initiative, skills, saves };
  }
}
