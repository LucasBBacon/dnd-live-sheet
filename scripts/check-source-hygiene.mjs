import { access, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  BLOCKING_REASONS,
  findLineEndingViolations,
} from "./lineEndings.mjs";

const repoRoot = process.cwd();
const sourceRoots = ["apps", "packages"];
const disallowedSuffixes = [".js", ".js.map", ".d.ts", ".d.ts.map"];
const ignoredDirectories = new Set(["dist", "build", "coverage", "node_modules"]);
const retiredPaths = [
  "apps/server/src/socket/controller.ts",
  "apps/web/src/hooks/useDerivedStats.ts",
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

  const lineEndingFindings = await findLineEndingViolations(repoRoot);
  const lineEndingViolations = lineEndingFindings.filter((finding) =>
    BLOCKING_REASONS.has(finding.reason),
  );
  const conventionFindings = lineEndingFindings.filter(
    (finding) => finding.reason === "convention",
  );

  // Off by default: these cannot be told apart from a checkout made while
  // core.autocrlf was off, so they are a listing to work through rather than
  // a gate. See the line-endings note in the backlog.
  if (process.argv.includes("--report-eol") && conventionFindings.length > 0) {
    console.log(
      `${conventionFindings.length} files differ from this checkout's line-ending convention:`,
    );
    for (const { file, found, expected } of conventionFindings) {
      console.log(`- ${file} (${found}, convention is ${expected})`);
    }
  }

  if (
    generatedArtifacts.length === 0 &&
    retiredPathViolations.length === 0 &&
    lineEndingViolations.length === 0
  ) {
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

  if (lineEndingViolations.length > 0) {
    console.error("Line-ending corruption:");
    for (const { file, found, expected, reason } of lineEndingViolations) {
      const why =
        reason === "mixed"
          ? "one file, both endings - something rewrote part of it"
          : `.gitattributes pins this file to ${expected}`;
      console.error(`- ${file}: ${found} (${why})`);
    }
  }

  process.exitCode = 1;
};

await run();