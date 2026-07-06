import { useLevelUpStore } from "../../../../store/levelUpStore";
import { useAbilities } from "../../../../hooks/useCharacterStats";
import { ABILITY_STATS } from "../../../../utils/abilityConstants";

const MAX_STAT_SCORE = 20;
const TOTAL_POINTS = 2;

export const AsiDistribution = () => {
  const { draftPayload, updateDraft } = useLevelUpStore();
  const { finalAbilities } = useAbilities();

  const asiChoices = draftPayload.asiChoices || [];

  // Calculate how many points have been spent
  const spentPoints = asiChoices.reduce((sum, choice) => sum + choice.value, 0);
  const remainingPoints = TOTAL_POINTS - spentPoints;

  const handleAdjust = (stat: string, delta: number) => {
    let currentChoices = [...asiChoices];
    const existingIndex = currentChoices.findIndex((c) => c.stat === stat);
    const currentValue =
      existingIndex >= 0 ? currentChoices[existingIndex].value : 0;

    const newValue = currentValue + delta;

    if (newValue === 0) {
      // Remove from array if 0 to keep payload clean
      currentChoices = currentChoices.filter((c) => c.stat !== stat);
    } else if (existingIndex >= 0) {
      currentChoices[existingIndex].value = newValue;
    } else {
      currentChoices.push({ stat, value: newValue });
    }

    updateDraft({ asiChoices: currentChoices });
  };

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto">
      {/* Pool Header */}
      <div className="bg-gray-900 text-white p-3 rounded flex justify-between items-center shadow-sm">
        <span className="font-bold uppercase text-sm tracking-wider">
          Points Available
        </span>
        <span className="text-2xl font-extrabold">{remainingPoints}</span>
      </div>

      {/* Stat Iteration */}
      <div className="flex flex-col gap-2">
        {ABILITY_STATS.map((stat) => {
          const currentScore = finalAbilities[stat].score;
          const allocated = asiChoices.find((c) => c.stat === stat)?.value || 0;
          const projectedScore = currentScore + allocated;

          const canIncrease =
            remainingPoints > 0 && projectedScore < MAX_STAT_SCORE;
          const canDecrease = allocated > 0;

          return (
            <div
              key={stat}
              className="flex justify-between items-center bg-white border-2 border-gray-200 p-2 rounded shadow-sm"
            >
              <div className="flex flex-col w-1/3">
                <span className="font-bold uppercase text-gray-800">
                  {stat}
                </span>
                <span className="text-xs text-gray-500">
                  Base: {currentScore}
                </span>
              </div>

              <div className="w-1/3 text-center text-xl font-extrabold text-indigo-700">
                {projectedScore}
              </div>

              <div className="w-1/3 flex justify-end gap-2">
                <button
                  onClick={() => handleAdjust(stat, -1)}
                  disabled={!canDecrease}
                  className="w-8 h-8 rounded bg-gray-200 text-gray-700 font-bold hover:bg-gray-300 disabled:opacity-30 flex items-center justify-center"
                >
                  -
                </button>
                <button
                  onClick={() => handleAdjust(stat, 1)}
                  disabled={!canIncrease}
                  className="w-8 h-8 rounded bg-gray-200 text-gray-900 font-bold hover:bg-gray-300 disabled:opacity-30 flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {remainingPoints === 0 && (
        <div className="text-center text-green-600 font-bold uppercase text-xs tracking-widest mt-2">
          Points Fully Allocated
        </div>
      )}
    </div>
  );
};
