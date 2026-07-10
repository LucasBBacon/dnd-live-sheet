import React, { useMemo } from "react";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../store/levelUpStore";
import { useQuery } from "@tanstack/react-query";
import {
  apiClient,
  buildLevelUpOptionsEndpoint,
} from "../../../api/client";

type ReferenceClass = {
  id: string;
  name: string;
};

type LevelUpOptionsResponse = {
  classes: ReferenceClass[];
  supportByClass: Record<
    string,
    {
      targetLevel: number;
      isConfigured: boolean;
      reason: string | null;
      multiclassPrerequisitesMet: boolean | null;
      multiclassPrerequisiteReason: string | null;
    }
  >;
  nextLevel: {
    targetLevel: number;
    isConfigured: boolean;
    reason: string | null;
  } | null;
};

export const OverviewStep = () => {
  const {
    draftPayload,
    progressionContext,
    grantedTraitDetails,
    beginLevelUp,
    errorMessage,
  } = useLevelUpStore();
  const characterId = useCharacterSheetStore((state) => state.id);
  const campaignId = useCharacterSheetStore((state) => state.campaignId);
  const totalLevel = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);

  const {
    data: optionsData,
    isLoading: classesLoading,
    isError: classesError,
  } = useQuery<LevelUpOptionsResponse>({
    queryKey: ["reference", "level-up", "options", campaignId, characterId],
    queryFn: () =>
      apiClient(
        buildLevelUpOptionsEndpoint({
          campaignId,
          characterId,
        }),
      ),
    staleTime: 1000 * 60 * 30,
    enabled: Boolean(characterId),
  });

  const availableClasses = useMemo(() => optionsData?.classes ?? [], [optionsData]);
  const supportByClassId = optionsData?.supportByClass ?? {};
  const selectedClassSupport = draftPayload.targetClassId
    ? supportByClassId[draftPayload.targetClassId]
    : undefined;
  const selectedClassLevel = draftPayload.targetClassId
    ? (classLevels[draftPayload.targetClassId] ?? 0)
    : 0;
  const selectedClassIsDip = Boolean(
    draftPayload.targetClassId && selectedClassLevel === 0,
  );

  // fetch human-readable names for traits automatically received
  const automaticFeatures = useMemo(() => {
    if (!progressionContext) return [];
    return grantedTraitDetails;
  }, [progressionContext, grantedTraitDetails]);

  const getGrantSourceLabel = (grantSourceType: string) => {
    if (grantSourceType === "multiclass_grant") {
      return "Multiclass Grant";
    }

    if (grantSourceType === "subclass_progression") {
      return "Subclass Progression";
    }

    return "Class Progression";
  };

  // handle multiclassing / class swapping on the fly
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!characterId) {
      return;
    }

    const newClassId = e.target.value;
    const currentLevelInNewClass = classLevels[newClassId] || 0;
    const preResolvedSupport = supportByClassId[newClassId];

    // this instantly recalculates progressionContext and parent wizard steps
    void beginLevelUp(
      characterId,
      newClassId,
      currentLevelInNewClass,
      totalLevel + 1,
      { campaignId },
      preResolvedSupport,
    );
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
        Level Up Overview
      </h3>

      <p className="text-sm text-gray-600 mb-6">
        You have gained enough experience to reach{" "}
        <span className="font-bold text-gray-900">
          Total Level {totalLevel + 1}
        </span>
        . Confirm the class you wish to progress in.
      </p>

      {/* CLASS SELECTOR (multiclassing) */}
      <div className="bg-gray-50 border-2 border-gray-200 p-4 rounded mb-6 flex flex-col gap-2">
        <label className="text-xs font-bold uppercase text-gray-500 tracking-widest">
          Target Class Progression
        </label>
        <select
          value={draftPayload.targetClassId ?? ""}
          onChange={handleClassChange}
          disabled={
            classesLoading || classesError || availableClasses.length === 0
          }
          className="border border-gray-300 p-2 rounded font-bold text-lg text-indigo-900 bg-white shadow-sm"
        >
          {availableClasses.map((cls) => {
            const lvl = classLevels[cls.id] || 0;
            const isDip = lvl === 0;
            const support = supportByClassId[cls.id] ?? {
              isConfigured: false,
              reason: null,
              targetLevel: lvl + 1,
            };
            const nextClassLevel = support.targetLevel ?? lvl + 1;
            const isSupported = support.isConfigured;

            return (
              <option key={cls.id} value={cls.id} disabled={!isSupported}>
                {cls.name}{" "}
                {!isSupported
                  ? `(Unavailable - ${support.reason || `Level ${nextClassLevel} not configured`})`
                  : isDip && support.multiclassPrerequisitesMet === false
                    ? "(Multiclass - preview: prerequisites unmet)"
                    : isDip
                    ? "(Multiclass - Level 1)"
                    : `Progress to Level ${lvl + 1}`}
              </option>
            );
          })}
        </select>
        <p className="text-xs text-gray-500">
          {classesLoading
            ? "Loading class options..."
            : classesError
              ? "Failed to load class options for this campaign scope."
              : "Only classes with configured progression data can be selected here. Multiclass prerequisite warnings are preview-only until submission."}
        </p>
      </div>

      {selectedClassIsDip &&
      selectedClassSupport?.multiclassPrerequisitesMet === false ? (
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-bold uppercase tracking-wide">
            Multiclass Prerequisite Warning
          </div>
          <div className="mt-1">
            {selectedClassSupport.multiclassPrerequisiteReason ||
              "This class preview indicates unmet multiclass prerequisites. The server will enforce the rule on submission."}
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* AUTOMATIC FEATURE PREVIEW */}
      <div className="flex-grow">
        <h4 className="font-bold text-sm text-gray-800 uppercase mb-3">
          Automatic Features Gained
        </h4>
        {automaticFeatures.length > 0 ? (
          <ul className="">
            {automaticFeatures.map((feature, idx) => (
              <li key={idx}>
                <span>✦</span>
                <span>{feature.name}</span>
                <span className="ml-2 text-xs text-gray-500">
                  [{getGrantSourceLabel(feature.grantSourceType)}]
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-white border border-gray-200 border-dashed p-6 text-center rounded text-gray-500 italic text-sm">
            No automatic features granted at this class level. <br />
            (You may still have choices to make in subsequent steps).
          </div>
        )}
      </div>
    </div>
  );
};
