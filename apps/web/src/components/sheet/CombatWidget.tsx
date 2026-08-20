/* eslint-disable @typescript-eslint/no-explicit-any */
import { TRAIT_DICTIONARY, resolveItemDefinition } from "@project/engine";
import { costsAttack } from "@project/shared";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useCombat } from "../../hooks/useCombat";
import { useDerivedStats } from "../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { TurnControlsWidget } from "./TurnControlsWidget";
import { useRollStore } from "../../store/rollStore";

const PROTECTION_TRAIT_ID = "trait_fs_protection";

const hasProtectionTrait = (
  traits: Array<{ id: string }>,
  traitGrants: Array<{ traitId: string }>,
) => {
  return (
    traits.some((trait) => trait.id === PROTECTION_TRAIT_ID) ||
    traitGrants.some((grant) => grant.traitId === PROTECTION_TRAIT_ID)
  );
};

export const CombatWidget = () => {
  const { attacks } = useCombat();
  const { attacksPerAction } = useDerivedStats();
  const requestRoll = useRollStore((state) => state.requestRoll);

  const consumeItem = useCharacterSheetStore((state) => state.consumeItem);
  const traits = useCharacterSheetStore((state) => state.traits);
  const traitGrants = useCharacterSheetStore((state) => state.traitGrants);
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const combatContext = useCharacterSheetStore((state) => state.combatContext);
  const attacksRemaining = combatContext.economy.attacksRemaining;
  const latestRollResults = useCharacterSheetStore(
    (state) => state.latestRollResults,
  );
  const recordRollResult = useCharacterSheetStore(
    (state) => state.recordRollResult,
  );
  const openHostileAttackReactionWindow = useCharacterSheetStore(
    (state) => state.openHostileAttackReactionWindow,
  );
  const resolveCombatEvent = useCharacterSheetStore(
    (state) => state.resolveCombatEvent,
  );
  const spendReaction = useCharacterSheetStore((state) => state.spendReaction);
  const runtimeEffects = useCharacterSheetStore(
    (state) => state.runtimeEffects,
  );
  const selectedActorInstanceId = useCharacterSheetStore(
    (state) => state.selectedActorInstanceId,
  );
  const selectActorInstance = useCharacterSheetStore(
    (state) => state.selectActorInstance,
  );
  const executeActorAction = useCharacterSheetStore(
    (state) => state.executeActorAction,
  );
  const getCharacterActions = useCharacterSheetStore(
    (state) => state.getCharacterActions,
  );
  const executeCharacterAction = useCharacterSheetStore(
    (state) => state.executeCharacterAction,
  );
  const activeActors = useMemo(
    () => runtimeEffects?.getActiveActors() ?? [],
    [runtimeEffects],
  );
  // classified by what the action costs rather than by how its id is spelled.
  // Swings are rendered as attack cards below, so they do not belong in the
  // character-action list.
  const characterActions = getCharacterActions().filter(
    (action) => !costsAttack(action.activation),
  );
  const protectionTrait = TRAIT_DICTIONARY[PROTECTION_TRAIT_ID];
  const protectionAvailable = hasProtectionTrait(traits, traitGrants);
  const reactionAvailable = combatContext.economy.reactionAvailable;
  const pendingProtectionWindow = combatContext.pendingEvents.find(
    (event) =>
      event.type === "reaction_window_opened" &&
      event.status === "pending" &&
      event.relationship === "adjacent_ally",
  );
  const hasEquippedShield = inventory.some((item) => {
    if (item.slot !== "off_hand") return false;

    const definition = resolveItemDefinition(
      item.itemId,
      ruleSnapshot ?? undefined,
    );
    return definition?.type === "armor" && definition.equipSlot === "off_hand";
  });
  const selectedActor =
    activeActors.find(
      (actor) => actor.instanceId === selectedActorInstanceId,
    ) ??
    activeActors[0] ??
    null;

  useEffect(() => {
    if (activeActors.length === 0 && selectedActorInstanceId !== null) {
      selectActorInstance(null);
      return;
    }

    if (
      activeActors.length > 0 &&
      selectedActorInstanceId === null &&
      activeActors[0]
    ) {
      selectActorInstance(activeActors[0].instanceId);
    }
  }, [activeActors, selectActorInstance, selectedActorInstanceId]);
  const [tooltip, setTooltip] = useState<{
    title: string;
    lines: string[];
    top: number;
    left: number;
  } | null>(null);

  const showTooltip = (
    event: MouseEvent<HTMLDivElement>,
    title: string,
    lines: string[],
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 220;
    const left = Math.min(rect.left, window.innerWidth - width - 12);

    setTooltip({
      title,
      lines,
      top: rect.bottom + 8,
      left: Math.max(12, left),
    });
  };

  const handleAttack = (attack: any) => {
    if (attack.requiresAmmo) {
      if (attack.currentAmmo <= 0) return; // prevent negative ammo
      consumeItem(attack.ammoInventoryId, 1);
    }

    executeCharacterAction(attack.actionId);
  };

  const handleProtection = async () => {
    const pendingWindowId = pendingProtectionWindow?.id;
    if (!pendingWindowId) return;

    try {
      const total = await requestRoll(
        "1d20",
        "Enter the enemy attack total after applying Protection disadvantage.",
        {
          mode: "manual_total",
          targetLabel: "Enemy attack total",
          allowDigitalRoll: false,
          manualPlaceholder: "Attack total...",
          submitLabel: "Record",
        },
      );

      if (!spendReaction(PROTECTION_TRAIT_ID)) {
        resolveCombatEvent(pendingWindowId, {
          status: "dismissed",
          summary: "Reaction unavailable",
          reactionSourceId: PROTECTION_TRAIT_ID,
        });
        return;
      }

      recordRollResult({
        characterId: "",
        rollResults: [
          {
            total,
            rolls: [total],
            modifier: 0,
            target: "ATTACK_ROLL",
            label: protectionTrait?.name,
            summary: "Manual disadvantaged enemy attack total",
          },
        ],
        timestamp: Date.now(),
      });

      resolveCombatEvent(pendingWindowId, {
        status: "resolved",
        summary: "Protection applied",
        reactionSourceId: PROTECTION_TRAIT_ID,
        rollSnapshot: {
          id: `roll_${pendingWindowId}`,
          kind: "attack",
          knowledge: "manual_total",
          total,
          relationship: "adjacent_ally",
          rawRolls: [],
          hasAdvantage: false,
          hasDisadvantage: true,
          sourceLabel: pendingProtectionWindow.sourceLabel,
          targetLabel: pendingProtectionWindow.targetLabel,
        },
      });
    } catch {
      return;
    }
  };

  const handleDeclareHostileAttack = async () => {
    try {
      const total = await requestRoll(
        "1d20",
        "Enter the hostile attack total that is threatening an ally within 5 feet.",
        {
          mode: "manual_total",
          targetLabel: "Hostile attack total",
          allowDigitalRoll: false,
          manualPlaceholder: "Attack total...",
          submitLabel: "Open window",
        },
      );

      openHostileAttackReactionWindow({
        sourceLabel: "Hostile creature",
        targetLabel: "Nearby ally",
        relationship: "adjacent_ally",
        rollSnapshot: {
          id: `roll_declared_${Date.now()}`,
          kind: "attack",
          knowledge: "manual_total",
          total,
          relationship: "adjacent_ally",
          rawRolls: [],
          hasAdvantage: false,
          hasDisadvantage: false,
        },
      });
    } catch {
      return;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <TurnControlsWidget />

      {/*
        Stated once for the Attack action rather than per weapon card: the
        extra attacks are yours to split across your weapons, so a badge on
        each card would read as "two swings with this one".

        Reads as an offer before the Attack action is taken and as a tally
        after, which is what makes the implicit declaration visible - the
        player never clicks "Attack", so the state has to say it happened.
      */}
      {attacksPerAction.total > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Attack action
          </span>
          <span className="text-sm text-slate-800">
            <span className="font-bold">
              {attacksRemaining === null || attacksRemaining === undefined
                ? `${attacksPerAction.total} attacks`
                : `${attacksPerAction.total - attacksRemaining} of ${attacksPerAction.total} used`}
            </span>
            {attacksPerAction.breakdown[0] && (
              <span className="text-slate-500">
                {" "}
                — {attacksPerAction.breakdown[0].name}
              </span>
            )}
          </span>
        </div>
      )}

      {protectionAvailable && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Reaction helper
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <div className="text-sm font-semibold text-emerald-950">
                {protectionTrait?.name ?? "Protection"}
              </div>
              <p className="mt-1 text-xs leading-5 text-emerald-900">
                {protectionTrait?.lore?.shortDescription}
              </p>
              <p className="mt-2 text-xs text-emerald-800">
                Declare a hostile attack to open a reaction window, then apply
                Protection to resolve it.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <button
                type="button"
                onClick={() => {
                  void handleDeclareHostileAttack();
                }}
                className="rounded border border-emerald-700 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-800 hover:bg-emerald-100"
              >
                Declare hostile attack
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleProtection();
                }}
                disabled={
                  !hasEquippedShield ||
                  !reactionAvailable ||
                  pendingProtectionWindow === undefined
                }
                className="rounded bg-emerald-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-200 disabled:text-emerald-700"
              >
                Use Protection
              </button>
              <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">
                {!hasEquippedShield
                  ? "Equip a shield in your off hand"
                  : !reactionAvailable
                    ? "Reaction spent"
                    : pendingProtectionWindow
                      ? "Reaction window open"
                      : "Declare hostile attack first"}
              </span>
            </div>
          </div>
        </div>
      )}

      {characterActions.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
            Character actions
          </div>
          <div className="flex flex-wrap gap-2">
            {characterActions.map((action) => (
              <button
                key={action.id}
                onClick={() => executeCharacterAction(action.id)}
                className="rounded bg-amber-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-amber-800"
              >
                {action.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeActors.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
            Active actors
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {activeActors.map((actor) => {
              const isSelected = selectedActor?.instanceId === actor.instanceId;
              return (
                <button
                  key={actor.instanceId}
                  onClick={() => selectActorInstance(actor.instanceId)}
                  className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    isSelected
                      ? "bg-blue-700 text-white"
                      : "bg-white text-blue-800 border border-blue-300 hover:bg-blue-100"
                  }`}
                >
                  {actor.displayLabel}
                </button>
              );
            })}
          </div>

          {selectedActor && (
            <div className="rounded border border-blue-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold text-blue-900">
                {selectedActor.displayLabel} actions
              </div>
              {selectedActor.availableActions.length === 0 ? (
                <div className="text-xs text-blue-700">
                  No actions available.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedActor.availableActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() =>
                        executeActorAction(action.id, selectedActor.instanceId)
                      }
                      className="rounded bg-blue-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-blue-800"
                    >
                      {action.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {latestRollResults.length > 0 && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
            Latest rolls
          </div>
          <div className="flex flex-col gap-2">
            {latestRollResults.map((result, index) => (
              <div
                key={`${result.target}-${index}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2"
              >
                <div>
                  <div className="font-semibold text-gray-900">
                    {result.target === "SAVING_THROW"
                      ? "Saving throw"
                      : result.target === "ATTACK_ROLL"
                        ? "Attack roll"
                        : "Damage roll"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {result.target === "ATTACK_ROLL" && result.label
                      ? `${result.label}${result.summary ? ` • ${result.summary}` : ""}`
                      : result.damageType
                        ? `${result.damageType}`
                        : "authored effect"}
                  </div>
                </div>
                <div className="text-sm font-bold text-red-700">
                  {result.total}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {attacks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-400 bg-gray-50 p-5 text-center text-sm text-gray-600">
          <p className="font-semibold text-gray-700">No active weapon ready</p>
          <p className="mt-1">
            Equip a weapon in your active hand slots to make attacks available.
          </p>
        </div>
      ) : (
        attacks.map((attack, idx) => {
          const outOfAmmo = attack.requiresAmmo && attack.currentAmmo <= 0;

          return (
            <div
              key={idx}
              className={`flex overflow-hidden rounded-xl border shadow-sm ${outOfAmmo ? "border-red-200 bg-red-50/70" : "border-gray-300 bg-white"}`}
            >
              <div className="flex flex-1 flex-col">
                <div
                  className={`flex items-center justify-between border-b px-3 py-2 ${outOfAmmo ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}
                >
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {attack.name}
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                      {attack.slot}
                    </div>
                  </div>
                  <div
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${outOfAmmo ? "bg-red-100 text-red-700" : "bg-gray-900 text-white"}`}
                  >
                    {outOfAmmo ? "Needs ammo" : "Ready"}
                  </div>
                </div>
                {/*
                  Two-weapon fighting is a bonus attack you only get after
                  taking the Attack action with a light weapon. Stated, not
                  enforced: the sheet tracks the economy rather than policing
                  it, and the DM may well have said otherwise.
                */}
                {attack.context.attackUsage === "two_weapon_bonus" &&
                  attacksRemaining === null && (
                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                      Requires the Attack action with a light weapon first
                    </div>
                  )}

                <div className="flex flex-wrap gap-4 p-3">
                  <div
                    className="cursor-help"
                    onMouseEnter={(event) =>
                      showTooltip(event, "Action Type", [
                        attack.activation === "bonus_action"
                          ? "Bonus action"
                          : "Action",
                      ])
                    }
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-gray-500">
                      ACT
                    </span>
                    <span className="font-bold text-gray-900">
                      {attack.activation === "bonus_action"
                        ? "BONUS"
                        : "ACTION"}
                    </span>
                  </div>
                  <div
                    className="cursor-help"
                    onMouseEnter={(event) =>
                      showTooltip(event, "Attack Roll", attack.breakdown.attack)
                    }
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-gray-500">
                      ATK
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900">
                        +{attack.attackBonus}
                      </span>
                      {attack.rollState !== "normal" && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            attack.rollState === "advantage"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {attack.rollState === "advantage" ? "ADV" : "DIS"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div
                    className="cursor-help"
                    onMouseEnter={(event) =>
                      showTooltip(event, "Damage Roll", attack.breakdown.damage)
                    }
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <span className="block text-[11px] uppercase tracking-[0.2em] text-gray-500">
                      DMG
                    </span>
                    <span className="font-bold text-red-700">
                      {attack.damageExpression}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex min-w-[110px] flex-col items-center justify-center border-l border-gray-200 bg-gray-50 p-3">
                {attack.requiresAmmo && (
                  <div
                    className={`mb-2 text-xs font-mono ${outOfAmmo ? "font-bold text-red-600" : "text-gray-600"}`}
                  >
                    AMMO: {attack.currentAmmo}
                  </div>
                )}

                <button
                  onClick={() => handleAttack(attack)}
                  disabled={outOfAmmo}
                  className={`w-full rounded px-3 py-2 text-sm font-bold shadow-sm ${
                    outOfAmmo
                      ? "cursor-not-allowed bg-gray-200 text-gray-400"
                      : "cursor-pointer bg-red-700 text-white hover:bg-red-800"
                  }`}
                >
                  {outOfAmmo ? "EMPTY" : "STRIKE"}
                </button>
              </div>
            </div>
          );
        })
      )}

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none flex max-w-[220px] flex-col rounded border border-gray-700 bg-gray-900 p-2 text-xs text-white shadow-xl"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          <span className="font-bold mb-1 border-b border-gray-600">
            {tooltip.title}
          </span>
          {tooltip.lines.map((step, index) => (
            <span key={index}>{step}</span>
          ))}
        </div>
      )}
    </div>
  );
};
