import { useQuery } from "@tanstack/react-query";
import {
  apiClient,
  buildScopedReferenceEndpoint,
} from "../../../../api/client";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";

type ReferenceFeat = {
  id: string;
  name: string;
  lore?: {
    shortDescription?: string;
    fullText?: string;
  } | null;
};

export const FeatSelection = () => {
  const { draftPayload, updateDraft } = useLevelUpStore();
  const campaignId = useCharacterSheetStore((state) => state.campaignId);
  const characterId = useCharacterSheetStore((state) => state.id);

  const { data, isLoading, isError } = useQuery<{ feats: ReferenceFeat[] }>({
    queryKey: ["reference", "level-up", "feats", campaignId, characterId],
    queryFn: () =>
      apiClient(
        buildScopedReferenceEndpoint("/reference/feats", {
          campaignId,
          characterId,
        }),
      ),
    staleTime: 1000 * 60 * 30,
    enabled: Boolean(characterId),
  });

  const availableFeats = data?.feats ?? [];

  const selectedFeat = availableFeats.find((f) => f.id === draftPayload.featId);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex flex-col">
        <label className="text-xs font-bold uppercase text-gray-500 tracking-widest mb-2">
          Available Feats
        </label>
        <select
          value={draftPayload.featId || ""}
          onChange={(e) => updateDraft({ featId: e.target.value })}
          className="border-2 border-gray-300 p-3 rounded font-bold text-gray-900 bg-white shadow-sm focus:border-indigo-600 outline-none"
        >
          <option value="">-- Choose a Feat --</option>
          {availableFeats.map((feat) => (
            <option key={feat.id} value={feat.id}>
              {feat.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          {isLoading
            ? "Loading feat options..."
            : isError
              ? "Failed to load feats for the current campaign scope."
              : `${availableFeats.length} feat${availableFeats.length === 1 ? "" : "s"} available in this scope.`}
        </p>
      </div>

      {/* DYNAMIC DESCRIPTOR BLOCK */}
      <div className="flex-grow bg-white border border-gray-200 rounded p-4 shadow-inner overflow-y-auto">
        {selectedFeat ? (
          <>
            <h4 className="font-extrabold text-gray-900 border-b border-gray-200 pb-2 mb-3">
              {selectedFeat.name}
            </h4>
            <p className="text-sm text-gray-700 leading-relaxed">
              {selectedFeat.lore?.fullText ||
                selectedFeat.lore?.shortDescription ||
                "No feat description available."}
            </p>
          </>
        ) : (
          <>
            <div className="h-full flex items-center justify-center text-gray-400 text-sm font-bold uppercase tracking-widest text-center">
              Feat Description <br /> Will Appear Here
            </div>
          </>
        )}
      </div>
    </div>
  );
};
