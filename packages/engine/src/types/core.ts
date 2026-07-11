export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type ProficiencyLevel = "none" | "proficient" | "expertise";

export interface SkillDefinition {
  id: string;
  name: string;
  ability: Ability;
}

// TODO: Maybe move this to a shared package, since it's used in both the engine and the client
// 2014 PHB standard
export const SKILL_MAP: Record<string, SkillDefinition> = {
  athletics: { id: "athletics", name: "Athletics", ability: "str" },
  acrobatics: { id: "acrobatics", name: "Acrobatics", ability: "dex" },
  sleight_of_hand: {
    id: "sleight_of_hand",
    name: "Sleight of Hand",
    ability: "dex",
  },
  stealth: { id: "stealth", name: "Stealth", ability: "dex" },
  arcana: { id: "arcana", name: "Arcana", ability: "int" },
  history: { id: "history", name: "History", ability: "int" },
  investigation: {
    id: "investigation",
    name: "Investigation",
    ability: "int",
  },
  nature: { id: "nature", name: "Nature", ability: "int" },
  religion: { id: "religion", name: "Religion", ability: "int" },
  animal_handling: {
    id: "animal_handling",
    name: "Animal Handling",
    ability: "wis",
  },
  insight: { id: "insight", name: "Insight", ability: "wis" },
  medicine: { id: "medicine", name: "Medicine", ability: "wis" },
  perception: { id: "perception", name: "Perception", ability: "wis" },
  survival: { id: "survival", name: "Survival", ability: "wis" },
  deception: { id: "deception", name: "Deception", ability: "cha" },
  intimidation: {
    id: "intimidation",
    name: "Intimidation",
    ability: "cha",
  },
  performance: { id: "performance", name: "Performance", ability: "cha" },
  persuasion: { id: "persuasion", name: "Persuasion", ability: "cha" },
};
