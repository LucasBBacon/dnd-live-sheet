/**
 * Assemble the shipped pack and persist it into the reference tables.
 *
 * This is the permanent replacement for the reference half of seed.ts: once
 * the dictionaries and data/*.json are gone, importing a pack is the only way
 * reference data reaches the database.
 */
import { sql } from "drizzle-orm";
import path from "node:path";
import { assembleCoreRulePack } from "../src/corePackAssembler.js";
import { persistCoreRulePack } from "../src/corePackImporter.js";
import { db } from "../src/client.js";

const packDir =
  process.argv[2] ?? path.join(process.cwd(), "data/packs/core_2014_pack");

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
