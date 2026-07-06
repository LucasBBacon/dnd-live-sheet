import type { LevelDecision } from "@project/engine";
import { AsiFeatStep } from "./steps/AsiFeatStep";
import { HpRollStep } from "./steps/HpRollStep";

interface RouterProps {
  stepType: string;
  decisions: LevelDecision[];
}

export const WizardStepRouter = ({ stepType, decisions }: RouterProps) => {
  // extract specific context for dynamic decisions
  const getDecisionContext = (type: string) =>
    decisions.find((d) => d.type === type);

  switch (stepType) {
    case "overview":
      return <div>OverviewStep</div>;
    case "hp_increase":
      return (
        <div>
          <HpRollStep />
        </div>
      );
    case "subclass":
      return <div>SubclassStep</div>;
    case "asi_or_feat":
      return <AsiFeatStep context={getDecisionContext("asi_or_feat")!} />;
    case "review":
      return <div>ReviewStep</div>;
    default:
      return (
        <div className="text-red-500 border border-red-300 p-4 font-bold text-center">
          Unhandled Step Type: {stepType}
        </div>
      );
  }
};
