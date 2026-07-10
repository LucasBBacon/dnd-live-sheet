import { access, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const sourceRoots = ["apps", "packages"];
const disallowedSuffixes = [".js", ".js.map", ".d.ts", ".d.ts.map"];
const ignoredDirectories = new Set(["dist", "build", "coverage", "node_modules"]);
const retiredPaths = [
  "apps/server/src/socket/controller.ts",
  "apps/web/src/hooks/useDerivedStats.ts",
  "packages/shared/src/schemas/actions.ts",
];

const findSourceDirectories = async (directory) => {
  const sourceDirectories = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (ignoredDirectories.has(entry.name)) {
      continue;
    }

    if (entry.name === "src") {
      sourceDirectories.push(entryPath);
      continue;
    }

    sourceDirectories.push(...(await findSourceDirectories(entryPath)));
  }

  return sourceDirectories;
};

const findGeneratedArtifacts = async (directory) => {
  const violations = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      violations.push(...(await findGeneratedArtifacts(entryPath)));
      continue;
    }

    if (disallowedSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      violations.push(path.relative(repoRoot, entryPath).replaceAll("\\", "/"));
    }
  }

  return violations;
};

const existingRetiredPaths = async () => {
  const violations = [];

  for (const retiredPath of retiredPaths) {
    try {
      await access(path.join(repoRoot, retiredPath));
      violations.push(retiredPath);
    } catch {
      // Expected path absence.
    }
  }

  return violations;
};

const run = async () => {
  const sourceDirectories = [];

  for (const sourceRoot of sourceRoots) {
    sourceDirectories.push(
      ...(await findSourceDirectories(path.join(repoRoot, sourceRoot))),
    );
  }

  const generatedArtifacts = [];
  for (const sourceDirectory of sourceDirectories) {
    generatedArtifacts.push(...(await findGeneratedArtifacts(sourceDirectory)));
  }

  const retiredPathViolations = await existingRetiredPaths();

  if (generatedArtifacts.length === 0 && retiredPathViolations.length === 0) {
    console.log("Hygiene check passed.");
    return;
  }

  console.error("Hygiene check failed.");

  if (generatedArtifacts.length > 0) {
    console.error("Generated artefacts found under source trees:");
    for (const artifact of generatedArtifacts) {
      console.error(`- ${artifact}`);
    }
  }

  if (retiredPathViolations.length > 0) {
    console.error("Retired duplicate paths reintroduced:");
    for (const retiredPath of retiredPathViolations) {
      console.error(`- ${retiredPath}`);
    }
  }

  process.exitCode = 1;
};

await run();