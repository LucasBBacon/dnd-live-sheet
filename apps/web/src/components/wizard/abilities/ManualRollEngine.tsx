import { useWizardStore, type Attributes } from "../../../store/wizardStore";

const STATS: Attributes[] = ["str", "dex", "con", "int", "wis", "cha"];

export const ManualRollEngine = () => {
  const scores = useWizardStore((state) => state.baseAbilityScores);
  const setScore = useWizardStore((state) => state.setBaseAbilityScore);
  const setAllScores = useWizardStore((state) => state.setAllAbilityScores);

  // helper for 4d6 drop lowest
  const rollStat = () => {
    const rolls = Array.from(
      { length: 4 },
      () => Math.floor(Math.random() * 6) + 1,
    );
    rolls.sort((a, b) => b - a); // descending order
    return rolls[0] + rolls[1] + rolls[2];
  };

  const handleSimulateRolls = () => {
    setAllScores({
      str: rollStat(),
      dex: rollStat(),
      con: rollStat(),
      int: rollStat(),
      wis: rollStat(),
      cha: rollStat(),
    });
  };

  return (
    <div style={{ maxWidth: "400px" }}>
      <div
        style={{
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "#eef9ee",
          border: "1px solid #cceecc",
        }}
      >
        <p style={{ margin: "0 0 1rem 0", fontSize: "0.9rem" }}>
          Input your physical dice roll, or simulate a 4d6 (drop lowest) array
          instantly.
        </p>
        <button
          onClick={handleSimulateRolls}
          style={{
            width: "100%",
            padding: "0.75rem",
            background: "#28a745",
            color: "#fff",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Auto-Roll Array
        </button>
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
            <input
              type="number"
              min="3"
              max="18"
              value={scores[stat] || ""}
              onChange={(e) => setScore(stat, parseInt(e.target.value) || 3)}
              style={{
                padding: "0.5rem",
                width: "80px",
                textAlign: "center",
                fontFamily: "monospace",
                fontSize: "1.2rem",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
