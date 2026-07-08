import type { LevelDecision } from "@project/engine";
import { AsiFeatStep } from "./steps/AsiFeatStep";
import { HpRollStep } from "./steps/HpRollStep";
import { ReviewStep } from "./steps/ReviewStep";
import { OverviewStep } from "./steps/OverviewStep";
import { SubclassStep } from "./steps/SubclassStep";

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
      return <OverviewStep />;
    case "hp_increase":
      return (
        <div>
          <HpRollStep />
        </div>
      );
    case "subclass":
      return <SubclassStep context={getDecisionContext("subclass")!} />;
    case "asi_or_feat":
      return <AsiFeatStep context={getDecisionContext("asi_or_feat")!} />;
    case "review":
      return <ReviewStep />;
    default:
      return (
        <div className="text-red-500 border border-red-300 p-4 font-bold text-center">
          Unhandled Step Type: {stepType}
        </div>
      );
  }
};
