import { useWizardStore, type GenerationMethod } from "../../store/wizardStore";
import { ManualRollEngine } from "./abilities/ManualRollEngine";
import { PointBuyCalculator } from "./abilities/PointBuyCalculator";
import { StandardArrayAssigner } from "./abilities/StandardArrayAssigner";

export const AbilityStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const canProceed = useWizardStore((state) => state.canProceed);

  const method = useWizardStore((state) => state.generationMethod);
  const setMethod = useWizardStore((state) => state.setGenerationMethod);

  const isActiveStep = currentStep === 4;
  if (!isActiveStep) return null;

  const tabs: { value: GenerationMethod; label: string }[] = [
    { value: "STANDARD_ARRAY", label: "Standard Array" },
    { value: "POINT_BUY", label: "Point Buy" },
    { value: "MANUAL", label: "Manual / Rolled" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "80vh",
        fontFamily: "monospace",
      }}
    >
      <h2>Generate Ability Scores</h2>

      {/* METHOD SELECTION TABS */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          borderBottom: "2px solid #333",
          marginBottom: "2rem",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setMethod(tab.value)}
            style={{
              padding: "0.75rem 1.5rem",
              background: method === tab.value ? "#333" : "transparent",
              color: method === tab.value ? "#fff" : "#333",
              border: "none",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* RENDERING ENGINE */}
      <div style={{ flexGrow: 1, overflowY: "auto" }}>
        {method === "STANDARD_ARRAY" && (
          <div>
            <StandardArrayAssigner />
          </div>
        )}
        {method === "POINT_BUY" && (
          <div>
            <PointBuyCalculator />
          </div>
        )}
        {method === "MANUAL" && (
          <div>
            <ManualRollEngine />
          </div>
        )}
      </div>

      {/* Navigation Boundaries */}
      <div
        style={{
          borderTop: "1px solid #333",
          paddingTop: "1rem",
          display: "flex",
          gap: "1rem",
        }}
      >
        <button
          onClick={() => setStep(3)}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: "pointer",
            background: "#e0e0e0",
            border: "none",
          }}
        >
          ◄ Return to Class
        </button>
        <button
          disabled={!canProceed()}
          onClick={() => setStep(5)}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: canProceed() ? "pointer" : "not-allowed",
            background: canProceed() ? "#ccffcc" : "#ffcccc",
            border: "none",
            flexGrow: 1,
            fontWeight: "bold",
          }}
        >
          {canProceed() ? "Proceed to Details ►" : "Awaiting Valid Scores..."}
        </button>
      </div>
    </div>
  );
};
