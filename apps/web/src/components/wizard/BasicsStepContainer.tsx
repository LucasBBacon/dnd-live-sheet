import { useWizardStore } from "../../store/wizardStore";

export const BasicsStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const canProceed = useWizardStore((state) => state.canProceed);

  const characterName = useWizardStore((state) => state.characterName);
  const setCharacterName = useWizardStore((state) => state.setName);

  // visibility guard
  if (currentStep !== 1) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "80hv",
        fontFamily: "monospace",
        padding: "1rem",
      }}
    >
      <h2>Initial Designation</h2>

      <p style={{ color: "#555", marginBottom: "2rem" }}>
        Establish the primary identifier for this entity before proceeding to
        lineage and class matrices.
      </p>

      <div
        style={{
          flexGrow: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "500px",
            background: "#fafafa",
            padding: "2rem",
            border: "1px solid #ddd",
          }}
        >
          <label
            htmlFor="character-name-input"
            style={{
              display: "block",
              fontWeight: "bold",
              fontSize: "1.1rem",
              marginBottom: "0.5rem",
              textTransform: "uppercase",
            }}
          >
            Character Name
          </label>

          <input
            id="character-name-input"
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="e.g., Kaelen of the Ashen Waste"
            autoFocus
            autoComplete="off"
            style={{
              width: "100%",
              padding: "1rem",
              fontSize: "1.2rem",
              fontFamily: "monospace",
              border: "2px solid #333",
              boxSizing: "border-box",
            }}
          />

          {characterName.trim().length === 0 && (
            <span
              style={{
                display: "block",
                color: "#c62828",
                marginTop: "0.5rem",
                fontSize: "0.85rem",
              }}
            >
              * A valid designation is required to initialize the payload.
            </span>
          )}
        </div>
      </div>

      {/* NAVIGATION BOUNDARIES */}
      <div
        style={{
          borderTop: "1px solid #333",
          paddingTop: "1rem",
          display: "flex",
          gap: "1rem",
        }}
      >
        {/* EMPTY DIV TO PUSH THE NEXT BUTTON TO THE RIGHT */}
        <div style={{ flexGrow: 1 }} />

        <button
          disabled={!canProceed()}
          onClick={() => setStep(2)}
          style={{
            padding: "0.75rem 3rem",
            cursor: canProceed() ? "pointer" : "not-allowed",
            background: canProceed() ? "#ccffcc" : "#ffcccc",
            border: "none",
            fontWeight: "bold",
            fontSize: "1.1rem",
          }}
        >
          {canProceed() ? "Proceed to Lineage ►" : "Awaiting Input..."}
        </button>
      </div>
    </div>
  );
};
