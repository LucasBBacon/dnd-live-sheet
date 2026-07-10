import type { ResourceRule } from "@project/shared";

export const RESOURCE_DICTIONARY: Record<string, ResourceRule> = {
  trait_action_surge: {
    id: "trait_action_surge",
    name: "Action Surge",
    resetCondition: "short_rest",
    maxRule: {
      kind: "class_level_thresholds",
      classId: "class_fighter",
      thresholds: [
        { minimumLevel: 2, value: 1 },
        { minimumLevel: 17, value: 2 },
      ],
    },
  },
  trait_second_wind: {
    id: "trait_second_wind",
    name: "Second Wind",
    resetCondition: "short_rest",
    maxRule: {
      kind: "class_level_thresholds",
      classId: "class_fighter",
      thresholds: [{ minimumLevel: 1, value: 1 }],
    },
  },
};
