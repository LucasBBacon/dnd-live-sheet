/**
 * One-shot migration: the static dictionaries, as pack segments.
 *
 * The dictionaries are already typed as the pack's own definitions -
 * TRAIT_DICTIONARY is Record<string, TraitDefinition> and CoreTraitSchema is
 * TraitDefinitionSchema.extend({ id, lore, isStartingProficiency }) - so this
 * serializes rather than converts. Deleted along with the dictionaries.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  TRAIT_DICTIONARY,
  CLASS_DICTIONARY,
  SUBCLASS_DICTIONARY,
  EQUIPMENT_DICTIONARY,
  FEAT_DICTIONARY,
  BACKGROUND_DICTIONARY,
} from "@project/engine";
// RESOURCE_DICTIONARY is not re-exported from the engine index, unlike the
// others, and the engine's `exports` map declares only ".", so a subpath
// import is not resolvable. Reach the file directly rather than widening the
// public surface of a package whose dictionaries are being deleted anyway.
import { RESOURCE_DICTIONARY } from "../../engine/src/rules/resourceDictionary.js";

const PACK = path.join(process.cwd(), "data/packs/core_2014_pack");

/** CoreTraitSchema requires lore; dictionary entries may omit it. */
const withLore = <T extends { id: string; name: string; lore?: unknown }>(
  entry: T,
) => ({
  ...entry,
  lore: entry.lore ?? {
    shortDescription: entry.name,
    fullText: entry.name,
  },
});

const write = (relativePath: string, body: unknown): void => {
  const target = path.join(PACK, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(body, null, 4)}\n`, "utf8");
  console.log(`wrote ${relativePath}`);
};

// traits keep their dictionary grouping: moving content and reorganising it
// are separate changes, and doing both at once makes the diff unreviewable
write("traits/ported.json", {
  traits: Object.values(TRAIT_DICTIONARY).map(withLore),
});

// a class segment carries its own subclasses, matching how the authored
// barbarian segment is already organised
let subclassesWritten = 0;
for (const definition of Object.values(CLASS_DICTIONARY)) {
  const slug = definition.id.replace(/^class_/, "");
  const subclasses = Object.values(SUBCLASS_DICTIONARY)
    .filter((subclass) => subclass.classId === definition.id)
    .map(withLore);

  subclassesWritten += subclasses.length;

  write(`classes/${slug}.json`, {
    classes: [withLore(definition)],
    ...(subclasses.length > 0 ? { subclasses } : {}),
  });
}

// a subclass whose classId matches no ported class would be dropped by the
// filter above and silently lost, so account for every one of them
const totalSubclasses = Object.keys(SUBCLASS_DICTIONARY).length;
if (subclassesWritten !== totalSubclasses) {
  const written = new Set(
    Object.values(SUBCLASS_DICTIONARY)
      .filter((subclass) => subclass.classId in CLASS_DICTIONARY)
      .map((subclass) => subclass.id),
  );
  const dropped = Object.values(SUBCLASS_DICTIONARY)
    .filter((subclass) => !written.has(subclass.id))
    .map((subclass) => `${subclass.id} -> ${subclass.classId}`);

  throw new Error(
    `Dropped ${totalSubclasses - subclassesWritten} subclass(es) whose classId matches no ported class: ${dropped.join(", ")}`,
  );
}

write("equipment/core.json", {
  equipment: Object.values(EQUIPMENT_DICTIONARY).map(withLore),
});

write("feats/core.json", {
  feats: Object.values(FEAT_DICTIONARY).map(withLore),
});

write("backgrounds/core.json", {
  backgrounds: Object.values(BACKGROUND_DICTIONARY).map(withLore),
});

write("resources/core.json", {
  resources: Object.values(RESOURCE_DICTIONARY),
});

console.log(
  `\nported ${Object.keys(TRAIT_DICTIONARY).length} traits, ` +
    `${Object.keys(CLASS_DICTIONARY).length} classes, ` +
    `${subclassesWritten} subclasses, ` +
    `${Object.keys(EQUIPMENT_DICTIONARY).length} equipment, ` +
    `${Object.keys(FEAT_DICTIONARY).length} feats, ` +
    `${Object.keys(BACKGROUND_DICTIONARY).length} backgrounds, ` +
    `${Object.keys(RESOURCE_DICTIONARY).length} resources`,
);
