import { useQuery } from "@tanstack/react-query";
import { useWizardStore } from "../../store/wizardStore";
import { apiClient } from "../../api/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ClassDetailView = ({ classes }: { classes: any[] }) => {
  const selectedClassId = useWizardStore((state) => state.classId);
  const selectedSubclassId = useWizardStore((state) => state.subclassId);
  const setSubclass = useWizardStore((state) => state.setSubclass);
  const targetLevel = useWizardStore((state) => state.targetLevel);

  const activeClass = classes.find((c) => c.id === selectedClassId);

  // on demand data fetching
  const { data: subclassesData } = useQuery({
    queryKey: ["reference", "subclasses", selectedClassId],
    queryFn: () =>
      apiClient(`/reference/classes/${selectedClassId}/subclasses`),
    enabled: !!selectedClassId,
  });

  const { data: timelineData, isLoading: timelineLoading } = useQuery({
    queryKey: ["reference", "timeline", selectedClassId],
    queryFn: () => apiClient(`/reference/classes/${selectedClassId}/timeline`),
    enabled: !!selectedClassId,
  });

  if (!activeClass) {
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
        Select a class from the left terminal grid to review the progression
        timeline.
      </div>
    );
  }

  const requiresSubclassNow =
    targetLevel >= activeClass.subclassRequirementLevel;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <section>
        <h2 style={{ margin: "0 0 0.5rem 0", textTransform: "uppercase" }}>
          {activeClass.name}
        </h2>
        <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem" }}>
          <span style={{ background: "#eee", padding: "0.2rem 0.5rem" }}>
            <strong>HIT DIE:</strong> d{activeClass.hitDie}
          </span>
          <span style={{ background: "#eee", padding: "0.2rem 0.5rem" }}>
            <strong>SUBCLASS AT LEVEL:</strong>{" "}
            {activeClass.subclassRequirementLevel}
          </span>
        </div>
        <p style={{ lineHeight: "1.4", marginTop: "0.75rem" }}>
          {activeClass.lore.fullText || activeClass.lore.shortDescription}
        </p>
      </section>

      {/* TODO: EQUIPMENT PARSER */}
      <section
        style={{
          border: "1px dashed #333",
          padding: "1rem",
          backgroundColor: "#fafafa",
        }}
      >
        <strong>STARTING EQUIPMENT:</strong> Allocation parser pending
        deployment...
      </section>

      {/* SUBCLASS GATEKEEPER UI */}
      {requiresSubclassNow && subclassesData?.subclasses && (
        <section
          style={{
            border: "1px dashed #333",
            padding: "1rem",
            backgroundColor: "#fafafa",
          }}
        >
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>
            Required Selection: Archetype
          </h3>
          <select
            value={selectedSubclassId || ""}
            onChange={(e) => setSubclass(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
            }}
          >
            <option value="" disabled>
              Select a class archetype...
            </option>
            {subclassesData.subclasses.map((sc: any) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* 1-20 TIMELINE */}
      <section>
        <h3
          style={{ borderBottom: "1px solid #333", paddingBottom: "0.25rem" }}
        >
          Progression Timeline
        </h3>
        {timelineLoading ? (
          <div>Analyzing level milestones...</div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            {timelineData?.timeline.map((tier: any) => (
              <div
                key={tier.level}
                style={{
                  borderLeft: "3px solid #333",
                  paddingLeft: "1rem",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: "1.1rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  Level {tier.level}
                </div>

                {tier.features.length === 0 && (
                  <span style={{ color: "#888", fontSize: "0.85rem" }}>
                    No features granted.
                  </span>
                )}

                {tier.features.map((feat: any) => (
                  <div
                    key={feat.id}
                    style={{
                      marginBottom: "0.75rem",
                      backgroundColor: "#fff",
                      border: "1px solid #ddd",
                      padding: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ fontSize: "0.95rem" }}>
                        {feat.name}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.7rem",
                          background: "#e0f0ff",
                          padding: "0.1rem 0.4rem",
                          border: "1px solid #b3d7ff",
                          color: "#004085",
                        }}
                      >
                        {feat.sourceOrigin || `Class: ${activeClass.name}`}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "#444",
                        marginTop: "0.25rem",
                      }}
                    >
                      {feat.lore.shortDescription}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
