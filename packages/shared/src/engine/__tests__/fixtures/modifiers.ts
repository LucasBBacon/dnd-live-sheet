import type { z } from "zod";
import type { ModifierSchema } from "../../../schemas/character.js";

type Modifier = z.infer<typeof ModifierSchema>;

type ModifierOverrides = Partial<Modifier> & {
  target: string;
};

let nextId = 1;

const createId = () => {
  const suffix = String(nextId).padStart(12, "0");
  nextId += 1;
  return `00000000-0000-4000-8000-${suffix}`;
};

export const createTestModifier = (
  overrides: ModifierOverrides,
): Modifier => ({
  id: overrides.id ?? createId(),
  sourceId: overrides.sourceId ?? "test-source",
  type: overrides.type ?? "bonus",
  target: overrides.target,
  value: overrides.value,
});
