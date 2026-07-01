import { useQuery } from "@tanstack/react-query";
import { useWizardStore } from "../../store/wizardStore";
import { apiClient } from "../../api/client";
import { ClassSelectorGrid } from "./ClassSelectorGrid";
import { ClassDetailView } from "./ClassDetailView";

export const ClassStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const canProceedToAbilityScores = useWizardStore((state) =>
    state.canProceed(),
  );
  const isActiveStep = currentStep === 3;

  // Fetch only the lightweight base class definitions
  const { data, isLoading, isError } = useQuery({
    queryKey: ["reference", "classes"],
    queryFn: () => apiClient("/reference/classes"),
    staleTime: 1000 * 60 * 30,
    enabled: isActiveStep,
  });

  // guard clause so react does not evaluate hidden steps
  if (!isActiveStep) return null;

  if (isLoading)
    return (
      <div style={{ fontFamily: "monospace" }}>Hydrating class matrix...</div>
    );
  if (isError || !data)
    return (
      <div style={{ fontFamily: "monospace" }}>
        Fatal: Failed to sync class schemas.
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
      <div
        style={{
          overflowY: "auto",
          borderRight: "1px solid #333",
          paddingRight: "1rem",
        }}
      >
        <ClassSelectorGrid classes={data.classes} />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
        }}
      >
        <div style={{ overflowY: "auto", flexGrow: 1, paddingBottom: "1rem" }}>
          <ClassDetailView classes={data.classes} />
        </div>

        <div
          style={{
            borderTop: "1px solid #333",
            paddingTop: "1rem",
            display: "flex",
            gap: "1rem",
          }}
        >
          <button
            onClick={() => setStep(2)}
            style={{
              padding: "0.75rem 1.5rem",
              cursor: "pointer",
              background: "#e0e0e0",
              border: "none",
            }}
          >
            ◄ Return to Lineage
          </button>
          <button
            disabled={!canProceedToAbilityScores}
            onClick={() => setStep(4)}
            style={{
              padding: "0.75rem 1.5rem",
              cursor: canProceedToAbilityScores ? "pointer" : "not-allowed",
              background: canProceedToAbilityScores ? "#ccffcc" : "#ffcccc",
              border: "none",
              flexGrow: 1,
              fontWeight: "bold",
            }}
          >
            {canProceedToAbilityScores
              ? "Proceed to Ability Scores ►"
              : "Awaiting Required Selections..."}
          </button>
        </div>
      </div>
    </div>
  );
};
