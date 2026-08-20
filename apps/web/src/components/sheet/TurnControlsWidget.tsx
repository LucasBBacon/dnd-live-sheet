import { SurpriseEngine } from "@project/engine";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

/**
 * Turn controls and the action economy, tracked rather than policed.
 *
 * Spent parts are dimmed, never disabled, and the turn buttons are always
 * live. Tables bend the economy constantly - a DM grants a free action, a
 * reaction gets retconned - and a sheet that refuses becomes one the player
 * fights instead of uses. The authority for all of this is the server; this
 * widget only asks and displays.
 */
export const TurnControlsWidget = () => {
  const combatContext = useCharacterSheetStore((state) => state.combatContext);
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const beginTurn = useCharacterSheetStore((state) => state.beginTurn);
  const endTurn = useCharacterSheetStore((state) => state.endTurn);
  const setSurprised = useCharacterSheetStore((state) => state.setSurprised);
  const getCharacterActions = useCharacterSheetStore(
    (state) => state.getCharacterActions,
  );

  /**
   * What spent this part of the economy, named rather than shown as an id.
   *
   * This is what keeps the plain actions honest: Disengage and Help carry no
   * state and no modifier, so the only trace they leave is here.
   */
  const spenderName = (sourceId: string | undefined): string | null => {
    if (!sourceId) return null;

    return (
      getCharacterActions().find((action) => action.id === sourceId)?.name ??
      sourceId
    );
  };

  /**
   * Surprise costs the action and the reaction, and Feral Instinct can give
   * them back. Shown as a banner rather than by dimming the pills: the pills
   * mean "you spent this", and a surprised character has spent nothing.
   */
  const surprise = SurpriseEngine.describe({
    surprised: combatContext.surprised,
    activeStates,
  });

  const parts = [
    {
      label: "Action",
      available: combatContext.economy.actionAvailable,
      spentBy: spenderName(combatContext.economy.spentActionSourceId),
    },
    {
      label: "Bonus",
      available: combatContext.economy.bonusActionAvailable,
      spentBy: spenderName(combatContext.economy.spentBonusActionSourceId),
    },
    {
      label: "Reaction",
      available: combatContext.economy.reactionAvailable,
      spentBy: spenderName(combatContext.economy.spentReactionSourceId),
    },
  ];

  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Turn
          </span>
          {combatContext.inCombat && combatContext.roundNumber !== null && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white">
              Round {combatContext.roundNumber}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            <input
              type="checkbox"
              checked={combatContext.surprised}
              onChange={(event) => setSurprised(event.target.checked)}
              className="h-3 w-3 accent-amber-600"
            />
            Surprised
          </label>
          <button
            type="button"
            onClick={beginTurn}
            className="rounded border border-slate-700 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-800 hover:bg-slate-100"
          >
            Begin turn
          </button>
          <button
            type="button"
            onClick={endTurn}
            className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-slate-900"
          >
            End turn
          </button>
        </div>
      </div>

      {surprise.outcome !== "not_surprised" && (
        <p
          data-surprise={surprise.outcome}
          className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
            surprise.outcome === "released"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
        >
          {surprise.summary}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {parts.map((part) => (
          <span
            key={part.label}
            data-spent={part.available ? "false" : "true"}
            title={part.available ? `${part.label} available` : `${part.label} spent`}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              part.available
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-300 bg-slate-100 text-slate-400 line-through"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                part.available ? "bg-emerald-500" : "bg-slate-400"
              }`}
            />
            {part.label}
            {!part.available && part.spentBy && (
              <span className="font-normal normal-case text-slate-500">
                — {part.spentBy}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
};
