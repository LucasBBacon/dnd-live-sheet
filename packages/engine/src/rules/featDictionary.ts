export const FEAT_DICTIONARY = [
  {
    id: "feat_tough",
    name: "Tough",
    description:
      "Your hit point maximum increases by an amount equal to twice your level...",
    prerequisites: () => true, // No prerequisites
  },
  {
    id: "feat_heavy_armor_master",
    name: "Heavy Armor Master",
    description: "You can use your armor to deflect strikes...",
    // Example of engine evaluation protecting the UI
    prerequisites: (
      abilities: Record<string, number>,
      proficiencies: string[],
    ) =>
      abilities &&
      proficiencies.includes("trait_prof_heavy_armor"),
  },
];
