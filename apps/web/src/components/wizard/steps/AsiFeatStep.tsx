import type { LevelDecision } from "@project/engine";
import { useLevelUpStore } from "../../../store/levelUpStore";
import { useState } from "react";

export const AsiFeatStep = ({ context }: { context: LevelDecision }) => {
  const { draftPayload, updateDraft } = useLevelUpStore();
  const [mode, setMode] = useState<"asi" | "feat" | null>(
    draftPayload.featId ? "feat" : draftPayload.asiChoices ? "asi" : null,
  );

  const handleSelectFeat = (featId: string) => {
    updateDraft({ featId, asiChoices: undefined }); // clear ASI if selecting feat
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-gray-800 pb-2 mb-4 uppercase">
        Ability Score Improvement
      </h3>
      <p className="text-sm text-gray-600 mb-6">{context.description}</p>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setMode("asi")}
          className={`flex-1 py-3 font-bold border-2 rounded ${mode === "asi" ? "bg-indigo-50 border-indigo-600 text-indigo-900" : "border-gray-300 text-gray-500 hover:border-gray-500"}`}
        >
          Increase Ability Scores
        </button>

        <button
          onClick={() => setMode("feat")}
          className={`flex-1 py-3 font-bold border-2 rounded ${mode === "feat" ? "bg-indigo-50 border-indigo-600 text-indigo-900" : "border-gray-300 text-gray-500 hover:border-gray-500"}`}
        >
          Choose a Feat
        </button>
      </div>

      {/* RENDER SUB INTERFACES */}
      <div className="flex-grow bg-gray-50 border border-gray-200 p-4 rounded overflow-y-auto">
        {mode === "asi" && (
          <div className="text-gray-500 italic text-center mt-10">
            TODO ASI DISTRIBUTION INTERFACE COMPONENT
          </div>
        )}
        {mode === "feat" && (
          <div className="text-gray-500 italic text-center mt-10">
            TODO FEAT SELECTION DROPDOWN COMPONENT
          </div>
        )}

        {!mode && (
          <div className="text-gray-400 text0sm text-center mt-10 uppercase tracking-widest font-bold">
            Select an option above to proceed
          </div>
        )}
      </div>
    </div>
  );
};
