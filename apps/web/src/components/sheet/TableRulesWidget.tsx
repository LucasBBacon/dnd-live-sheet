import { TableRulesEngine, type TableRuleLine } from "@project/engine";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const KIND_LABEL: Record<TableRuleLine["kind"], string> = {
  note: "Rule",
  affinity: "Damage",
  suppression: "Suspended",
  reporter: "Reporter",
};

/**
 * Rules the engine reports but cannot enforce.
 *
 * Until this existed, a trait marked manual_sheet_helper reached nobody, and
 * Rage's resistances were authored data that no widget read. Every line here
 * comes from TableRulesEngine; the widget computes nothing itself.
 */
export const TableRulesWidget = () => {
  const activeStates = useCharacterSheetStore((state) => state.activeStates);
  const getActiveTraits = useCharacterSheetStore((state) => state.getActiveTraits);
  const getSuspendedConditions = useCharacterSheetStore(
    (state) => state.getSuspendedConditions,
  );
  // read so a snapshot or progression change re-renders the panel; the
  // compile itself reads them through the store
  useCharacterSheetStore((state) => state.ruleSnapshot);
  useCharacterSheetStore((state) => state.classLevels);
  useCharacterSheetStore((state) => state.traitGrants);
  useCharacterSheetStore((state) => state.activeConditions);

  const lines = TableRulesEngine.describe({
    traits: getActiveTraits(),
    activeStates,
    suspendedConditions: getSuspendedConditions(),
  });

  return (
    <div className="bg-gray-50 border p-3 rounded mt-2">
      <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
        Rules at the table
      </h3>

      {lines.length === 0 ? (
        <p className="text-xs text-gray-500">Nothing to report.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((line, index) => (
            <li
              key={`${line.kind}:${line.source}:${index}`}
              className="rounded border border-gray-200 bg-white px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] uppercase text-gray-600">
                  {KIND_LABEL[line.kind]}
                </span>
                <span className="text-xs font-semibold text-gray-900">
                  {line.source}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-700">{line.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
