import { useAbilities } from "../../../hooks/useCharacterStats";
import { useLevelUpStore } from "../../../store/levelUpStore";
import { useRollStore } from "../../../store/rollStore";

const CLASS_HIT_DICE: Record<string, number> = {
  class_fighter: 10,
  class_rogue: 8,
  class_wizard: 6,
};

export const HpRollStep = () => {
  const { draftPayload, updateDraft } = useLevelUpStore();
  const requestRoll = useRollStore((state) => state.requestRoll);

  // get live CON modifier
  const { finalAbilities } = useAbilities();
  const conMod = finalAbilities.con.modifier;

  // determine die size based on the class being leveled up
  const hitDieSize = CLASS_HIT_DICE[draftPayload.targetClassId!] || 8;

  // 5e rule: average = half die size + 1
  const averageRoll = hitDieSize / 2 + 1;

  // calculate display totals for ui, DON'T save them to payload
  const displayAverageTotal = averageRoll + conMod;
  const displayCurrentRollTotal = draftPayload.hpRoll
    ? draftPayload.hpRoll + conMod
    : null;

  const handleTakeAverage = () => {
    updateDraft({ hpRoll: averageRoll });
  };

  const handleRoll = async () => {
    try {
      // suspend execution and mount global RollInterceptor
      // DON'T include con mod in roll expression raw dice only
      const rawDieResult = await requestRoll(
        `1d${hitDieSize}`,
        "Level Up: Roll for HP",
      );

      // save ONLY raw die to payload
      updateDraft({ hpRoll: rawDieResult });
    } catch (error) {
      console.log("User cancelled the roll interceptor.", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
        Hit Points Increase
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Your new level grants you additional Hit Points. You can either take the
        fixed average, or roll a d{hitDieSize}.<br />
        <br />
        <span className="italic">
          Note: Your Constitution modifier ({conMod >= 0 ? "+" : ""}
          {conMod}) is automatically applied to your total.
        </span>
      </p>

      <div className="flex gap-4 mb-6">
        {/* PATH A: TAKE AVERAGE */}
        <button
          onClick={handleTakeAverage}
          className={`flex-1 p-6 border-2 rounded flex flex-col items-center justify-center transition-colors ${draftPayload.hpRoll === averageRoll ? "bg-indigo-50 border-indigo-600" : "border-gray-300 hover:border-gray-500"}`}
        >
          <span className="text-xs text-gray-500 uppercase font-bold mb-2">
            Take Average
          </span>
          <span className="text-3xl font-extrabold text-gray-900">
            {averageRoll}
          </span>
          <span className="text-xs text-gray-500 mt-2">
            Total +CON: {displayAverageTotal}
          </span>
        </button>

        {/* PATH B: ROLL */}
        <button
          onClick={handleRoll}
          className={`flex-1 p-6 border-2 rounded flex flex-col items-center justify-center transition-colors ${draftPayload.hpRoll && draftPayload.hpRoll !== averageRoll ? "bg-indigo-50 border-indigo-600" : "border-gray-300 hover:border-gray-500"}`}
        >
          <span className="text-xs text-gray-500 uppercase font-bold mb-2">
            Roll 1d{hitDieSize}
          </span>
          {draftPayload.hpRoll && draftPayload.hpRoll !== averageRoll ? (
            <>
              <span className="text-3xl font-extrabold text-indigo-700">
                {draftPayload.hpRoll}
              </span>
              <span className="text-xs text-indigo-500 mt-2 font-bold">
                Total +CON: {displayCurrentRollTotal}
              </span>
            </>
          ) : (
            <>
              <span className="text-3xl font-extrabold text-indigo-700">?</span>
              <span className="text-xs text-gray-400 mt-2 italic">
                Click to Roll
              </span>
            </>
          )}
        </button>
      </div>

      {/* CONFIRMATION STATE */}
      <div className="mt-auto bg-gray-50 border border-gray-200 p-4 rounded text-center">
        {draftPayload.hpRoll ? (
          <div className="text-green-700 font-bold uppercase tracking-widest text-sm">
            Valid HP Selection Recorded
          </div>
        ) : (
          <div className="text-gray-400 font-bold uppercase tracking-widest text-sm">
            Select an option to proceed
          </div>
        )}
      </div>
    </div>
  );
};
