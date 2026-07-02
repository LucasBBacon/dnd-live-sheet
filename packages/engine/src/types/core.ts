export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type ProficiencyLevel = "none" | "proficient" | "expertise";

export interface SkillDefinition {
  id: string;
  name: string;
  ability: Ability;
}

// 2014 PHB standard
export const SKILL_MAP: Record<string, SkillDefinition> = {
  athletics: { id: "skill_athletics", name: "Athletics", ability: "str" },
  acrobatics: { id: "skill_acrobatics", name: "Acrobatics", ability: "dex" },
  sleightOfHand: {
    id: "skill_sleight_of_hand",
    name: "Sleight of Hand",
    ability: "dex",
  },
  stealth: { id: "skill_stealth", name: "Stealth", ability: "dex" },
  arcana: { id: "skill_arcana", name: "Arcana", ability: "int" },
  history: { id: "skill_history", name: "History", ability: "int" },
  investigation: {
    id: "skill_investigation",
    name: "Investigation",
    ability: "int",
  },
  nature: { id: "skill_nature", name: "Nature", ability: "int" },
  religion: { id: "skill_religion", name: "Religion", ability: "int" },
  animalHandling: {
    id: "skill_animal_handling",
    name: "Animal Handling",
    ability: "wis",
  },
  insight: { id: "skill_insight", name: "Insight", ability: "wis" },
  medicine: { id: "skill_medicine", name: "Medicine", ability: "wis" },
  perception: { id: "skill_perception", name: "Perception", ability: "wis" },
  survival: { id: "skill_survival", name: "Survival", ability: "wis" },
  deception: { id: "skill_deception", name: "Deception", ability: "cha" },
  intimidation: {
    id: "skill_intimidation",
    name: "Intimidation",
    ability: "cha",
  },
  performance: { id: "skill_performance", name: "Performance", ability: "cha" },
  persuasion: { id: "skill_persuasion", name: "Persuasion", ability: "cha" },
};
