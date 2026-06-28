/* eslint-disable @typescript-eslint/no-explicit-any */
import { useWizardStore } from "../../../store/wizardStore";
import { CustomBackgroundBuilder } from "./CustomBackgroundBuilder";

export const BackgroundDetailView = ({
  backgrounds,
}: {
  backgrounds: any[];
}) => {
  const bgType = useWizardStore((state) => state.backgroundType);
  const bgId = useWizardStore((state) => state.backgroundId);
  const personality = useWizardStore((state) => state.personality);
  const updatePersonality = useWizardStore((state) => state.updatePersonality);
  const setAlignment = useWizardStore((state) => state.setAlignment);
  const alignment = useWizardStore((state) => state.alignment);

  const activeBg = backgrounds.find((b) => b.id === bgId);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 300px",
        gap: "2rem",
        height: "100%",
      }}
    >
      {/* Primary Input Area */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          paddingRight: "1rem",
          borderRight: "1px dashed #333",
        }}
      >
        <section>
          <h3>Alignment</h3>
          <input
            type="text"
            placeholder="e.g., Chaotic Good"
            value={alignment}
            onChange={(e) => setAlignment(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
            }}
          />
        </section>

        {bgType === "CUSTOM" ? (
          <CustomBackgroundBuilder /> // A form hooked to updateCustomBackground
        ) : (
          <section>
            <h3>{activeBg?.name || "Select a Preset Background"}</h3>
            <p style={{ fontSize: "0.9rem", color: "#555" }}>
              {activeBg?.lore.shortDescription}
            </p>
            {activeBg && (
              <div
                style={{
                  background: "#f5f5f5",
                  padding: "1rem",
                  border: "1px solid #ddd",
                  marginTop: "1rem",
                }}
              >
                <strong>Feature: {activeBg.featureName}</strong>
                <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  {activeBg.featureDescription}
                </p>
              </div>
            )}

            {!!activeBg && (
              <section
                style={{
                  marginTop: "1rem",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 0.75rem 0",
                    borderBottom: "1px solid #333",
                    paddingBottom: "0.25rem",
                  }}
                >
                  Granted Background Traits ({activeBg.traits?.length ?? 0})
                </h4>

                {!activeBg.traits || activeBg.traits.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.85rem",
                      color: "#888",
                      fontStyle: "italic",
                    }}
                  >
                    No trait payload found for this preset background.
                  </p>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {activeBg.traits.map((trait: any) => (
                      <div
                        key={trait.id}
                        style={{
                          border: "1px solid #ddd",
                          padding: "0.75rem",
                          backgroundColor: "#fff",
                          position: "relative",
                        }}
                      >
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
                          {trait.sourceOrigin || `Background: ${activeBg.name}`}
                        </span>

                        <div
                          style={{
                            fontWeight: "bold",
                            fontSize: "0.95rem",
                            marginBottom: "0.25rem",
                            paddingRight: "160px",
                          }}
                        >
                          {trait.name}
                        </div>

                        <div
                          style={{
                            fontSize: "0.85rem",
                            color: "#444",
                            lineHeight: "1.4",
                            paddingRight: "160px",
                          }}
                        >
                          {trait.lore?.shortDescription ||
                            "No summary provided for this trait."}
                        </div>

                        {Array.isArray(trait.effects) && trait.effects.length > 0 && (
                          <div
                            style={{
                              marginTop: "0.5rem",
                              display: "flex",
                              gap: "0.5rem",
                              flexWrap: "wrap",
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
                                Mod: {eff.type} {eff.target || eff.category || ""}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </section>
        )}

        {/* Free-Text Identity Forms */}
        <section>
          <h3>Identity & Personality</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            {(["traits", "ideals", "bonds", "flaws"] as const).map((field) => (
              <div key={field}>
                <label
                  style={{
                    display: "block",
                    textTransform: "capitalize",
                    fontWeight: "bold",
                    marginBottom: "0.25rem",
                  }}
                >
                  {field}
                </label>
                <textarea
                  rows={4}
                  value={personality[field]}
                  onChange={(e) => updatePersonality(field, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                  placeholder={`Write your ${field} here...`}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Manuscript-Style Marginalia: Inspiration Tables */}
      <div style={{ overflowY: "auto" }}>
        <h3 style={{ borderBottom: "1px solid #333", paddingBottom: "0.5rem" }}>
          Inspiration
        </h3>
        {!activeBg ? (
          <p
            style={{ fontSize: "0.85rem", color: "#888", fontStyle: "italic" }}
          >
            Select a preset background to view rollable inspiration tables.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.5rem",
              marginTop: "1rem",
            }}
          >
            <InspirationTable
              title="Personality Traits"
              items={activeBg.personalityTraits}
            />
            <InspirationTable title="Ideals" items={activeBg.ideals} />
            <InspirationTable title="Bonds" items={activeBg.bonds} />
            <InspirationTable title="Flaws" items={activeBg.flaws} />
          </div>
        )}
      </div>
    </div>
  );
};

// Pure component for rendering the side-tables
const InspirationTable = ({
  title,
  items,
}: {
  title: string;
  items: string[];
}) => (
  <div>
    <h4
      style={{
        margin: "0 0 0.5rem 0",
        fontSize: "0.9rem",
        backgroundColor: "#eee",
        padding: "0.2rem 0.5rem",
      }}
    >
      {title}
    </h4>
    <ul
      style={{
        margin: 0,
        paddingLeft: "1.5rem",
        fontSize: "0.8rem",
        color: "#444",
      }}
    >
      {items.map((item, idx) => (
        <li key={idx} style={{ marginBottom: "0.25rem" }}>
          <span style={{ fontWeight: "bold", marginRight: "0.5rem" }}>
            d{items.length}
          </span>
          {item}
        </li>
      ))}
    </ul>
  </div>
);
