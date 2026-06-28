import { useState, useMemo } from "react";
import { useWizardStore } from "../../../store/wizardStore";

interface BackgroundSelectorGridProps {
  backgrounds: Array<{
    id: string;
    name: string;
    lore: { shortDescription: string };
  }>;
}

export const BackgroundSelectorGrid = ({
  backgrounds,
}: BackgroundSelectorGridProps) => {
  const [search, setSearch] = useState("");
  const selectedBgId = useWizardStore((state) => state.backgroundId);
  const setPresetBackground = useWizardStore(
    (state) => state.setPresetBackground,
  );

  const filteredBackgrounds = useMemo(() => {
    return backgrounds.filter((bg) =>
      bg.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [backgrounds, search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter presets..."
        style={{
          width: "100%",
          padding: "0.5rem",
          marginBottom: "1rem",
          boxSizing: "border-box",
          fontFamily: "monospace",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          flexGrow: 1,
          overflowY: "auto",
        }}
      >
        {filteredBackgrounds.map((bg) => (
          <div
            key={bg.id}
            onClick={() => setPresetBackground(bg.id)}
            style={{
              padding: "0.75rem",
              border: `1px solid ${bg.id === selectedBgId ? "#000" : "#ccc"}`,
              backgroundColor: bg.id === selectedBgId ? "#f5f5f5" : "#fff",
              cursor: "pointer",
              transition: "background-color 0.1s ease",
            }}
          >
            <div style={{ fontWeight: "bold", fontSize: "1rem" }}>
              {bg.name}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "#666",
                marginTop: "0.25rem",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {bg.lore.shortDescription}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
