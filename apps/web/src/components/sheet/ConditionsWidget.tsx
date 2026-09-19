import { CONDITION_IDS, CONDITION_MAP } from "@project/shared";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

/**
 * A flag board, not a rules engine.
 *
 * Toggling a condition grants its state so authored rules can gate on it -
 * Danger Sense stops applying while you are blinded, deafened, or
 * incapacitated. The condition's own mechanical riders are deliberately not
 * modelled: marking yourself prone does not change your attack rolls here.
 *
 * A condition a trait suspends - frightened while a Mindless Rage berserker
 * rages - stays toggled, so it returns when the rage ends, and is drawn struck
 * through with the trait named.
 */
export const ConditionsWidget = () => {
  const activeConditions = useCharacterSheetStore(
    (state) => state.activeConditions,
  );
  const toggleCondition = useCharacterSheetStore(
    (state) => state.toggleCondition,
  );
  const getSuspendedConditions = useCharacterSheetStore(
    (state) => state.getSuspendedConditions,
  );
  // read so a rage starting or ending re-renders the chips; the suppression
  // reads its gates through the store
  useCharacterSheetStore((state) => state.activeStates);

  const suspendedBy = new Map(
    getSuspendedConditions().map((entry) => [entry.condition, entry.source]),
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
          const suppressor = suspendedBy.get(conditionId);

          return (
            <button
              key={conditionId}
              type="button"
              aria-pressed={isActive}
              title={suppressor ? `Suspended by ${suppressor}` : condition.summary}
              onClick={() => toggleCondition(conditionId)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                suppressor
                  ? "border-amber-300 bg-amber-50 text-amber-700 line-through"
                  : isActive
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
