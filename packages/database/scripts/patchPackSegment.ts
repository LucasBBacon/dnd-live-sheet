// packages/database/scripts/patchPackSegment.ts
import fs from "node:fs";

/**
 * Applies a small structural patch to one pack segment.
 *
 * Exists because the pack files are CRLF with four-space indentation, one of
 * them has no trailing newline, and the Edit tool rewrites all of that. Parsing
 * and re-printing with the file's own endings is lossless for every segment
 * (verified by round-tripping each one before this script was written).
 */
type ProficiencyHolder = {
  proficiencies?: {
    fixed?: Array<{ category: string; proficiencyId: string }>;
    choices?: Array<{ category: string; options?: string[] }>;
  };
};

type Patch = {
  upsertTraits?: Array<{ id: string } & Record<string, unknown>>;
  deleteTraitIds?: string[];
  /** Class id -> trait ids to strip from every progression row's grants. */
  removeProgressionGrants?: Record<string, string[]>;
  /**
   * Proficiency category -> { old id: new id }. Applied to every trait in the
   * segment, to fixed grants and to choice option lists, and only where the
   * grant's own category matches. Scoped that way because ids are only unique
   * within a category - "shield" is an armour proficiency and could equally be
   * an item id somewhere else.
   */
  renameProficiencyIds?: Record<string, Record<string, string>>;
  /** Class id -> trait ids to strip from that class's multiclassTraitIds. */
  removeMulticlassTraitIds?: Record<string, string[]>;
  /** Class id -> fields to set on that class, shallow. */
  setClassFields?: Record<string, Record<string, unknown>>;
  /** Subclass id -> fields to set on that subclass, shallow. */
  setSubclassFields?: Record<string, Record<string, unknown>>;
  /**
   * Resource id -> fields to set, shallow, on every trait resource in the
   * segment with that id. Slot pools can appear on more than one trait in a
   * segment, and every copy is set. An id that matches nothing is an error.
   */
  setTraitResourceFields?: Record<string, Record<string, unknown>>;
  /** Equipment id -> fields to set on that item, shallow. */
  setEquipmentFields?: Record<string, Record<string, unknown>>;
  /** Spells to insert, or to replace by id. */
  upsertSpells?: Array<{ id: string } & Record<string, unknown>>;
  /** Spell ids to remove. An id the segment lacks is an error. */
  deleteSpellIds?: string[];
};

type Segment = {
  traits?: Array<{
    id: string;
    resources?: Array<Record<string, unknown> & { id: string }>;
  }>;
  classes?: Array<
    Record<string, unknown> & {
      id: string;
      progression: Array<{ grants: unknown[] }>;
    }
  >;
  subclasses?: Array<Record<string, unknown> & { id: string }>;
  equipment?: Array<Record<string, unknown> & { id: string }>;
  spells?: Array<Record<string, unknown> & { id: string }>;
};

const [segmentPath, patchPath] = process.argv.slice(2);
if (!segmentPath || !patchPath) {
  console.error(
    "usage: tsx scripts/patchPackSegment.ts <segment.json> <patch.json>",
  );
  process.exit(1);
}

const raw = fs.readFileSync(segmentPath, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const trailingEol = raw.endsWith("\n");
const segment = JSON.parse(raw) as Segment;
const patch = JSON.parse(fs.readFileSync(patchPath, "utf8")) as Patch;

for (const id of patch.deleteTraitIds ?? []) {
  const index = (segment.traits ?? []).findIndex((trait) => trait.id === id);
  if (index === -1) {
    throw new Error(`${segmentPath} has no trait '${id}' to delete`);
  }
  segment.traits!.splice(index, 1);
}

for (const trait of patch.upsertTraits ?? []) {
  segment.traits ??= [];
  const index = segment.traits.findIndex((entry) => entry.id === trait.id);
  if (index === -1) segment.traits.push(trait);
  else segment.traits[index] = trait;
}

const renames = patch.renameProficiencyIds ?? {};
let renamed = 0;

for (const trait of (segment.traits ?? []) as Array<ProficiencyHolder>) {
  for (const grant of trait.proficiencies?.fixed ?? []) {
    const next = renames[grant.category]?.[grant.proficiencyId];
    if (next) {
      grant.proficiencyId = next;
      renamed += 1;
    }
  }

  for (const choice of trait.proficiencies?.choices ?? []) {
    const table = renames[choice.category];
    if (!table || !choice.options) continue;
    choice.options = choice.options.map((option) => {
      const next = table[option];
      if (next) renamed += 1;
      return next ?? option;
    });
  }
}

if (Object.keys(renames).length > 0) {
  console.log(`renamed ${renamed} proficiency id(s)`);
}

for (const [classId, ids] of Object.entries(
  patch.removeProgressionGrants ?? {},
)) {
  const entry = (segment.classes ?? []).find((cls) => cls.id === classId);
  if (!entry) throw new Error(`${segmentPath} has no class '${classId}'`);
  for (const level of entry.progression) {
    level.grants = level.grants.filter(
      (grant) => typeof grant !== "string" || !ids.includes(grant),
    );
  }
}

for (const [classId, ids] of Object.entries(
  patch.removeMulticlassTraitIds ?? {},
)) {
  const entry = (segment.classes ?? []).find((cls) => cls.id === classId);
  if (!entry) throw new Error(`${segmentPath} has no class '${classId}'`);
  entry.multiclassTraitIds = (
    (entry.multiclassTraitIds as string[] | undefined) ?? []
  ).filter((id) => !ids.includes(id));
}

for (const [classId, fields] of Object.entries(patch.setClassFields ?? {})) {
  const entry = (segment.classes ?? []).find((cls) => cls.id === classId);
  if (!entry) throw new Error(`${segmentPath} has no class '${classId}'`);
  Object.assign(entry, fields);
}

for (const [subclassId, fields] of Object.entries(
  patch.setSubclassFields ?? {},
)) {
  const entry = (segment.subclasses ?? []).find(
    (sub) => sub.id === subclassId,
  );
  if (!entry) throw new Error(`${segmentPath} has no subclass '${subclassId}'`);
  Object.assign(entry, fields);
}

for (const [resourceId, fields] of Object.entries(
  patch.setTraitResourceFields ?? {},
)) {
  const matches = (segment.traits ?? []).flatMap((trait) =>
    (trait.resources ?? []).filter((resource) => resource.id === resourceId),
  );
  if (matches.length === 0) {
    throw new Error(`${segmentPath} has no trait resource '${resourceId}'`);
  }
  for (const resource of matches) Object.assign(resource, fields);
}

for (const [equipmentId, fields] of Object.entries(
  patch.setEquipmentFields ?? {},
)) {
  const entry = (segment.equipment ?? []).find(
    (item) => item.id === equipmentId,
  );
  if (!entry) throw new Error(`${segmentPath} has no equipment '${equipmentId}'`);
  Object.assign(entry, fields);
}

for (const id of patch.deleteSpellIds ?? []) {
  const index = (segment.spells ?? []).findIndex((spell) => spell.id === id);
  if (index === -1) {
    throw new Error(`${segmentPath} has no spell '${id}' to delete`);
  }
  segment.spells!.splice(index, 1);
}

for (const spell of patch.upsertSpells ?? []) {
  segment.spells ??= [];
  const index = segment.spells.findIndex((entry) => entry.id === spell.id);
  if (index === -1) segment.spells.push(spell);
  else segment.spells[index] = spell;
}

const printed = JSON.stringify(segment, null, 4).split("\n").join(eol);
fs.writeFileSync(segmentPath, trailingEol ? printed + eol : printed);
console.log(`patched ${segmentPath}`);
