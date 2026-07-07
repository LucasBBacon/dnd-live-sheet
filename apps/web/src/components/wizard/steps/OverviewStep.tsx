import React, { useMemo } from "react";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../store/levelUpStore";
import { ProgressionEngine, TRAIT_DICTIONARY } from "@project/engine";

// Mocked for the snippet; TODO: GET THIS FROM OUR DB
const AVAILABLE_CLASSES = [
  { id: "class_fighter", name: "Fighter" },
  { id: "class_rogue", name: "Rogue" },
  { id: "class_wizard", name: "Wizard" },
];

export const OverviewStep = () => {
  const { draftPayload, progressionContext, beginLevelUp, errorMessage } =
    useLevelUpStore();
  const characterId = useCharacterSheetStore((state) => state.id);
  const totalLevel = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);

  // fetch human-readable names for traits automatically received
  const automaticFeatures = useMemo(() => {
    console.log("Progression context")
    console.log(progressionContext)
    if (!progressionContext) return [];
    return progressionContext.grantedTraits.map((traitId) => {
      console.log(traitId);
      return (
        TRAIT_DICTIONARY[traitId]?.name ||
        traitId.replace(/_/g, " ").toUpperCase()
      );
    });
  }, [progressionContext]);

  // handle multiclassing / class swapping on the fly
  const handleClassChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (!characterId) {
      return;
    }

    const newClassId = e.target.value;
    const currentLevelInNewClass = classLevels[newClassId] || 0;

    // this instantly recalculates progressionContext and parent wizard steps
    beginLevelUp(
      characterId,
      newClassId,
      currentLevelInNewClass,
      totalLevel + 1,
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
          value={draftPayload.targetClassId}
          onChange={handleClassChange}
          className="border border-gray-300 p-2 rounded font-bold text-lg text-indigo-900 bg-white shadow-sm"
        >
          {AVAILABLE_CLASSES.map((cls) => {
            const lvl = classLevels[cls.id] || 0;
            const isDip = lvl === 0;
            const nextClassLevel = lvl + 1;
            const isSupported = !!ProgressionEngine.getLevelDefinition(
              cls.id,
              nextClassLevel,
            );

            return (
              <option key={cls.id} value={cls.id} disabled={!isSupported}>
                {cls.name}{" "}
                {!isSupported
                  ? `(Unavailable - Level ${nextClassLevel} not configured)`
                  : isDip
                  ? "(Multiclass - Level 1)"
                  : `Progress to Level ${lvl + 1}`}
              </option>
            );
          })}
        </select>
        <p className="text-xs text-gray-500">
          Only classes with configured progression data can be selected here.
        </p>
      </div>

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
            {automaticFeatures.map((featureName, idx) => (
              <li key={idx}>
                <span>✦</span>
                <span>{featureName}</span>
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
