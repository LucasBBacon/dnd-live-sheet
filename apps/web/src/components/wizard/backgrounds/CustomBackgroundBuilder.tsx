/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from "@tanstack/react-query";
import { useWizardStore } from "../../../store/wizardStore";
import { apiClient } from "../../../api/client";

export const CustomBackgroundBuilder = () => {
  const customBg = useWizardStore((state) => state.customBackground);
  const updateCustomBg = useWizardStore(
    (state) => state.updateCustomBackground,
  );

  // Fetch the universal traits filtered by category for our selection grids
  const { data: skillsData, isLoading: loadingSkills } = useQuery({
    queryKey: ["reference", "traits", "skills"],
    queryFn: () => apiClient("/reference/traits?category=skills"),
  });

  const { data: toolsData, isLoading: loadingTools } = useQuery({
    queryKey: ["reference", "traits", "tools_and_languages"],
    queryFn: () => apiClient("/reference/traits?category=tools_and_languages"),
  });

  // Strict bounds controller for array toggling
  const handleTraitToggle = (
    field: "skillTraitIds" | "toolLanguageTraitIds",
    traitId: string,
    limit: number = 2,
  ) => {
    const currentList = customBg[field];
    const isSelected = currentList.includes(traitId);

    if (isSelected) {
      updateCustomBg({ [field]: currentList.filter((id) => id !== traitId) });
    } else if (currentList.length < limit) {
      updateCustomBg({ [field]: [...currentList, traitId] });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* 1. Naming & Lore */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontWeight: "bold",
              marginBottom: "0.25rem",
            }}
          >
            Background Name
          </label>
          <input
            type="text"
            value={customBg.name}
            onChange={(e) => updateCustomBg({ name: e.target.value })}
            placeholder="e.g., Exiled Gladiator"
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
            }}
          />
        </div>

        <div
          style={{
            background: "#fdfbf7", // Parchment-toned manuscript aesthetic for custom lore
            border: "1px solid #d3c4a9",
            padding: "1rem",
            borderRadius: "2px",
          }}
        >
          <h4
            style={{
              margin: "0 0 1rem 0",
              color: "#5a472a",
              borderBottom: "1px solid #d3c4a9",
              paddingBottom: "0.25rem",
            }}
          >
            Custom Roleplay Feature
          </h4>

          <label
            style={{
              display: "block",
              fontWeight: "bold",
              fontSize: "0.85rem",
              marginBottom: "0.25rem",
            }}
          >
            Feature Name
          </label>
          <input
            type="text"
            value={customBg.featureName}
            onChange={(e) => updateCustomBg({ featureName: e.target.value })}
            placeholder="e.g., Arena Reputation"
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
              marginBottom: "1rem",
            }}
          />

          <label
            style={{
              display: "block",
              fontWeight: "bold",
              fontSize: "0.85rem",
              marginBottom: "0.25rem",
            }}
          >
            Feature Description (No mechanical benefits)
          </label>
          <textarea
            rows={4}
            value={customBg.featureDescription}
            onChange={(e) =>
              updateCustomBg({ featureDescription: e.target.value })
            }
            placeholder="Describe how NPCs interact with you, places you can find shelter, or contacts you have..."
            style={{
              width: "100%",
              padding: "0.5rem",
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        </div>
      </section>

      {/* 2. Mechanical Grants (Skills) */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "0.5rem",
          }}
        >
          <h3 style={{ margin: 0 }}>Skill Proficiencies</h3>
          <span
            style={{
              fontSize: "0.85rem",
              color: customBg.skillTraitIds.length === 2 ? "green" : "#d9534f",
              fontWeight: "bold",
            }}
          >
            {customBg.skillTraitIds.length} / 2 Selected
          </span>
        </div>

        {loadingSkills ? (
          <div style={{ fontSize: "0.85rem" }}>Loading skills...</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: "0.5rem",
            }}
          >
            {skillsData?.traits.map((trait: any) => {
              const isSelected = customBg.skillTraitIds.includes(trait.id);
              const isDisabled =
                !isSelected && customBg.skillTraitIds.length >= 2;

              return (
                <label
                  key={trait.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem",
                    border: `1px solid ${isSelected ? "#333" : "#ddd"}`,
                    backgroundColor: isSelected
                      ? "#f0f0f0"
                      : isDisabled
                        ? "#fafafa"
                        : "#fff",
                    opacity: isDisabled ? 0.6 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() =>
                      handleTraitToggle("skillTraitIds", trait.id)
                    }
                    style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
                  />
                  <span style={{ fontSize: "0.85rem" }}>{trait.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Mechanical Grants (Tools/Languages) */}
      <section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "0.5rem",
          }}
        >
          <h3 style={{ margin: 0 }}>Tools & Languages</h3>
          <span
            style={{
              fontSize: "0.85rem",
              color:
                customBg.toolLanguageTraitIds.length === 2
                  ? "green"
                  : "#d9534f",
              fontWeight: "bold",
            }}
          >
            {customBg.toolLanguageTraitIds.length} / 2 Selected
          </span>
        </div>

        {loadingTools ? (
          <div style={{ fontSize: "0.85rem" }}>Loading options...</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "0.5rem",
              maxHeight: "200px",
              overflowY: "auto",
              paddingRight: "0.5rem",
            }}
          >
            {toolsData?.traits.map((trait: any) => {
              const isSelected = customBg.toolLanguageTraitIds.includes(
                trait.id,
              );
              const isDisabled =
                !isSelected && customBg.toolLanguageTraitIds.length >= 2;

              return (
                <label
                  key={trait.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem",
                    border: `1px solid ${isSelected ? "#333" : "#eee"}`,
                    backgroundColor: isSelected
                      ? "#f0f0f0"
                      : isDisabled
                        ? "#fdfdfd"
                        : "#fff",
                    opacity: isDisabled ? 0.6 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={isDisabled}
                    onChange={() =>
                      handleTraitToggle("toolLanguageTraitIds", trait.id)
                    }
                  />
                  <span
                    style={{
                      fontSize: "0.8rem",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {trait.name}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
