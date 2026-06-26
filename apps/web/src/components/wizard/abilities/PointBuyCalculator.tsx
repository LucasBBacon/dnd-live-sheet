import { useWizardStore, type Attributes } from "../../../store/wizardStore";

const POINT_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
const STATS: Attributes[] = ["str", "dex", "con", "int", "wis", "cha"];

export const PointBuyCalculator = () => {
  const scores = useWizardStore((state) => state.baseAbilityScores);
  const setScore = useWizardStore((state) => state.setBaseAbilityScore);

  // derive points dynamically, intermediate states are skipped over
  const pointsSpent = Object.values(scores).reduce(
    (total, val) => total + (POINT_COSTS[val] || 0),
    0,
  );
  const pointsRemaining = 27 - pointsSpent;

  const handleAdjust = (stat: Attributes, delta: number) => {
    const current = scores[stat];
    const next = current + delta;

    if (next < 8 || next > 15) return; // out of bounds

    const costDiff = POINT_COSTS[next] - POINT_COSTS[current];
    if (pointsRemaining - costDiff < 0) return; // insufficient funds

    setScore(stat, next);
  };

  return (
    <div style={{ maxWidth: "400px" }}>
      <div
        style={{
          marginBottom: "1.5rem",
          fontSize: "1.2rem",
          padding: "1rem",
          background: "#f5f5f5",
          border: "1px solid #ccc",
        }}
      >
        <strong>Points Remaining: </strong>
        <span style={{ color: pointsRemaining === 0 ? "green" : "black" }}>
          {pointsRemaining} / 27
        </span>
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

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <button
                disabled={scores[stat] <= 8}
                onClick={() => handleAdjust(stat, -1)}
              >
                -
              </button>
              <span
                style={{
                  width: "30px",
                  textAlign: "center",
                  fontSize: "1.2rem",
                }}
              >
                {scores[stat]}
              </span>
              <button
                disabled={scores[stat] >= 15}
                onClick={() => handleAdjust(stat, 1)}
              >
                +
              </button>
            </div>

            <span
              style={{
                fontSize: "0.8rem",
                color: "#888",
                width: "60px",
                textAlign: "right",
              }}
            >
              Cost: {POINT_COSTS[scores[stat]]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
