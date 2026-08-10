/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type MouseEvent } from "react";
import { useCombat } from "../../hooks/useCombat";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

export const CombatWidget = () => {
  const { attacks } = useCombat();

  const consumeItem = useCharacterSheetStore((state) => state.consumeItem);
  const latestRollResults = useCharacterSheetStore(
    (state) => state.latestRollResults,
  );
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
  const activeActors = runtimeEffects?.getActiveActors() ?? [];
  const characterActions = getCharacterActions().filter(
    (action) => !action.id.startsWith("action_weapon_"),
  );
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

  return (
    <div className="flex flex-col gap-3">
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
                    <span className="font-bold text-gray-900">
                      +{attack.attackBonus}
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
