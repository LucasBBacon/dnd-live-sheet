import { useState } from "react";
import { useCharacterSheet, useUpdateFlavor } from "./api/queries";

const App = () => {
  const { data: character, isLoading, isError, error } = useCharacterSheet();
  const { mutate: updateFlavor, isPending } = useUpdateFlavor();

  // local state strictly for unsubmitted input field
  const [newEyeColor, setNewEyeColor] = useState("");

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

  return (
    <div style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>D&D Live Sheet</h1>
      <hr />

      <section style={{ marginBottom: "2rem" }}>
        <h2>Flavor Profile</h2>
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

      <section>
        <h2>Engine Mechanics (Read-Only)</h2>
        <p>
          <strong>Total Level:</strong> {character.totalLevel}
        </p>
        <p>
          <strong>Current HP:</strong> {character.currentHp} /{" "}
          {character.engineData.hp.max}
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
