import { CONDITION_IDS, CONDITION_MAP } from "@project/shared";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

/**
 * A flag board, not a rules engine.
 *
 * Toggling a condition grants its state so authored rules can gate on it -
 * Danger Sense stops applying while you are blinded, deafened, or
 * incapacitated. The condition's own mechanical riders are deliberately not
 * modelled: marking yourself prone does not change your attack rolls here.
 */
export const ConditionsWidget = () => {
  const activeConditions = useCharacterSheetStore(
    (state) => state.activeConditions,
  );
  const toggleCondition = useCharacterSheetStore(
    (state) => state.toggleCondition,
  );

  return (
    <div className="bg-gray-50 border p-3 rounded mt-2">
      <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
        Conditions
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {CONDITION_IDS.map((conditionId) => {
          const condition = CONDITION_MAP[conditionId];
          if (!condition) return null;

          const isActive = activeConditions.includes(conditionId);

          return (
            <button
              key={conditionId}
              type="button"
              aria-pressed={isActive}
              title={condition.summary}
              onClick={() => toggleCondition(conditionId)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                isActive
                  ? "border-amber-700 bg-amber-600 text-white"
                  : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {condition.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
