import {
  DamageTypeSchema,
  type AffinityLevel,
  type DamageBypass,
  type DamageType,
  type TraitDefinition,
} from "@project/shared";

/**
 * What a character currently resists, is immune to, or is vulnerable to.
 *
 * The `affinities` block had been authored on Rage since the pack cutover and
 * read by nothing: no calculator, no widget. This is its first consumer. It
 * reports rather than applies, because the sheet has no incoming-damage path
 * to halve anything on; the player reads the line and halves the hit.
 */

/** Every damage type a creature can actually take. `same_as_weapon` is a rider marker. */
export const REAL_DAMAGE_TYPES: DamageType[] = DamageTypeSchema.options.filter(
  (type) => type !== "same_as_weapon",
);

export interface ActiveAffinity {
  level: AffinityLevel;
  source: string;
  damageTypes: DamageType[];
  bypassedBy: DamageBypass[];
  /** The sentence the panel shows. */
  summary: string;
}

export interface AffinityInput {
  traits: TraitDefinition[];
  activeStates: string[];
}

const LEVEL_LABEL: Record<AffinityLevel, string> = {
  resistance: "Resistance to",
  immunity: "Immunity to",
  vulnerability: "Vulnerability to",
};

export const listWords = (items: string[]): string => {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

const humanise = (type: string): string => type.replace(/_/g, " ");

/**
 * "all damage except psychic" rather than twelve names: a source that covers
 * every type but one is describing an exception, not a list.
 */
const describeTypes = (types: DamageType[]): string => {
  const missing = REAL_DAMAGE_TYPES.filter((type) => !types.includes(type));
  if (missing.length === 0) return "all damage";
  if (missing.length === 1) return `all damage except ${humanise(missing[0]!)}`;
  return `${listWords(types.map(humanise))} damage`;
};

export class AffinityEngine {
  public static describe({ traits, activeStates }: AffinityInput): ActiveAffinity[] {
    const groups = new Map<string, ActiveAffinity>();

    for (const trait of traits) {
      for (const grant of trait.affinities?.fixed ?? []) {
        const required = grant.requiredStates ?? [];
        if (!required.every((state) => activeStates.includes(state))) continue;
        if (grant.damageType === "same_as_weapon") continue;

        const bypassedBy = [...(grant.bypassedBy ?? [])].sort();
        const key = `${trait.id}|${grant.level}|${bypassedBy.join(",")}`;
        const group = groups.get(key) ?? {
          level: grant.level,
          source: trait.name,
          damageTypes: [],
          bypassedBy,
          summary: "",
        };
        if (!group.damageTypes.includes(grant.damageType)) {
          group.damageTypes.push(grant.damageType);
        }
        groups.set(key, group);
      }
    }

    return [...groups.values()].map((group) => ({
      ...group,
      summary:
        `${LEVEL_LABEL[group.level]} ${describeTypes(group.damageTypes)}` +
        (group.bypassedBy.length > 0
          ? ` (bypassed by ${listWords(group.bypassedBy)})`
          : ""),
    }));
  }
}
