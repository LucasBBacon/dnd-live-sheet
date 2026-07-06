import { useMemo, useState } from "react";
import { useLevelUpStore } from "../../store/levelUpStore";
import { WizardStepRouter } from "./WizardStepRouter";
import { isStepComplete } from "../../utils/wizardValidation";

export const LevelUpWizard = () => {
  const {
    isActive,
    progressionContext,
    draftPayload,
    cancelLevelUp,
    validateAndSubmit,
  } = useLevelUpStore();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // dynamically generate the required steps for this specific level
  const wizardSteps = useMemo(() => {
    if (!progressionContext) return [];

    const steps: string[] = ["overview", "hp_increase"]; // always required

    // inject dynamic decisions from the engine
    progressionContext.decisions.forEach((decision) => {
      steps.push(decision.type); // e.g., 'subclass', 'asi_or_feat'
    });

    steps.push("review"); // always final step
    return steps;
  }, [progressionContext]);

  if (!isActive || !progressionContext) return null;

  const activeStepType = wizardSteps[currentStepIndex];
  const isNextEnabled = isStepComplete(
    activeStepType,
    draftPayload,
    progressionContext.decisions,
  );
  const isLastStep = currentStepIndex === wizardSteps.length - 1;

  const handleNext = () =>
    setCurrentStepIndex((prev) => Math.min(prev + 1, wizardSteps.length - 1));
  const handleBack = () => setCurrentStepIndex((prev) => Math.max(prev - 1, 0));

  const handleSubmit = async () => {
    try {
      await validateAndSubmit();
      handleClose();
      // TODO handle success routing (e.g., close wizard, show toast)
    } catch (error) {
      console.error(error);
      // TODO: surface error to UI
    }
  };

  const handleClose = () => {
    cancelLevelUp();
    setCurrentStepIndex(0);
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex justify-center items-center z-50 p-6 font-mono">
      <div className="bg-white border-2 border-gray-900 rounded max-w-2xl w-full h-[80vh] flex flex-col shadow-2xl">
        {/* HEADER AND PROGRESS */}
        <div className="bg-gray-100 p-4 border-b-2 border-gray-300 flex justify-between items-center">
          <h2 className="text-xl font-bold uppercase">
            Level Up: {draftPayload.targetClassId?.replace("class_", "")} Level{" "}
            {draftPayload.newTotalLevel}
          </h2>
          <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">
            Step {currentStepIndex + 1} / {wizardSteps.length}
          </span>
        </div>

        {/* DYNAMIC STEP CONTENT */}
        <div className="flex-grow overflow-y-auto p-6 bg-white relative">
          <WizardStepRouter
            stepType={activeStepType}
            decisions={progressionContext.decisions}
          />
        </div>

        {/* GLOBAL NAVIGATION CONTROLS */}
        <div className="border-t-2 border-gray-300 p-4 bg-gray-50 flex justify-between">
          <button
            onClick={cancelLevelUp}
            className="px-4 py-2 text-red-600 font-bold hover:text-red-800 uppercase text-sm"
          >
            Cancel Execution
          </button>

          <div className="flex gap-3">
            <button
              onClick={handleBack}
              disabled={currentStepIndex === 0}
              className="px-4 py-2 font-bold text-gray-700 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300"
            >
              BACK
            </button>

            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={!isNextEnabled}
                className="px-6 py-2 font-bold text-white bg-green-600 rounded hover:bg-green-700 shadow-sm disabled:bg-green-300 disabled:cursor-not-allowed"
              >
                COMMIT LEVEL UP
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!isNextEnabled}
                className="px-6 py-2 font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 shadow-sm disabled:bg-indigo-300 disabled:cursor-not-allowed"
              >
                NEXT
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
