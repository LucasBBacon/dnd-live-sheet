import React, { useMemo, useState } from "react";
import { useWizardStore } from "../../store/wizardStore";

interface RaceSelectorGridProps {
  races: Array<{
    id: string;
    name: string;
    lore: { shortDescription: string };
    requiresSubrace: boolean;
  }>;
}

export const RaceSelectorGrid = ({ races }: RaceSelectorGridProps) => {
  const [search, setSearch] = useState("");
  const selectedRaceId = useWizardStore((state) => state.raceId);
  const setRace = useWizardStore((state) => state.setRace);

  const filteredRaces = useMemo(() => {
    return races.filter((r) =>
      r.name.toLowerCase().includes(search.toLocaleLowerCase()),
    );
  }, [races, search]);

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter lineage matrix..."
        style={{
          width: "100%",
          padding: "0.5rem",
          marginBottom: "1rem",
          boxSizing: "border-box",
          fontFamily: "monospace",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {filteredRaces.map((race) => (
          <RaceCard
            key={race.id}
            name={race.name}
            shortDesc={race.lore.shortDescription}
            isSelected={race.id === selectedRaceId}
            onSelect={() => setRace(race.id, race.requiresSubrace)}
          />
        ))}
      </div>
    </div>
  );
};

// Isolated & Memoized leaf component (maximizes virtualization frame budget)
const RaceCard = React.memo(
  ({
    name,
    shortDesc,
    isSelected,
    onSelect,
  }: {
    name: string;
    shortDesc: string;
    isSelected: boolean;
    onSelect: () => void;
  }) => {
    return (
      <div
        onClick={onSelect}
        style={{
          padding: "1rem",
          border: `1px solid ${isSelected ? "#000" : "#ccc"}`,
          backgroundColor: isSelected ? "#f5f5f5" : "#fff",
          cursor: "pointer",
          transition: "background-color 0.1s ease",
        }}
      >
        <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{name}</div>
        <div
          style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.25rem" }}
        >
          {shortDesc}
        </div>
      </div>
    );
  },
);

RaceCard.displayName = "RaceCard";
