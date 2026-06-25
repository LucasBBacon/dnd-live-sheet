/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from "react";
import { useWizardStore } from "../../store/wizardStore";

interface TraitPayload {
  id: string;
  name: string;
  sourceOrigin: string;
  lore: { shortDescription: string; fullText?: string };
  effects: any[];
}

interface RaceDetailViewProps {
  races: Array<{
    id: string;
    name: string;
    speed: number;
    requiresSubrace: boolean;
    displayLabel: string;
    lore: { shortDescription: string; fullText?: string };
    traits: TraitPayload[];
    subraces: Array<{
      id: string;
      name: string;
      lore: { shortDescription: string };
      traits: TraitPayload[];
    }>;
  }>;
}

export const RaceDetailView = ({ races }: RaceDetailViewProps) => {
  // pull atomic selectors to avoid broad store evaluation sweeps
  const selectedRaceId = useWizardStore((state) => state.raceId);
  const selectedSubraceId = useWizardStore((state) => state.subraceId);
  const setSubrace = useWizardStore((state) => state.setSubrace);

  const activeRace = races.find((r) => r.id === selectedRaceId);

  // high performance composition of the active traits block
  const consolidatedTraits = useMemo(() => {
    if (!activeRace) return [];

    // base lineage traits
    const traitList = [...activeRace.traits];

    // if a subrace is selected, append custom traits seamlessly
    const activeSubrace = activeRace.subraces.find(
      (sr) => sr.id === selectedSubraceId,
    );
    if (activeSubrace) {
      traitList.push(...activeSubrace.traits);
    }

    return traitList;
  }, [activeRace, selectedSubraceId]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Block */}
      <section>
        <h2 style={{ margin: "0 0 0.5rem 0", textTransform: "uppercase" }}>
          {activeRace.name}
        </h2>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <span style={{ background: "#eee", padding: "0.2rem 0.5rem" }}>
            <strong>BASE SPEED:</strong> {activeRace.speed} ft.
          </span>
        </div>
        <p style={{ lineHeight: "1.4", marginTop: "0.75rem" }}>
          {activeRace.lore.fullText || activeRace.lore.shortDescription}
        </p>
      </section>

      {/* Explicit enforcement interface element */}
      {activeRace.requiresSubrace && (
        <section
          style={{
            border: "1px dashed #333",
            padding: "1rem",
            backgroundColor: "#fafafa",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>
            Required Selection: {activeRace.displayLabel}
          </h3>

          <select
            value={selectedSubraceId || ""}
            onChange={(e) => setSubrace(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
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
        </section>
      )}

      {/* Sourced trait manifest */}
      <section>
        <h3
          style={{
            margin: "0 0 1rem 0",
            borderBottom: "1px solid #333",
            paddingBottom: "0.25rem",
          }}
        >
          Granted Racial Matrix Traits ({consolidatedTraits.length})
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {consolidatedTraits.map((trait) => (
            <div
              key={trait.id}
              style={{
                border: "1px solid #ddd",
                padding: "0.75rem",
                backgroundColor: "#fff",
                position: "relative",
              }}
            >
              {/* Provenance badge */}
              <span
                style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "0.5rem",
                  fontSize: "0.75rem",
                  background: "#e0f0ff",
                  padding: "0.1rem 0.4rem",
                  border: "1px solid #b3d7ff",
                  fontWeight: "bold",
                  color: "#004085",
                }}
              >
                {trait.sourceOrigin}
              </span>

              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "1rem",
                  marginBottom: "0.25rem",
                }}
              >
                {trait.name}
              </div>

              <div
                style={{
                  fontSize: "0.85rem",
                  color: "#444",
                  lineHeight: "1.4",
                  paddingRight: "120px",
                }}
              >
                {trait.lore.shortDescription}
              </div>

              {/* technical mechanics badge bar */}
              {trait.effects.length > 0 && (
                <div
                  style={{
                    marginTop: "0.5rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  {trait.effects.map((eff: any, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: "0.7rem",
                        background: "#eef9ee",
                        border: "1px solid #cceecc",
                        padding: "0.1rem 0.3rem",
                        color: "#155724",
                      }}
                    >
                      Mod: {eff.type} {eff.target || ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
