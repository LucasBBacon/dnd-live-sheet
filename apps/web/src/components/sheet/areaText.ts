/**
 * The area shapes SpellsWidget and CombatWidget both format: a spell's
 * `AreaOfEffect` and a target save's area agree on `shape` and `size`, but a
 * target save's `shape` is a plain `string` rather than `AreaOfEffect`'s
 * narrower union, so this is what the two widgets actually share.
 */
export interface AreaLike {
  shape: string;
  size: number;
}

/** A sphere or cylinder is sized by its radius; the rest by their length. */
export const areaText = (area: AreaLike): string =>
  area.shape === "sphere" || area.shape === "cylinder"
    ? `${area.size}-foot-radius ${area.shape}`
    : `${area.size}-foot ${area.shape.replace("_", " ")}`;
