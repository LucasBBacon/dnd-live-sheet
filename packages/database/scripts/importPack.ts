/**
 * Assemble the shipped pack and persist it into the reference tables.
 *
 * This is the permanent replacement for the reference half of seed.ts: once
 * the dictionaries and data/*.json are gone, importing a pack is the only way
 * reference data reaches the database.
 *
 * The import is destructive and requires --yes. See the guard below.
 */
import { sql } from "drizzle-orm";
import path from "node:path";
import { assembleCoreRulePack } from "../src/corePackAssembler.js";
import { persistCoreRulePack } from "../src/corePackImporter.js";
import { db } from "../src/client.js";
import {
  CONFIRM_FLAG,
  parseImportInvocation,
} from "../src/importInvocation.js";

const { packDir, confirmed } = parseImportInvocation(
  process.argv.slice(2),
  path.join(process.cwd(), "data/packs/core_2014_pack"),
);

// persistCoreRulePack truncates the reference tables CASCADE, and those
// cascades reach character data. The cutover run of this script removed 12
// characters, 184 character_traits, 104 inventory rows and 2 custom traits
// from a live database with no warning of any kind. Counting first means the
// operator accepts or refuses a real number rather than a caveat.
const AT_RISK_TABLES = [
  "characters",
  "character_traits",
  "character_inventory",
  "character_custom_traits",
];

const atRisk: Array<{ table: string; count: number }> = [];
for (const table of AT_RISK_TABLES) {
  const rows = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM ${table}`),
  );
  atRisk.push({
    table,
    count: (rows as unknown as Array<{ n: number }>)[0]?.n ?? 0,
  });
}

const doomed = atRisk.filter((row) => row.count > 0);

if (doomed.length > 0) {
  console.warn("\nThis import TRUNCATEs the reference tables CASCADE.");
  console.warn("The following character data will be destroyed:\n");
  for (const { table, count } of doomed) {
    console.warn(`  ${table.padEnd(24)} ${count}`);
  }
  console.warn(
    "\ndb:seed:samples restores the ten fixture characters. Anything",
  );
  console.warn("hand-made is not recoverable.");
}

if (!confirmed) {
  console.error(
    `\nRefusing to import without ${CONFIRM_FLAG}. Re-run with ${CONFIRM_FLAG} to proceed.`,
  );
  process.exit(1);
}

const pack = await assembleCoreRulePack(packDir);

console.log(`assembled ${pack.pack.packId} v${pack.pack.version}:`);
for (const [section, entries] of Object.entries(pack)) {
  if (Array.isArray(entries)) {
    console.log(`  ${section.padEnd(14)} ${entries.length}`);
  }
}

await persistCoreRulePack(pack);

console.log("\npersisted. row counts:");
for (const table of [
  "core_rule_packs", "traits", "races", "subraces", "classes",
  "subclasses", "feats", "backgrounds", "items", "characters",
]) {
  const rows = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${table}`));
  const n = (rows as unknown as Array<{ n: number }>)[0]?.n ?? 0;
  console.log(`  ${table.padEnd(20)} ${n}`);
}

process.exit(0);
