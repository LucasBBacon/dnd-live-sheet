/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizardStore";
import { apiClient } from "../../api/client";
import { compileCharacterPayload } from "../../utils/compileCharacter";

export const ReviewStepContainer = () => {
  const currentStep = useWizardStore((state) => state.currentStep);
  const setStep = useWizardStore((state) => state.setStep);
  const state = useWizardStore();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      // execute POST request to express
      return apiClient("/character", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      // backend returns new UUID. route the user to livesheet
      console.log(`Character securely written to Postgres:`, data.characterId);
      navigate(`/character/${data.characterId}`);
    },
    onError: (error) => {
      console.error(`Fatal compilation or network error:`, error);
    },
  });

  if (currentStep !== 6) return null;

  const handleFinalize = () => {
    const payload = compileCharacterPayload(state);
    mutation.mutate(payload);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "80hv",
        fontFamily: "monospace",
      }}
    >
      <h2>Review & Finalize Configuration</h2>

      <div
        style={{
          flexGrow: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
          paddingRight: "1rem",
        }}
      >
        {/* NETWORK ERROR DISPLAY */}
        {mutation.isError && (
          <div
            style={{
              padding: "1rem",
              background: "#ffebee",
              border: "1px solid #ffcdd2",
              color: "#c62828",
            }}
          >
            <strong>Transaction Failed:</strong> Please verify your connection
            or contact the system administrator.
          </div>
        )}

        {/* READ-ONLY VISUAL AUDIT */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "2rem",
          }}
        >
          <section
            style={{
              border: "1px solid #333",
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem 0",
                borderBottom: "1px solid #ccc",
                paddingBottom: "0.5rem",
              }}
            >
              Core Identity
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: "0.5rem",
                fontSize: "0.9rem",
              }}
            >
              <strong>Designation:</strong> <span>{state.characterName}</span>
              <strong>Lineage:</strong>{" "}
              <span>
                {state.raceId} {state.subraceId ? `(${state.subraceId})` : ""}
              </span>
              <strong>Class Matrix:</strong>{" "}
              <span>
                {state.classId}{" "}
                {state.subclassId ? `(${state.subclassId})` : ""}
              </span>
              <strong>Background:</strong>{" "}
              <span>
                {state.backgroundType === "PRESET"
                  ? state.backgroundId
                  : `Custom (${state.customBackground.name})`}
              </span>
              <strong>Alignment:</strong> <span>{state.alignment}</span>
            </div>
          </section>

          <section
            style={{
              border: "1px solid #333",
              padding: "1rem",
              background: "#fafafa",
            }}
          >
            <h3
              style={{
                margin: "0 0 1rem 0",
                borderBottom: "1px solid #ccc",
                paddingBottom: "0.5rem",
              }}
            >
              Base Attributes
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "1rem",
                textAlign: "center",
              }}
            >
              {Object.entries(state.baseAbilityScores).map(([stat, val]) => (
                <div
                  key={stat}
                  style={{
                    background: "#eee",
                    padding: "0.5rem",
                    border: "1px solid #ddd",
                  }}
                >
                  <div
                    style={{ fontWeight: "bold", textTransform: "uppercase" }}
                  >
                    {stat}
                  </div>
                  <div style={{ fontSize: "1.2rem" }}>{val}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section
          style={{
            border: "1px solid #333",
            padding: "1rem",
            background: "#fafafa",
          }}
        >
          <h3
            style={{
              margin: "0 0 1rem 0",
              borderBottom: "1px solid #ccc",
              paddingBottom: "0.5rem",
            }}
          >
            Equipment Manifest
          </h3>
          <p style={{ fontSize: "0.85rem", color: "#555" }}>
            {Object.values(state.selectedClassEquipmentChoices).flat().length}{" "}
            items queued for initialization.
          </p>
        </section>
      </div>

      {/* EXECUTION BOUNDARIES */}
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
          onClick={() => setStep(5)}
          disabled={mutation.isPending}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: mutation.isPending ? "not-allowed" : "pointer",
            background: "#e0e0e0",
            border: "none",
          }}
        >
          ◄ Amend Background
        </button>
        <button
          onClick={handleFinalize}
          disabled={mutation.isPending}
          style={{
            padding: "0.75rem 1.5rem",
            cursor: mutation.isPending ? "not-allowed" : "pointer",
            background: mutation.isPending ? "#ccc" : "#28a745",
            color: mutation.isPending ? "#777" : "#fff",
            border: "none",
            flexGrow: 1,
            fontWeight: "bold",
            fontSize: "1.1rem",
          }}
        >
          {mutation.isPending
            ? "Committing to Database..."
            : "Finalize & Initialize Sheet ►"}
        </button>
      </div>
    </div>
  );
};
