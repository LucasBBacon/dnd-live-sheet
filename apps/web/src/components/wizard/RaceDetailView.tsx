import { useWizardStore } from "../../store/wizardStore";

interface RaceDetailViewProps {
  races: Array<{
    id: string;
    name: string;
    speed: number;
    requiresSubrace: boolean;
    lore: { shortDescription: string; fullText?: string };
    subraces: Array<{
      id: string;
      name: string;
      lore: { shortDescription: string };
    }>;
  }>;
}

export const RaceDetailView = ({ races }: RaceDetailViewProps) => {
  // pull atomic selectors to avoid broad store evaluation sweeps
  const selectedRaceId = useWizardStore((state) => state.raceId);
  const selectedSubraceId = useWizardStore((state) => state.subraceId);
  const setSubrace = useWizardStore((state) => state.setSubrace);

  const activeRace = races.find((r) => r.id === selectedRaceId);

  if (!activeRace) {
    return (
      <div
        style={{
          color: "#888",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        Select a biological lineage from the left terminal grid to review
        mechanical payloads.
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ margin: "0 0 0.5rem 0", textTransform: "uppercase" }}>
        {activeRace.name}
      </h2>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}
      >
        <span style={{ background: "#eee", padding: "0.2rem 0.5rem" }}>
          <strong>BASE SPEED:</strong> {activeRace.speed} ft.
        </span>
        <span style={{ background: "#eee", padding: "0.2rem 0.5rem" }}>
          <strong>SUBRACE REQ:</strong>{" "}
          {activeRace.requiresSubrace ? "TRUE" : "FALSE"}
        </span>
      </div>
      <p style={{ lineHeight: "1.4", fontSize: "1rem" }}>
        {activeRace.lore.fullText || activeRace.lore.shortDescription}
      </p>
      {/* Explicit enforcement interface element */}
      {activeRace.requiresSubrace && (
        <div
          style={{
            marginTop: "2rem",
            border: "1px dashed #333",
            padding: "1rem",
            backgroundColor: "#fafafa",
          }}
        >
          <h3 style={{ margin: "0 0 0.75rem 0" }}>
            Required Selection: Ancestral Sub-lineage
          </h3>

          <select
            value={selectedSubraceId || ""}
            onChange={(e) => setSubrace(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
              marginBottom: "1rem",
            }}
          >
            <option value="" disabled>
              Select an implementation variant...
            </option>
            {activeRace.subraces.map((sr) => (
              <option key={sr.id} value={sr.id}>
                {sr.name}
              </option>
            ))}
          </select>

          {/* Inline short text description of selected subrace */}
          {selectedSubraceId && (
            <div
              style={{
                fontSize: "0.9rem",
                color: "#444",
                borderTop: "1px solid #ddd",
                paddingTop: "0.5rem",
              }}
            >
              <strong>Variant Blueprint:</strong>{" "}
              {
                activeRace.subraces.find((sr) => sr.id === selectedSubraceId)
                  ?.lore.shortDescription
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
};
