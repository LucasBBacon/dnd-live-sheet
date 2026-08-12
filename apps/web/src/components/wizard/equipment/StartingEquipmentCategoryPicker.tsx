import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RuleSnapshot, StartingEquipmentGrant } from "@project/shared";
import { apiClient, buildScopedReferenceEndpoint } from "../../../api/client";
import { buildCategoryItemOptions } from "../../../utils/startingEquipment";

type RulesSnapshotResponse = {
  snapshot: Pick<RuleSnapshot, "itemsById">;
};

export const StartingEquipmentCategoryPicker = ({
  campaignId,
  categoryGrant,
  selectedGrant,
  onChange,
}: {
  campaignId: string | null;
  categoryGrant: StartingEquipmentGrant;
  selectedGrant: StartingEquipmentGrant | null;
  onChange: (grant: StartingEquipmentGrant | null) => void;
}) => {
  const { data, isLoading } = useQuery<RulesSnapshotResponse>({
    queryKey: ["reference", "rules-snapshot", campaignId],
    queryFn: () =>
      apiClient(
        buildScopedReferenceEndpoint("/reference/rules/snapshot", {
          campaignId,
        }),
      ),
  });

  const options = useMemo(
    () => buildCategoryItemOptions(data?.snapshot, categoryGrant.refId),
    [categoryGrant.refId, data],
  );

  if (categoryGrant.kind !== "category") {
    return null;
  }

  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div
        style={{ fontSize: "0.8rem", marginBottom: "0.25rem", color: "#555" }}
      >
        Resolve{" "}
        {categoryGrant.refId.replace(/^category_/, "").replace(/_/g, " ")}
      </div>
      <select
        value={selectedGrant?.refId ?? ""}
        onChange={(event) => {
          const selectedRefId = event.target.value;
          if (!selectedRefId) {
            onChange(null);
            return;
          }

          onChange({
            kind: "item",
            refId: selectedRefId,
            quantity: categoryGrant.quantity,
          });
        }}
        style={{ width: "100%", padding: "0.5rem", fontFamily: "monospace" }}
        disabled={isLoading || options.length === 0}
      >
        <option value="">
          {isLoading
            ? "Loading item options..."
            : options.length === 0
              ? "No matching items found"
              : "Select an item..."}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
};
