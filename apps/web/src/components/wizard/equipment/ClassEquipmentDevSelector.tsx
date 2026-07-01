/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  useWizardStore,
  type WizardEquipmentChoice,
} from "../../../store/wizardStore";

export const ClassEquipmentDevSelector = ({
  startingEquipment,
}: {
  startingEquipment: any;
}) => {
  const selectedChoices = useWizardStore(
    (state) => state.selectedClassEquipmentChoices,
  );
  const setChoice = useWizardStore((state) => state.setClassEquipmentChoice);

  if (!startingEquipment) return null;

  const { given, choices } = startingEquipment;

  // helper to stringify items within an option bundle for readable dev labels
  const getBundleLabel = (bundle: any[]) => {
    return bundle
      .map((item) => `${item.refId} (x${item.quantity})`)
      .join(" AND ");
  };

  return (
    <div
      style={{
        border: "2px solid #555",
        padding: "1rem",
        fontFamily: "monospace",
      }}
    >
      <h3 style={{ margin: "0 0 1rem 0" }}>
        [DEV TEST] Starting Equipment Orchestrator
      </h3>

      {/* Static/Guaranteed Item List */}
      <div
        style={{ background: "#eee", padding: "0.5rem", marginBottom: "1rem" }}
      >
        <strong>Guaranteed Grants:</strong>
        <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.5rem" }}>
          {given?.map((item: any, idx: number) => (
            <li key={idx}>
              {item.refId} x{item.quantity}
            </li>
          ))}
        </ul>
      </div>

      {/* Manually exclusive choice groups  */}
      {choices?.map((group: any, groupIdx: number) => {
        // find if this group already has a selection mapped in state
        const currentSelectionString = JSON.stringify(
          selectedChoices[groupIdx] || [],
        );

        return (
          <div
            key={groupIdx}
            style={{
              border: "1px solid #999",
              padding: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <strong>
              Choice Group #{groupIdx + 1} (Choose {group.choose}):
            </strong>

            <div
              style={{
                marginTop: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              {group.options.map((option: any, optionIdx: number) => {
                // map custom data schema structure into unified store model
                const storePayload: WizardEquipmentChoice[] =
                  option.equipmentBundle.map((item: any) => ({
                    itemId: item.refId,
                    quantity: item.quantity,
                  }));

                const isChecked =
                  currentSelectionString === JSON.stringify(storePayload);

                return (
                  <label
                    key={optionIdx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name={`equipment-group-${groupIdx}`}
                      checked={isChecked}
                      onChange={() => setChoice(groupIdx, storePayload)}
                    />
                    <span>{getBundleLabel(option.equipmentBundle)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
