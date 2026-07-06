import { useMemo } from "react";
import { useAbilities } from "../../../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";
import { FEAT_DICTIONARY } from "@project/engine";

export const FeatSelection = () => {
  const { draftPayload, updateDraft } = useLevelUpStore();
  const { finalAbilities } = useAbilities();
  const traits = useCharacterSheetStore((state) => state.traits);

  const proficiencies = useMemo(
    () => traits.map((trait) => trait.id),
    [traits],
  );

  const availableFeats = useMemo(() => {
    return FEAT_DICTIONARY.filter(
      (feat) => feat.prerequisites(finalAbilities, proficiencies) === true,
    );
  }, [finalAbilities, proficiencies]);

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
          {availableFeats.length} feat{availableFeats.length === 1 ? "" : "s"} available for this character.
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
              {selectedFeat.description}
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
