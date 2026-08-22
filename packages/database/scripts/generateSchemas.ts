import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildPackSchemas,
  serialiseSchema,
  SCHEMA_DIR,
  SCHEMA_FILES,
} from "../src/packSchemas.js";

/**
 * Writes the JSON schemas the pack files point at.
 *
 * These files are build outputs. Editing one by hand is what produced the six
 * drift classes this replaces - run this script instead.
 */
const main = async (): Promise<void> => {
  const schemas = buildPackSchemas();

  for (const [key, filename] of Object.entries(SCHEMA_FILES)) {
    const target = path.join(SCHEMA_DIR, filename);
    await writeFile(
      target,
      serialiseSchema(schemas[key as keyof typeof schemas]),
      "utf8",
    );
    console.log(`wrote ${filename}`);
  }
};

await main();
