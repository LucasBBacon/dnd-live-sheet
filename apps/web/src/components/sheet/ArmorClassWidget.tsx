import { useDerivedStats } from "../../hooks/useCharacterStats";

export const ArmorClassWidget = () => {
  const { armorClass } = useDerivedStats();

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
