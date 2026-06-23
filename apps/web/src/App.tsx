import { useState } from "react";
import { useCharacterSheet, useUpdateFlavor } from "./api/queries";
import { useCharacterSocket } from "./hooks/useCharacterSocket";

const App = () => {
  const { data: character, isLoading, isError, error } = useCharacterSheet();
  const { mutate: updateFlavor, isPending } = useUpdateFlavor();

  // local state strictly for unsubmitted input field
  const [newEyeColor, setNewEyeColor] = useState("");
  // local state for manual damage/healing number input
  const [hpChangeAmount, setHpChangeAmount] = useState<number>(0);

  // init real-time WebSocket connection using fetched character id
  const { dispatch } = useCharacterSocket(character?.id);

  if (isLoading) return <div>Loading character data...</div>;
  if (isError)
    return <div>Error fetching sheet: {(error as Error).message}</div>;
  if (!character) return <div>No active character found.</div>;

  const handleUpdateFlavor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEyeColor.trim()) return;

    updateFlavor({ eyeColor: newEyeColor });
    setNewEyeColor(""); // clear local state after submission
  };

  // dispatch a lightweight action over WebSockets to calculate mechanics safely on server
  const handleModifyHp = (type: "DAMAGE" | "HEAL") => {
    if (hpChangeAmount <= 0) return;

    // damage is sent as a neg integer - healing pos
    const finalAmount = type === "DAMAGE" ? -hpChangeAmount : hpChangeAmount;

    dispatch({
      type: "MODIFY_HP",
      characterId: character.id,
      timestamp: Date.now(),
      payload: {
        amount: finalAmount,
        isTemporary: false,
      },
    });

    setHpChangeAmount(0); // reset input field
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>D&D 5e Live Sheet</h1>
      <hr />

      {/* Real-time Combat Panel */}
      <section
        style={{
          marginBottom: "2rem",
          border: "1px solid #ccc",
          padding: "1rem",
        }}
      >
        <h2>Combat Console (Real-time WebSockets)</h2>
        <div style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
          <strong>Hit Points:</strong> {character.currentHp} /{" "}
          {character.engineData.hp.max}
          {character.engineData.hp.temporary > 0 && (
            <span style={{ color: "blue" }}>
              {" "}
              (+{character.engineData.hp.temporary} Temp)
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="number"
            value={hpChangeAmount || ""}
            onChange={(e) => setHpChangeAmount(parseInt(e.target.value) || 0)}
            placeholder="Amount"
            style={{ width: "80px" }}
          />
          <button
            onClick={() => handleModifyHp("DAMAGE")}
            style={{ backgroundColor: "#ffcccc" }}
          >
            Apply Damage
          </button>
          <button
            onClick={() => handleModifyHp("HEAL")}
            style={{ backgroundColor: "#ccffcc" }}
          >
            Apply Healing
          </button>
        </div>
      </section>

      {/* Optimized Profile Update Section */}
      <section style={{ marginBottom: "2rem" }}>
        <h2>Flavor Profile (Optimized REST Bypass)</h2>
        <p>
          <strong>Name:</strong> {character.flavorData.name}
        </p>
        <p>
          <strong>Alignment:</strong> {character.flavorData.alignment || "None"}
        </p>
        <p>
          <strong>Eye Color:</strong>{" "}
          {character.flavorData.eyeColor || "Unknown"}
        </p>

        <form onSubmit={handleUpdateFlavor} style={{ marginTop: "1rem" }}>
          <input
            type="text"
            value={newEyeColor}
            onChange={(e) => setNewEyeColor(e.target.value)}
            placeholder="New Eye Color"
            disabled={isPending}
          />
          <button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Update Eye Color"}
          </button>
        </form>
      </section>

      {/* Underlying Immutable Ruleset Metrics */}
      <section>
        <h2>Engine Mechanics (Read-Only Matrix)</h2>
        <p>
          <strong>Total Level:</strong> {character.totalLevel}
        </p>

        <h3>Attributes</h3>
        <ul style={{ listStyleType: "none", padding: 0 }}>
          <li>STR: {character.engineData.attributes.str}</li>
          <li>DEX: {character.engineData.attributes.dex}</li>
          <li>CON: {character.engineData.attributes.con}</li>
          <li>INT: {character.engineData.attributes.int}</li>
          <li>WIS: {character.engineData.attributes.wis}</li>
          <li>CHA: {character.engineData.attributes.cha}</li>
        </ul>
      </section>
    </div>
  );
};

export default App;
