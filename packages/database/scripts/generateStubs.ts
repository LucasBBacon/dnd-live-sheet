/**
 * One-shot migration: a marked stub for every id with no real definition.
 *
 * Structural completeness is what lets the pack own every section and the
 * legacy sources be deleted. Every entry declares itself unimplemented, so a
 * stub is never mistaken for a rule that deliberately grants nothing.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { traitIdOfOption } from "@project/shared";

const PACK = path.join(process.cwd(), "data/packs/core_2014_pack");
const DATA = path.join(process.cwd(), "data");

/** A segment file, shaped loosely because it has not been validated yet. */
type Segment = Record<string, any[]>;

const readJson = (file: string): any => JSON.parse(readFileSync(file, "utf8"));

/**
 * Every segment in the pack, excluding the manifest and this script's own
 * output.
 *
 * Skipping the stub files is what makes a re-run idempotent: counted as
 * authored, the previous run's stubs would satisfy every outstanding
 * reference and the next run would emit nothing at all.
 */
const segments = (): Segment[] => {
  const found: Segment[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (
        entry.name === "manifest.json" ||
        entry.name === "unimplemented.json" ||
        !entry.name.endsWith(".json")
      ) {
        continue;
      }
      found.push(readJson(full));
    }
  };
  walk(PACK);
  return found;
};

const SEGMENTS = segments();

/**
 * Every id the pack actually *defines* in a section.
 *
 * Definitions only. A granted id is a reference, not a definition - counting
 * one as authored is what would leave it dangling, which is precisely what
 * semantic validation rejects.
 */
const authoredIds = (section: string): Set<string> =>
  new Set(
    SEGMENTS.flatMap((segment) => segment[section] ?? []).map(
      (entry: { id: string }) => entry.id,
    ),
  );

const titleFrom = (id: string): string =>
  id
    .replace(/^(trait|subclass|feat|background)_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const stubTrait = (id: string) => ({
  id,
  name: titleFrom(id),
  lore: {
    shortDescription: "Not yet authored in the pack.",
    fullText:
      "This trait exists so progressions can reference it. Its rules have not been authored yet.",
  },
  implementation: {
    mode: "unimplemented",
    summary: "Awaiting authoring.",
    blockedBy: [],
  },
});

const stubFeat = (id: string) => ({
  id,
  name: titleFrom(id),
  category: "general",
  lore: {
    shortDescription: "Not yet authored in the pack.",
    fullText:
      "This feat exists so the pack is structurally complete. Its rules have not been authored yet.",
  },
  grantedTraitIds: [],
  tags: [],
});

const write = (relativePath: string, body: unknown): void => {
  const target = path.join(PACK, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(body, null, 4)}\n`, "utf8");
  console.log(`wrote ${relativePath}`);
};

/**
 * Every trait id anything in the pack points at.
 *
 * Derived from references rather than from traits.json, because semantic
 * validation rejects a progression that grants a trait the pack does not
 * define - and the ported class progressions reference ids that legacy
 * traits.json never carried. A stub set built from traits.json alone would
 * leave those dangling.
 *
 * The sites below are exactly the ones validateCoreRulePack raises
 * unknown_trait_reference for. Missing one leaves a dangling reference that
 * only surfaces when the assembler runs.
 */
const referencedTraitIds = (): Set<string> => {
  const ids = new Set<string>();

  const fromProgression = (progression: any[] = []): void => {
    for (const node of progression) {
      for (const grant of node.grants ?? []) {
        // grants is a union: a plain trait id, a trait_choice node whose
        // options are themselves ids or gated records, or a spell_choice node
        // that names no trait at all
        if (typeof grant === "string") {
          ids.add(grant);
          continue;
        }
        if (grant.type !== "trait_choice") continue;

        for (const option of grant.options ?? []) {
          ids.add(traitIdOfOption(option));
          if (typeof option === "string") continue;
          for (const required of option.prerequisites?.requiredTraitIds ?? []) {
            ids.add(required);
          }
        }
      }
    }
  };

  for (const segment of SEGMENTS) {
    for (const cls of segment.classes ?? []) {
      fromProgression(cls.progression);
      for (const id of cls.multiclassTraitIds ?? []) ids.add(id);
      for (const id of cls.startingProficiencyTraitIds ?? []) ids.add(id);
    }

    for (const subclass of segment.subclasses ?? []) {
      fromProgression(subclass.progression);
    }

    for (const race of segment.races ?? []) {
      for (const id of race.grantedTraitIds ?? []) ids.add(id);
      for (const subrace of Object.values<any>(race.subraces ?? {})) {
        for (const id of subrace.grantedTraitIds ?? []) ids.add(id);
      }
    }

    for (const feat of segment.feats ?? []) {
      for (const id of feat.grantedTraitIds ?? []) ids.add(id);
    }

    for (const background of segment.backgrounds ?? []) {
      for (const id of background.backgroundTraitIds ?? []) ids.add(id);
    }
  }

  return ids;
};

const haveTraits = authoredIds("traits");
const legacyTraitIds: string[] = readJson(path.join(DATA, "traits.json")).map(
  (trait: { id: string }) => trait.id,
);
const referenced = referencedTraitIds();

// both sources: ids the old data carried, and ids the ported progressions
// point at. the union is what structural completeness actually requires
const needTraits = [...new Set([...legacyTraitIds, ...referenced])].filter(
  (id) => !haveTraits.has(id),
);

write("traits/unimplemented.json", {
  traits: needTraits.map(stubTrait),
});

const haveFeats = authoredIds("feats");
const legacyFeatIds: string[] = readJson(path.join(DATA, "feats.json")).map(
  (feat: { id: string }) => feat.id,
);
const needFeats = [...new Set(legacyFeatIds)].filter((id) => !haveFeats.has(id));

if (needFeats.length > 0) {
  write("feats/unimplemented.json", {
    feats: needFeats.map(stubFeat),
  });
}

const dangling = [...referenced].filter(
  (id) => !haveTraits.has(id) && !needTraits.includes(id),
);

console.log(`\nauthored traits:    ${haveTraits.size}`);
console.log(`legacy trait ids:   ${legacyTraitIds.length}`);
console.log(`referenced by pack: ${referenced.size}`);
console.log(`stubbed traits:     ${needTraits.length}`);
console.log(`stubbed feats:      ${needFeats.length}`);
console.log(`still dangling:     ${dangling.length}`);
