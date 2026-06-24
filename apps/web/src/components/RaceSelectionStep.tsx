/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";
import { useWizardStore } from "../store/wizardStore";

export const RaceSelectionStep = () => {
  // Fetch options from the new API
  const { data, isLoading } = useQuery({
    queryKey: ["reference", "races"],
    queryFn: () => apiClient("/reference/races"),
  });

  // Connect to zustand draft state
  const { raceId, subraceId, setRace, setSubrace, canProceed, setStep } =
    useWizardStore();

  useEffect(() => {
    setStep(2);
  }, [setStep]);

  if (isLoading) return <div>Loading races...</div>;

  const selectedRaceConfig = data?.races.find((r: any) => r.id === raceId);

  return (
    <div>
      <h2>Select a Race</h2>

      {/* race select */}
      <select
        value={raceId || ""}
        onChange={(e) => {
          const selected = data?.races.find(
            (r: any) => r.id === e.target.value,
          );
          if (selected) {
            setRace(selected.id, selected.requiresSubrace);
          }
        }}
      >
        <option value="" disabled>
          Select a race...
        </option>
        {data?.races.map((race: any) => (
          <option key={race.id} value={race.id}>
            {race.name}
          </option>
        ))}
      </select>

      {/* conditional subrace select */}
      {selectedRaceConfig?.requiresSubrace && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Select a Subrace</h3>
          <select
            value={subraceId || ""}
            onChange={(e) => setSubrace(e.target.value)}
          >
            <option value="" disabled>
              Select a subrace...
            </option>
            {selectedRaceConfig.subraces.map((subrace: any) => (
              <option key={subrace.id} value={subrace.id}>
                {subrace.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Locked progression btn */}
      <div style={{ marginTop: "2rem" }}>
        <button disabled={!canProceed()} onClick={() => setStep(3)}>
          Next Step
        </button>
      </div>
    </div>
  );
};
