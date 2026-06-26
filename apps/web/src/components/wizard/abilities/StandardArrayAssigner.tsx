import { useEffect } from "react";
import { useWizardStore, type Attributes } from "../../../store/wizardStore";

const STATS: Attributes[] = ["str", "dex", "con", "int", "wis", "cha"];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const StandardArrayAssigner = () => {
  const scores = useWizardStore((state) => state.baseAbilityScores);
  const setScore = useWizardStore((state) => state.setBaseAbilityScore);
  const setAllScores = useWizardStore((state) => state.setAllAbilityScores);

  // initialize a valid standard array on mount if current state is invalid
  useEffect(() => {
    const currentValues = Object.values(scores).sort((a, b) => b - a);
    const isValidArray = currentValues.every(
      (val, idx) => val === STANDARD_ARRAY[idx],
    );

    if (!isValidArray) {
      setAllScores({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
    }
  }, [scores, setAllScores]);

  const handleAssignment = (targetStat: Attributes, newValue: number) => {
    // identify which stat currently holds the number the user just selected
    const statToSwap = STATS.find((s) => scores[s] === newValue);

    // perform bidirectional swap to maintain strict array integrity
    if (statToSwap && statToSwap !== targetStat) {
      const oldValue = scores[targetStat];
      setScore(statToSwap, oldValue);
      setScore(targetStat, newValue);
    }
  };

  return (
    <div style={{ maxWidth: "400px" }}>
      <div
        style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "#eef4fa",
          border: "1px solid #cce0f5",
        }}
      >
        <p style={{ margin: 0, fontSize: "0.9rem", color: "#335b88" }}>
          Assign the standard values <strong>(15, 14, 13, 12, 10, 8)</strong>.
          Selecting a value will automatically swap it with its previous
          location to prevent duplicates.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {STATS.map((stat) => (
          <div
            key={stat}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid #eee",
              padding: "0.5rem",
            }}
          >
            <span
              style={{
                fontWeight: "bold",
                textTransform: "uppercase",
                width: "50px",
              }}
            >
              {stat}
            </span>

            <select
              value={scores[stat]}
              onChange={(e) => handleAssignment(stat, parseInt(e.target.value))}
              style={{
                padding: "0.5rem",
                width: "100px",
                fontFamily: "monospace",
                fontSize: "1.1rem",
                cursor: "pointer",
              }}
            >
              {STANDARD_ARRAY.map((val) => (
                <option key={val} value={val}>
                  {val}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
