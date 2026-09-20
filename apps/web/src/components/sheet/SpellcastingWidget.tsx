import { useSpellcasting } from "../../hooks/useCharacterStats";

const CLASS_LABEL: Record<string, string> = {
  class_bard: "Bard",
  class_cleric: "Cleric",
  class_druid: "Druid",
  class_fighter: "Eldritch Knight",
  class_paladin: "Paladin",
  class_ranger: "Ranger",
  class_rogue: "Arcane Trickster",
  class_sorcerer: "Sorcerer",
  class_warlock: "Warlock",
  class_wizard: "Wizard",
};

/**
 * The two numbers every caster needs, one row per casting class.
 *
 * A wizard/cleric has an INT DC and a WIS DC; showing one would be wrong for
 * half of what they cast, so the rows are not collapsed.
 */
export const SpellcastingWidget = () => {
  const entries = useSpellcasting();

  if (entries.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
        Spellcasting
      </p>

      <div className="mt-3 space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.classId}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            title={entry.breakdown}
          >
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {CLASS_LABEL[entry.classId] ?? entry.classId}
              </p>
              <p className="text-xs text-slate-500">
                {entry.ability}
                {entry.pactSlotLevel !== undefined &&
                  ` · pact slots cast at level ${entry.pactSlotLevel}`}
              </p>
            </div>

            <div className="flex gap-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Save DC
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  {entry.saveDc}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  Attack
                </p>
                <p className="text-lg font-semibold text-slate-900">
                  +{entry.attackBonus}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
