import { useQuery } from "@tanstack/react-query";
import { useWizardStore } from "../../store/wizardStore";
import { apiClient } from "../../api/client";
import { BackgroundSelectorGrid } from "./backgrounds/BackgroundSelectorGrid";
import { BackgroundDetailView } from "./backgrounds/BackgroundDetailView";

export const BackgroundStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const canProceedToReview = useWizardStore((state) => state.canProceed());
  const isActiveStep = currentStep === 5;

  const bgType = useWizardStore((state) => state.backgroundType);
  const setBgType = useWizardStore((state) => state.setBackgroundMode);

  // We only fetch preset backgrounds. Custom backgrounds are strictly local state.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reference", "backgrounds"],
    queryFn: () => apiClient("/reference/backgrounds"),
    staleTime: 1000 * 60 * 30,
    enabled: isActiveStep,
  });

  // guard clause so react does not evaluate hidden steps
  if (!isActiveStep) return null;

  if (isLoading)
    return (
      <div style={{ fontFamily: "monospace" }}>
        Compiling background records...
      </div>
    );
  if (isError || !data)
    return (
      <div style={{ fontFamily: "monospace" }}>
        Fatal: Failed to load background presets.
      </div>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "80vh",
        fontFamily: "monospace",
      }}
    >
      <h2>Identity & Background</h2>

      {/* Mode Selection Tabs */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          borderBottom: "2px solid #333",
          marginBottom: "1.5rem",
        }}
      >
        <button
          onClick={() => setBgType("PRESET")}
          style={{
            padding: "0.75rem 1.5rem",
            background: bgType === "PRESET" ? "#333" : "transparent",
            color: bgType === "PRESET" ? "#fff" : "#333",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Preset Backgrounds
        </button>
        <button
          onClick={() => setBgType("CUSTOM")}
          style={{
            padding: "0.75rem 1.5rem",
            background: bgType === "CUSTOM" ? "#333" : "transparent",
            color: bgType === "CUSTOM" ? "#fff" : "#333",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Custom Background Builder
        </button>
      </div>

      {/* Dynamic 2-Column Layout */}
      <div
        style={{
          flexGrow: 1,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: bgType === "PRESET" ? "300px 1fr" : "1fr",
          gap: "2rem",
        }}
      >
        {/* Only show the selection grid if we are in PRESET mode */}
        {bgType === "PRESET" && (
          <div
            style={{
              overflowY: "auto",
              borderRight: "1px solid #333",
              paddingRight: "1rem",
            }}
          >
            <BackgroundSelectorGrid backgrounds={data.backgrounds} />
          </div>
        )}

        {/* The detail view handles both custom forms and preset descriptions */}
        <div style={{ overflowY: "auto", paddingBottom: "1rem" }}>
          <BackgroundDetailView backgrounds={data.backgrounds} />
        </div>
      </div>

      {/* Navigation Boundaries */}
      <div
        style={{
          borderTop: "1px solid #333",
          paddingTop: "1rem",
          display: "flex",
          gap: "1rem",
          marginTop: "auto",
        }}
      >
        <button
          onClick={() => setStep(4)}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: "pointer",
            background: "#e0e0e0",
            border: "none",
          }}
        >
          ◄ Return to Ability Scores
        </button>
        <button
          disabled={!canProceedToReview}
          onClick={() => setStep(6)} // Step 6: Review & Finalize
          style={{
            padding: "0.75rem 1.5rem",
            cursor: canProceedToReview ? "pointer" : "not-allowed",
            background: canProceedToReview ? "#ccffcc" : "#ffcccc",
            border: "none",
            flexGrow: 1,
            fontWeight: "bold",
          }}
        >
          {canProceedToReview
            ? "Review & Finalize Character ►"
            : "Awaiting Required Fields..."}
        </button>
      </div>
    </div>
  );
};
