import { useQuery } from "@tanstack/react-query";
import type { LevelDecision } from "@project/engine";
import { useEffect, useMemo } from "react";
import { apiClient, buildScopedReferenceEndpoint } from "../../../api/client";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../store/levelUpStore";

type SubclassRecord = {
  id: string;
  name: string;
  parentClassId: string;
  sourceType: "core" | "homebrew";
  ownerCharacterId?: string | null;
  lore?: {
    shortDescription?: string;
    fullText?: string;
  } | null;
};

type TimelineFeature = {
  id: string;
  name: string;
  sourceOrigin?: string;
  lore?: {
    shortDescription?: string;
  } | null;
};

type TimelineLevel = {
  level: number;
  features: TimelineFeature[];
};

export const SubclassStep = ({ context }: { context: LevelDecision }) => {
  const { draftPayload, updateDraft } = useLevelUpStore();
  const campaignId = useCharacterSheetStore((state) => state.campaignId);
  const characterId = useCharacterSheetStore((state) => state.id);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);

  const targetClassId = draftPayload.targetClassId;
  const selectedSubclassId = draftPayload.subclassId;
  const nextClassLevel = targetClassId
    ? (classLevels[targetClassId] ?? 0) + 1
    : 0;

  const {
    data: subclassesData,
    isLoading,
    isError,
  } = useQuery<{
    subclasses: SubclassRecord[];
  }>({
    queryKey: [
      "reference",
      "level-up",
      "subclasses",
      targetClassId,
      campaignId,
      characterId,
    ],
    queryFn: () =>
      apiClient(
        buildScopedReferenceEndpoint(
          `/reference/classes/${targetClassId}/subclasses`,
          {
            campaignId,
            characterId,
          },
        ),
      ),
    staleTime: 1000 * 60 * 30,
    enabled: Boolean(targetClassId && characterId),
  });

  const availableSubclasses = useMemo(() => {
    const raw = subclassesData?.subclasses ?? [];
    if (!context.options || context.options.length === 0) {
      return raw;
    }

    return raw.filter((subclass) => context.options?.includes(subclass.id));
  }, [subclassesData?.subclasses, context.options]);

  useEffect(() => {
    if (!selectedSubclassId) return;

    const isStillValid = availableSubclasses.some(
      (subclass) => subclass.id === selectedSubclassId,
    );
    if (!isStillValid) {
      updateDraft({ subclassId: undefined });
    }
  }, [availableSubclasses, selectedSubclassId, updateDraft]);

  const selectedSubclass = availableSubclasses.find(
    (subclass) => subclass.id === selectedSubclassId,
  );

  const {
    data: timelineData,
    isLoading: timelineLoading,
    isError: timelineError,
  } = useQuery<{ timeline: TimelineLevel[] }>({
    queryKey: [
      "reference",
      "level-up",
      "timeline",
      targetClassId,
      selectedSubclassId,
      campaignId,
      characterId,
    ],
    queryFn: () =>
      apiClient(
        buildScopedReferenceEndpoint(
          `/reference/classes/${targetClassId}/timeline`,
          {
            campaignId,
            characterId,
          },
          {
            subclassId: selectedSubclassId,
          },
        ),
      ),
    staleTime: 1000 * 60 * 30,
    enabled: Boolean(targetClassId && selectedSubclassId && characterId),
  });

  const featuresAtNextLevel =
    timelineData?.timeline.find((tier) => tier.level === nextClassLevel)
      ?.features ?? [];

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
        Subclass Selection
      </h3>
      <p className="text-sm text-gray-600 mb-6">{context.description}</p>

      {!context.isRequired ? (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-amber-800">
          Optional decision: you can continue without selecting a subclass.
        </div>
      ) : null}

      <div className="bg-gray-50 border-2 border-gray-200 p-4 rounded mb-6 flex flex-col gap-2">
        <label className="text-xs font-bold uppercase text-gray-500 tracking-widest">
          Available Subclasses
        </label>
        <select
          value={selectedSubclassId ?? ""}
          onChange={(event) =>
            updateDraft({
              subclassId: event.target.value || undefined,
            })
          }
          disabled={isLoading || isError || availableSubclasses.length === 0}
          className="border-2 border-gray-300 p-3 rounded font-bold text-gray-900 bg-white shadow-sm focus:border-indigo-600 outline-none"
        >
          <option value="">-- Choose a Subclass --</option>
          {availableSubclasses.map((subclass) => (
            <option key={subclass.id} value={subclass.id}>
              {subclass.name}
            </option>
          ))}
        </select>

        <p className="text-xs text-gray-500">
          {isLoading
            ? "Loading subclass options..."
            : isError
              ? "Failed to load subclasses for this campaign scope."
              : availableSubclasses.length === 0
                ? "No subclasses available for the selected class in this scope."
                : `${availableSubclasses.length} subclass${availableSubclasses.length === 1 ? "" : "es"} available.`}
        </p>
      </div>

      <div className="flex-grow bg-white border border-gray-200 rounded p-4 shadow-inner overflow-y-auto">
        {selectedSubclass ? (
          <div className="flex flex-col gap-4">
            <div>
              <h4 className="font-extrabold text-gray-900 border-b border-gray-200 pb-2 mb-2">
                {selectedSubclass.name}
              </h4>
              <p className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">
                {selectedSubclass.sourceType === "homebrew"
                  ? selectedSubclass.ownerCharacterId === characterId
                    ? "Source: Character Homebrew"
                    : "Source: Campaign Homebrew"
                  : "Source: Core"}
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {selectedSubclass.lore?.fullText ||
                  selectedSubclass.lore?.shortDescription ||
                  "No subclass description available."}
              </p>
            </div>

            <div className="rounded border border-indigo-200 bg-indigo-50 p-4">
              <h5 className="text-xs font-bold uppercase tracking-widest text-indigo-900 mb-2">
                Level {nextClassLevel} Feature Preview
              </h5>

              {timelineLoading ? (
                <p className="text-sm text-indigo-700">
                  Loading timeline metadata...
                </p>
              ) : timelineError ? (
                <p className="text-sm text-red-700">
                  Failed to load timeline metadata for this subclass.
                </p>
              ) : featuresAtNextLevel.length === 0 ? (
                <p className="text-sm text-indigo-700">
                  No subclass-specific features are granted at this level.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {featuresAtNextLevel.map((feature) => (
                    <li
                      key={feature.id}
                      className="rounded border border-indigo-100 bg-white px-3 py-2"
                    >
                      <p className="text-sm font-bold text-indigo-900">
                        {feature.name}
                      </p>
                      <p className="text-xs text-indigo-700">
                        {feature.lore?.shortDescription ||
                          "No summary available."}
                      </p>
                      {feature.sourceOrigin ? (
                        <p className="text-[11px] text-indigo-500 mt-1">
                          {feature.sourceOrigin}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm font-bold uppercase tracking-widest text-center">
            Subclass details and level preview will appear here.
          </div>
        )}
      </div>
    </div>
  );
};
