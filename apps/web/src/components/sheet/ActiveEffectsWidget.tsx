import type { ActiveEffect } from "@project/engine";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const DURATION_LABELS: Record<string, string> = {
  turn_end: "until the end of your turn",
  turn_start: "until the start of your next turn",
  rest_short: "until a short rest",
  rest_long: "until a long rest",
  manual: "until removed",
};

const durationLabel = (effect: ActiveEffect): string => {
  if (effect.durationType === "rounds") {
    const rounds = effect.durationRemaining ?? 0;
    return `${rounds} ${rounds === 1 ? "round" : "rounds"}`;
  }

  return DURATION_LABELS[effect.durationType] ?? effect.durationType;
};

/**
 * What is currently affecting the character, and how to stop it.
 *
 * Everything the engine computes flows through effects - Rage's damage, Danger
 * Sense's rider, Dash's doubled speed, Reckless Attack's exposure - but until
 * this panel existed the player only saw the numbers move. This is where a
 * changed number gets its reason.
 *
 * Dismissal reuses the authored "end" actions rather than reaching into the
 * effect manager: the server owns effects, and an action already goes through
 * it. A button appears only where such an action exists, so Rage and Hiding can
 * be stopped and Dash cannot - which is correct, since Dash ends on its own.
 */
export const ActiveEffectsWidget = () => {
  const runtimeEffects = useCharacterSheetStore(
    (state) => state.runtimeEffects,
  );
  const getCharacterActions = useCharacterSheetStore(
    (state) => state.getCharacterActions,
  );
  const executeCharacterAction = useCharacterSheetStore(
    (state) => state.executeCharacterAction,
  );

  const effects = (runtimeEffects?.getActiveEffects() ?? []).filter(
    // trait states are permanent facts, and summons have their own panel
    (effect) => effect.kind !== "trait_state" && effect.kind !== "summon",
  );

  const enderFor = (effectTag: string | undefined) => {
    if (!effectTag) return undefined;

    return getCharacterActions().find(
      (action) =>
        action.effect.type === "remove_effect" &&
        action.effect.effectTag === effectTag,
    );
  };

  return (
    <div className="bg-gray-50 border p-3 rounded mt-2">
      <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
        Active effects
      </h3>

      {effects.length === 0 ? (
        <p className="text-xs text-gray-500">Nothing active.</p>
      ) : (
        <ul className="space-y-2">
          {effects.map((effect) => {
            const ender = enderFor(effect.effectTag);

            return (
              <li
                key={effect.instanceId}
                className="rounded border border-gray-200 bg-white px-2.5 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      {effect.sourceName}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {durationLabel(effect)}
                    </div>
                  </div>

                  {ender && (
                    <button
                      type="button"
                      onClick={() => executeCharacterAction(ender.id)}
                      className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      {ender.name}
                    </button>
                  )}
                </div>

                {effect.grantedStates.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {effect.grantedStates.map((state) => (
                      <span
                        key={state}
                        className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600"
                      >
                        {state}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
