import type { ResourceDefinition } from "../types/resources.js";

export const RESOURCE_DICTIONARY: Record<string, ResourceDefinition> = {
  trait_action_surge: {
    id: "trait_action_surge",
    name: "Action Surge",
    resetCondition: "short_rest",
    getMax: (_, classLevels) => {
      const fighterLevel = classLevels["class_fighter"] || 0;
      if (fighterLevel >= 17) return 2;
      if (fighterLevel >= 2) return 1;
      return 0; // ensure the ui drops resource if criteria aren't met
    },
  },
  trait_second_wind: {
    id: "trait_second_wind",
    name: "Second Wind",
    resetCondition: "short_rest",
    getMax: (_, classLevels) => {
      const fighterLevel = classLevels["class_fighter"] || 0;
      return fighterLevel >= 1 ? 1 : 0;
    },
  },
};
