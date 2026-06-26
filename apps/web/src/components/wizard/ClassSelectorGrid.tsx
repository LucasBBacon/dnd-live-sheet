/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo } from "react";
import { useWizardStore } from "../../store/wizardStore";

interface ClassSelectorGridProps {
  classes: Array<{
    id: string;
    name: string;
    hitDie: number;
    subclassRequirementLevel: number;
    lore: { shortDescription: string };
  }>;
}

export const ClassSelectorGrid = ({ classes }: ClassSelectorGridProps) => {
  const [search, setSearch] = useState("");
  const selectedClassId = useWizardStore((state) => state.classId);
  const setClass = useWizardStore((state) => state.setClass);

  const filteredClasses = useMemo(() => {
    return classes.filter((c) =>
      c.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [classes, search]);

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter class matrix..."
        style={{
          width: "100%",
          padding: "0.5rem",
          marginBottom: "1rem",
          boxSizing: "border-box",
          fontFamily: "monospace",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {filteredClasses.map((cls) => (
          <ClassCard
            key={cls.id}
            id={cls.id}
            name={cls.name}
            hitDie={cls.hitDie}
            shortDesc={cls.lore.shortDescription}
            isSelected={cls.id === selectedClassId}
            onSelect={() => setClass(cls.id, cls.subclassRequirementLevel)}
          />
        ))}
      </div>
    </div>
  );
};

const ClassCard = React.memo(
  ({ name, hitDie, shortDesc, isSelected, onSelect }: any) => (
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
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontWeight: "bold",
          fontSize: "1.1rem",
        }}
      >
        <span>{name}</span>
        <span style={{ fontSize: "0.85rem", color: "#555" }}>d{hitDie}</span>
      </div>
      <div style={{ fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" }}>
        {shortDesc}
      </div>
    </div>
  ),
);

ClassCard.displayName = "ClassCard";
