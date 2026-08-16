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
import {
  AbilityEngine,
  type DerivedAbility,
} from "../calculators/abilities.js";
import { SKILL_MAP } from "@project/shared";
import type { Ability } from "../types/core.js";
import { SkillEngine, type DerivedSkill } from "../calculators/skills.js";
import { SaveEngine, type DerivedSave } from "../calculators/saves.js";
import { CombatEngine } from "../calculators/combat.js";
import type { EffectManager } from "../calculators/effects.js";
import type { ResourceManager } from "../calculators/resources.js";
import { CharacterBootstrapper } from "./characterBootstrapper.js";
import { ActionResolver } from "./actionResolver.js";
import { ModifierExtractor } from "./modifierExtractor.js";
import { ProficiencyExtractor } from "./proficiencyExtractor.js";
import { StateExtractor } from "./stateExtractor.js";
import { InventoryExtractor } from "./inventoryExtractor.js";
import { DerivedStatEngine } from "../calculators/derivedStats.js";
import { SpeedEngine } from "../calculators/speed.js";
import { WeaponSynthesizer } from "./weaponSynthesizer.js";
import { InventoryWeightCalculator } from "../calculators/weight.js";
import {
  DEFAULT_ENCUMBRANCE_RULES,
  EncumbranceEngine,
  POWERFUL_BUILD_STATE,
  type EncumbranceResult,
  type EncumbranceRules,
} from "../calculators/encumbrance.js";
import {
  ContainerEngine,
  type ContainerReport,
} from "../calculators/containers.js";
import {
  DEFAULT_WALKING_SPEED,
  RACE_DICTIONARY,
} from "../rules/raceDictionary.js";
import {
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

  // skills and saves
  skills: Record<string, DerivedSkill>; // keyed by skillId
  saves: Record<string, DerivedSave>; // keyed by Ability (STR, DEX, …)

  // load
  encumbrance: EncumbranceResult;
  /**
   * What sits in each container the character carries, and whether it fits.
   * Partitions the same weight `encumbrance` totals; it never changes it.
   */
  containers: ContainerReport;

  // executable actions (traits, spells, weapons)
  actions: ActionGrant[];
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
  ) {
    const activeTraits = CharacterBootstrapper.hydrateRuntimeManagers(
      save,
      effectManager,
      resourceManager,
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

    // 1- compile active traits from blueprints
    const activeTraits = CharacterBootstrapper.hydrateRuntimeManagers(
      save,
      effectManager,
      resourceManager,
    );
    const criticalHitModifiers = activeTraits.flatMap(
      (trait) => trait.criticalHitModifiers ?? [],
    );

    // 2 - extract static math and proficiencies
    // both extractors read from the same flattened pick table: trait choice
    // blocks and class progression nodes share one namespace once the traits
    // have been compiled and no longer remember who granted them
    const selections = CharacterBootstrapper.resolveSelections(save);
    const staticModifiers = ModifierExtractor.extractModifiers(
      activeTraits,
      selections,
    );
    const proficiencies = ProficiencyExtractor.extractProficiencies(
      activeTraits,
      selections,
    );

    // 3 - merge static trait math with worn equipment and dynamic live math
    // (spells, conditions)
    const baseStates = Array.from(
      new Set([
        ...StateExtractor.extractStates(activeTraits),
        ...effectManager.getActiveStates(),
      ]),
    );
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
    const inventoryModifiers = InventoryExtractor.extractModifiers(
      inventory,
      options.snapshot,
    );
    const liveModifiers = effectManager.getActiveModifiers();
    const allModifiers = [
      ...staticModifiers,
      ...inventoryModifiers,
      ...liveModifiers,
    ];

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

    const race = RACE_DICTIONARY[save.race.baseRaceId];

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
      rules: options.encumbranceRules ?? DEFAULT_ENCUMBRANCE_RULES,
    });

    // reads inventory and nothing else, so it has no stake in the two-stage
    // seam - it sits here because this is where carrying is reasoned about
    const containers = ContainerEngine.report(inventory, options.snapshot);

    const activeStates = Array.from(
      new Set([...baseStates, ...encumbrance.states]),
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
    );

    // endregion

    // region State Synthesis

    // 1 - synthesize actions
    // aggregate static actions from traits
    const actions: ActionGrant[] = activeTraits.flatMap((t) => t.actions || []);

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
      }

      actions.push(...synthesizedActions);
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

      skills,
      encumbrance,
      containers,
      actions,
      activeActors,
      summons,
      saves,
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
      abilities.DEX.modifier,
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
