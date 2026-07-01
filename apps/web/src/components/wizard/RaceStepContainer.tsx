import { useQuery } from "@tanstack/react-query";
import { useWizardStore } from "../../store/wizardStore";
import { apiClient } from "../../api/client";
import { RaceSelectorGrid } from "./RaceSelectorGrid";
import { RaceDetailView } from "./RaceDetailView";

export const RaceStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const canProceedToClassMatrix = useWizardStore((state) => state.canProceed());
  const isActiveStep = currentStep === 2;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["reference", "races"],
    queryFn: () => apiClient("/reference/races"),
    staleTime: 1000 * 60 * 30, // reference data changes rarely
    enabled: isActiveStep,
  });

  // guard clause so react does not evaluate hidden steps
  if (!isActiveStep) return null;

  if (isLoading)
    return (
      <div style={{ fontFamily: "monospace" }}>
        Hydrating race matrix schemas...
      </div>
    );
  if (isError || !data)
    return (
      <div style={{ fontFamily: "monospace" }}>
        Fatal: Failed to sync reference schemas.
      </div>
    );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "350px 1fr",
        gap: "2rem",
        height: "80vh",
        fontFamily: "monospace",
      }}
    >
      {/* Tier 2 left col - high performance list grid */}
      <div
        style={{
          overflowY: "auto",
          borderRight: "1px solid #333",
          paddingRight: "1rem",
        }}
      >
        <RaceSelectorGrid races={data.races} />
      </div>
      {/* Tier 3: right col - heavy text context engine */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
        }}
      >
        <div style={{ overflowY: "auto", flexGrow: 1, paddingBottom: "1rem" }}>
          <RaceDetailView races={data.races} />
        </div>

        {/* Wizard navigation footer */}
        <div
          style={{
            borderTop: "1px solid #333",
            paddingTop: "1rem",
            display: "flex",
            gap: "1rem",
          }}
        >
          <button
            onClick={() => setStep(1)}
            style={{
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              background: "#e0e0e0",
              border: "none",
            }}
          >
            ◄ Return to Basics
          </button>
          <button
            disabled={!canProceedToClassMatrix}
            onClick={() => setStep(3)}
            style={{
              padding: "0.75rem 1.5rem",
              cursor: canProceedToClassMatrix ? "pointer" : "not-allowed",
              background: canProceedToClassMatrix ? "#ccffcc" : "#ffcccc",
              border: "none",
              flexGrow: 1,
              fontWeight: "bold",
            }}
          >
            {canProceedToClassMatrix
              ? "Proceed to Class Matrix ►"
              : "Awaiting Required Selections..."}
          </button>
        </div>
      </div>
    </div>
  );
};
