export interface SkillDefinition {
  id: string;
  name: string;
  ability: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
}

// 2014 PHB standard
export const SKILL_MAP: Record<string, SkillDefinition> = {
  athletics: { id: "athletics", name: "Athletics", ability: "STR" },
  acrobatics: { id: "acrobatics", name: "Acrobatics", ability: "DEX" },
  sleight_of_hand: {
    id: "sleight_of_hand",
    name: "Sleight of Hand",
    ability: "DEX",
  },
  stealth: { id: "stealth", name: "Stealth", ability: "DEX" },
  arcana: { id: "arcana", name: "Arcana", ability: "INT" },
  history: { id: "history", name: "History", ability: "INT" },
  investigation: {
    id: "investigation",
    name: "Investigation",
    ability: "INT",
  },
  nature: { id: "nature", name: "Nature", ability: "INT" },
  religion: { id: "religion", name: "Religion", ability: "INT" },
  animal_handling: {
    id: "animal_handling",
    name: "Animal Handling",
    ability: "WIS",
  },
  insight: { id: "insight", name: "Insight", ability: "WIS" },
  medicine: { id: "medicine", name: "Medicine", ability: "WIS" },
  perception: { id: "perception", name: "Perception", ability: "WIS" },
  survival: { id: "survival", name: "Survival", ability: "WIS" },
  deception: { id: "deception", name: "Deception", ability: "CHA" },
  intimidation: {
    id: "intimidation",
    name: "Intimidation",
    ability: "CHA",
  },
  performance: { id: "performance", name: "Performance", ability: "CHA" },
  persuasion: { id: "persuasion", name: "Persuasion", ability: "CHA" },
};
