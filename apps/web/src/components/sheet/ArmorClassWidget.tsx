import { useDerivedStats } from "../../hooks/useCharacterStats";

export const ArmorClassWidget = () => {
  const { armorClass } = useDerivedStats();

  return (
    <div className="rounded-xl border border-gray-300 bg-gradient-to-br from-gray-50 via-white to-gray-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
            Armor Class
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Current defensive posture
          </p>
        </div>
        <div className="rounded-full border border-gray-300 bg-white px-3 py-1 shadow-sm">
          <span className="text-2xl font-bold text-gray-900">
            {armorClass.total}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white/80 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
          Breakdown
        </div>
        {armorClass.breakdown.length === 0 ? (
          <div className="text-sm text-gray-500">
            No modifiers currently contributing.
          </div>
        ) : (
          <div className="space-y-2 text-sm text-gray-700">
            {armorClass.breakdown.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 rounded border border-gray-100 bg-gray-50 px-2 py-2"
              >
                <span>{item.name}</span>
                <span className="font-mono font-semibold text-gray-900">
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
