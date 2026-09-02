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
type Patch = {
  upsertTraits?: Array<{ id: string } & Record<string, unknown>>;
  deleteTraitIds?: string[];
  /** Class id -> trait ids to strip from every progression row's grants. */
  removeProgressionGrants?: Record<string, string[]>;
};

type Segment = {
  traits?: Array<{ id: string }>;
  classes?: Array<{ id: string; progression: Array<{ grants: unknown[] }> }>;
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

const printed = JSON.stringify(segment, null, 4).split("\n").join(eol);
fs.writeFileSync(segmentPath, trailingEol ? printed + eol : printed);
console.log(`patched ${segmentPath}`);
