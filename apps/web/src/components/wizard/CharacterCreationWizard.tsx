import { useWizardStore } from "../../store/wizardStore";
import { AbilityStepContainer } from "./AbilityStepContainer";
import { BackgroundStepContainer } from "./BackgroundStepContainer";
import { BasicsStepContainer } from "./BasicsStepContainer";
import { ClassStepContainer } from "./ClassStepContainer";
import { RaceStepContainer } from "./RaceStepContainer";
import { ReviewStepContainer } from "./ReviewStepContainer";

const WIZARD_STEPS = [
  { id: 1, label: "Basics" },
  { id: 2, label: "Lineage" },
  { id: 3, label: "Class" },
  { id: 4, label: "Attributes" },
  { id: 5, label: "Background" },
  { id: 6, label: "Finalize" },
];

export const CharacterCreationWizard = () => {
  const currentStep = useWizardStore((state) => state.currentStep);

  // selectively pull setStep to allow clicking previous steps in the header
  const setStep = useWizardStore((state) => state.setStep);

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "2rem",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* GLOBAL WIZARD HEADER AND PROGRESS STEPPER */}
      <header style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontFamily: "monospace",
            textTransform: "uppercase",
            borderBottom: "2px solid #333",
            paddingBottom: "0.5rem",
          }}
        >
          Character Initialization Protocol
        </h1>

        <nav
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "1rem",
            position: "relative",
          }}
        >
          {/* VISUAL CONNECTING LINE */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              height: "2px",
              background: "#e0e0e0",
              zIndex: -1,
            }}
          />

          {WIZARD_STEPS.map((step) => {
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            const isLocked = currentStep < step.id;

            return (
              <button
                key={step.id}
                disabled={isLocked}
                onClick={() => setStep(step.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  background: "none",
                  border: "none",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  opacity: isLocked ? 0.5 : 1,
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isActive
                      ? "#333"
                      : isCompleted
                        ? "#28a745"
                        : "#fff",
                    color: isActive || isCompleted ? "#fff" : "#333",
                    border: `2px solid ${isActive ? "#333" : isCompleted ? "#28a745" : "#ccc"}`,
                    fontWeight: "bold",
                    fontFamily: "monospace",
                    marginBottom: "0.5rem",
                    transition: "all 0.2s ease",
                  }}
                >
                  {isCompleted ? "✓" : step.id}
                </div>
                <span
                  style={{
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                    fontWeight: isActive ? "bold" : "normal",
                    color: isActive ? "#000" : "#777",
                  }}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/*
        STEP MOUNTING AREA
        Because each container has an internal guard, they can render them all
        as siblings. This is highly efficient as React will only evaluate the active component,
        and zustand's selectors will prevent hidden components from evaluating state changes.
      */}
      <main
        style={{
          flexGrow: 1,
          backgroundColor: "#fff",
          border: "1px solid #e0e0e0",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
        }}
      >
        <BasicsStepContainer />
        <RaceStepContainer />
        <ClassStepContainer />
        <AbilityStepContainer />
        <BackgroundStepContainer />
        <ReviewStepContainer />
      </main>
    </div>
  );
};
