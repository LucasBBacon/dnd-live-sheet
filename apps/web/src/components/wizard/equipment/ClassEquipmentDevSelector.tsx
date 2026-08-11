import type {
  StartingEquipmentDefinition,
  StartingEquipmentGrant,
} from "@project/shared";
import {
  useWizardStore,
  type WizardEquipmentChoice,
} from "../../../store/wizardStore";
import {
  buildStartingEquipmentCategoryKey,
  describeStartingEquipmentGrant,
  resolveCategoryGrant,
} from "../../../utils/startingEquipment";
import { StartingEquipmentCategoryPicker } from "./StartingEquipmentCategoryPicker";

const resolveBundle = (
  bundle: StartingEquipmentGrant[],
  groupIndex: number,
  optionIndex: number,
  categoryChoices: Record<string, WizardEquipmentChoice>,
): WizardEquipmentChoice[] =>
  bundle.map((grant, grantIndex) =>
    resolveCategoryGrant(
      grant,
      buildStartingEquipmentCategoryKey(
        "class-choice",
        grantIndex,
        groupIndex,
        optionIndex,
      ),
      categoryChoices,
    ),
  );

export const ClassEquipmentDevSelector = ({
  startingEquipment,
}: {
  startingEquipment: StartingEquipmentDefinition;
}) => {
  const campaignId = useWizardStore((state) => state.campaignId);
  const selectedOptionIndices = useWizardStore(
    (state) => state.selectedClassEquipmentOptionIndices,
  );
  const selectedCategoryChoices = useWizardStore(
    (state) => state.selectedEquipmentCategoryChoices,
  );
  const setCategoryChoice = useWizardStore(
    (state) => state.setEquipmentCategoryChoice,
  );
  const setChoice = useWizardStore((state) => state.setClassEquipmentChoice);

  const { given, choices } = startingEquipment;

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

      <div
        style={{ background: "#eee", padding: "0.5rem", marginBottom: "1rem" }}
      >
        <strong>Guaranteed Grants:</strong>
        <ul style={{ margin: "0.5rem 0 0 0", paddingLeft: "1.5rem" }}>
          {given.map((grant, grantIndex) => {
            const categoryKey = buildStartingEquipmentCategoryKey(
              "class-given",
              grantIndex,
            );
            const resolvedGrant = resolveCategoryGrant(
              grant,
              categoryKey,
              selectedCategoryChoices,
            );

            return (
              <li key={categoryKey}>
                {describeStartingEquipmentGrant(resolvedGrant)}
                {grant.kind === "category" && (
                  <StartingEquipmentCategoryPicker
                    campaignId={campaignId}
                    categoryGrant={grant}
                    selectedGrant={
                      resolvedGrant.kind === "category" ? null : resolvedGrant
                    }
                    onChange={(nextGrant) =>
                      setCategoryChoice(categoryKey, nextGrant)
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {choices.map((group, groupIndex) => {
        const selectedOptionIndex = selectedOptionIndices[groupIndex];

        return (
          <div
            key={groupIndex}
            style={{
              border: "1px solid #999",
              padding: "0.5rem",
              marginBottom: "0.5rem",
            }}
          >
            <strong>
              Choice Group #{groupIndex + 1} (Choose {group.choose}):
            </strong>

            <div
              style={{
                marginTop: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              {group.options.map((option, optionIndex) => {
                const resolvedBundle = resolveBundle(
                  option.equipmentBundle,
                  groupIndex,
                  optionIndex,
                  selectedCategoryChoices,
                );
                const isChecked = selectedOptionIndex === optionIndex;

                return (
                  <div key={optionIndex}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name={`equipment-group-${groupIndex}`}
                        checked={isChecked}
                        onChange={() =>
                          setChoice(groupIndex, optionIndex, resolvedBundle)
                        }
                      />
                      <span>
                        {resolvedBundle
                          .map(describeStartingEquipmentGrant)
                          .join(" AND ")}
                      </span>
                    </label>

                    {isChecked &&
                      option.equipmentBundle.map((grant, grantIndex) => {
                        if (grant.kind !== "category") {
                          return null;
                        }

                        const categoryKey = buildStartingEquipmentCategoryKey(
                          "class-choice",
                          grantIndex,
                          groupIndex,
                          optionIndex,
                        );
                        const resolvedGrant = resolveCategoryGrant(
                          grant,
                          categoryKey,
                          selectedCategoryChoices,
                        );

                        return (
                          <div
                            key={categoryKey}
                            style={{
                              marginLeft: "1.5rem",
                              marginTop: "0.5rem",
                            }}
                          >
                            <StartingEquipmentCategoryPicker
                              campaignId={campaignId}
                              categoryGrant={grant}
                              selectedGrant={
                                resolvedGrant.kind === "category"
                                  ? null
                                  : resolvedGrant
                              }
                              onChange={(nextGrant) => {
                                const nextCategoryChoices = {
                                  ...selectedCategoryChoices,
                                };

                                if (nextGrant) {
                                  nextCategoryChoices[categoryKey] = nextGrant;
                                } else {
                                  delete nextCategoryChoices[categoryKey];
                                }

                                setCategoryChoice(categoryKey, nextGrant);
                                setChoice(
                                  groupIndex,
                                  optionIndex,
                                  resolveBundle(
                                    option.equipmentBundle,
                                    groupIndex,
                                    optionIndex,
                                    nextCategoryChoices,
                                  ),
                                );
                              }}
                            />
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
