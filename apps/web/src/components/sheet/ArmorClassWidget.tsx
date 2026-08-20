import { useDerivedStats } from "../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

/**
 * Rules that make the character easier to hit without changing their AC.
 *
 * Reckless Attack is the first of these: the attack rolls it affects are the
 * DM's, so there is no number for the engine to move. Surfacing the state next
 * to the AC is the honest alternative to inventing one - the player can see the
 * cost they accepted, and can tell the table about it.
 */
const EXPOSURE_STATE = "status_attacks_against_have_advantage";
const GUARDED_STATE = "status_attacks_against_have_disadvantage";

export const ArmorClassWidget = () => {
  const { armorClass } = useDerivedStats();
  const isExposed = useCharacterSheetStore((state) =>
    state.activeStates.includes(EXPOSURE_STATE),
  );
  const isGuarded = useCharacterSheetStore((state) =>
    state.activeStates.includes(GUARDED_STATE),
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 p-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg shadow-inner">
            🛡️
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-300">
              Armor Class
            </p>
            <p className="mt-1 text-sm text-slate-300/90">
              Current defensive posture
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-center shadow-inner backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-300">
            Total
          </div>
          <div className="text-3xl font-black leading-none text-white">
            {armorClass.total}
          </div>
        </div>
      </div>

      {/*
        Both are reported when both apply. They cancel at the table, but
        resolving that here would hide one of the two sources from a player who
        needs to explain the roll to their DM.
      */}
      {isGuarded && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-300/40 bg-emerald-400/15 p-3"
        >
          <span aria-hidden="true" className="text-base leading-none">
            🛡️
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-100">
              Attacks against you have disadvantage
            </p>
            <p className="mt-0.5 text-xs text-emerald-100/80">
              Until the start of your next turn.
            </p>
          </div>
        </div>
      )}

      {isExposed && (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-400/15 p-3"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ⚠️
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-100">
              Attacks against you have advantage
            </p>
            <p className="mt-0.5 text-xs text-amber-100/80">
              Until the start of your next turn.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-sm">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-300">
          Breakdown
        </div>
        {armorClass.breakdown.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/20 bg-white/5 px-3 py-3 text-sm text-slate-300">
            No modifiers currently contributing.
          </div>
        ) : (
          <div className="space-y-2">
            {armorClass.breakdown.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/20 px-3 py-2"
              >
                <span className="text-sm text-slate-100">{item.name}</span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-sm font-semibold text-white">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
