import type { DerivedSave } from "@project/engine";
import { useCheckRoll } from "../../hooks/useCheckRoll";
import { useDerivedStats } from "../../hooks/useCharacterStats";

const ABILITY_ORDER = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

const ABILITY_NAMES: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

const signed = (value: number): string => (value >= 0 ? `+${value}` : `${value}`);

const RollStateBadge = ({ rollState }: { rollState: DerivedSave["rollState"] }) => {
  if (rollState === "normal") return null;

  const isAdvantage = rollState === "advantage";

  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isAdvantage
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      {isAdvantage ? "ADV" : "DIS"}
    </span>
  );
};

export const SavingThrowsWidget = () => {
  const { saves } = useDerivedStats();
  const rollCheck = useCheckRoll();

  const rows = ABILITY_ORDER.map((ability) => saves[ability]).filter(
    (save): save is DerivedSave => Boolean(save),
  );

  // riders the engine declined to resolve, gathered under the table so each one
  // is stated once rather than crammed into its row
  const notes = rows.flatMap((save) =>
    save.conditionalNotes.map((note) => ({ ability: save.ability, ...note })),
  );

  return (
    <div className="bg-white border-2 border-gray-300 p-4 rounded">
      <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-2 uppercase">
        Saving Throws
      </h2>

      <ul className="text-xs">
        {rows.map((save) => (
          <li
            key={save.ability}
            className="flex items-center justify-between gap-2 border-b border-gray-100 py-1"
            data-proficient={save.isProficient ? "true" : "false"}
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full ${
                  save.isProficient ? "bg-gray-800" : "border border-gray-400"
                }`}
              />
              <span
                className={save.isProficient ? "font-bold" : "text-gray-600"}
              >
                {ABILITY_NAMES[save.ability] ?? save.ability}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                {save.ability}
              </span>
            </span>

            <span className="flex items-center gap-1.5">
              <RollStateBadge rollState={save.rollState} />
              {save.conditionalNotes.length > 0 && (
                <span aria-hidden="true" className="text-gray-400">
                  *
                </span>
              )}
              <button
                type="button"
                data-ability={save.ability}
                onClick={() =>
                  void rollCheck({
                    label: `${ABILITY_NAMES[save.ability] ?? save.ability} save`,
                    modifier: save.totalModifier,
                    target: "SAVING_THROW",
                  })
                }
                className="rounded border border-gray-300 px-1.5 py-0.5 font-mono hover:bg-gray-100"
              >
                {signed(save.totalModifier)}
              </button>
            </span>
          </li>
        ))}
      </ul>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-200 pt-2 text-[11px] leading-4 text-gray-600">
          {notes.map((note, index) => (
            <li key={`${note.ability}:${note.source}:${index}`}>
              <span aria-hidden="true">* </span>
              <span className="font-semibold">{note.ability}</span>{" "}
              {note.type === "disadvantage" ? "disadvantage" : "advantage"}{" "}
              {note.appliesWhen} — {note.source}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
