import { z } from "zod";

/**
 * Every damage type a rule can name, plus `same_as_weapon` for a rider whose
 * damage type is inherited from the weapon that triggered it.
 *
 * Lived on affinities.ts, which meant weapons.ts, actions.ts and dice.ts
 * imported the affinity module to describe damage that has nothing to do
 * with affinities. affinities.ts re-exports this so its existing importers
 * keep working unchanged.
 */
export const DamageTypeSchema = z.enum([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
  "same_as_weapon",
]);

export type DamageType = z.infer<typeof DamageTypeSchema>;
