/**
 * Working-tree line-ending check.
 *
 * `git status` cannot show this class of corruption: `core.autocrlf=true`
 * normalizes both sides of the comparison, so a file rewritten on disk reads
 * as unchanged. During the schema-layering branch whole files were silently
 * rewritten three separate times, each caught only by a manual byte check.
 *
 * Two findings are treated as defects, because both are unambiguous on every
 * platform:
 *
 *   "mixed"     one file containing both endings. Nothing legitimate produces
 *               this - it means something rewrote part of a file. Neither git
 *               nor any linter here reports it.
 *   "attribute" the file contradicts an explicit `eol=` pin in .gitattributes,
 *               which exists precisely so the bytes stay fixed.
 *
 * A third, "convention", is reported but never fails the build: a whole file
 * that is pure LF where `core.autocrlf=true` implies CRLF. It cannot be
 * distinguished from a legitimate checkout made while autocrlf was off, and it
 * is meaningless on a Linux CI runner, so gating on it would be a platform
 * accident rather than a check. Use --report-eol to list them.
 */
import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Bytes scanned for a NUL before deciding a file is binary. */
const BINARY_SNIFF_BYTES = 8000;

/** Findings that fail the build. "convention" is informational. */
export const BLOCKING_REASONS = new Set(["mixed", "attribute"]);

const git = async (args, cwd) => {
  const { stdout } = await run("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
};

/** Counts the endings actually present in a buffer. */
export const classifyEndings = (buffer) => {
  let lf = 0;
  let crlf = 0;

  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x0a) {
      if (i > 0 && buffer[i - 1] === 0x0d) crlf += 1;
      else lf += 1;
    }
  }

  return { lf, crlf };
};

/**
 * The ending a file is supposed to have on disk, and how strongly.
 *
 * @param eolAttribute `git check-attr eol` - "lf", "crlf" or "unspecified".
 * @param autocrlf the repository's `core.autocrlf` value.
 */
export const expectedEnding = (eolAttribute, autocrlf) => {
  if (eolAttribute === "lf" || eolAttribute === "crlf") {
    return { ending: eolAttribute, source: "attribute" };
  }

  // "input" checks out LF and converts only on the way in, so the working tree
  // is LF for everything except an explicit "true".
  return {
    ending: autocrlf === "true" ? "crlf" : "lf",
    source: "convention",
  };
};

const readAttributes = async (repoRoot, files) => {
  if (files.length === 0) return new Map();

  // execFile has no stdin channel, so check-attr is spawned and fed directly -
  // with --stdin it blocks forever on a stdin nobody closes.
  const stdout = await new Promise((resolve, reject) => {
    const child = spawn("git", ["check-attr", "--stdin", "-z", "text", "eol"], {
      cwd: repoRoot,
    });

    let out = "";
    let err = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(err || `git check-attr exited ${code}`)),
    );

    child.stdin.end(`${files.join("\0")}\0`);
  });

  // Records are NUL-separated triples: path, attribute, value.
  const fields = stdout.split("\0");
  const attributes = new Map();

  for (let i = 0; i + 2 < fields.length; i += 3) {
    const entry = attributes.get(fields[i]) ?? {};
    entry[fields[i + 1]] = fields[i + 2];
    attributes.set(fields[i], entry);
  }

  return attributes;
};

/**
 * @returns findings, each `{ file, expected, found, reason }`, where reason is
 *   "mixed", "attribute" or "convention".
 */
export const findLineEndingViolations = async (repoRoot) => {
  const [tracked, autocrlfRaw] = await Promise.all([
    git(["ls-files", "-z"], repoRoot),
    git(["config", "--get", "core.autocrlf"], repoRoot).catch(() => ""),
  ]);

  const autocrlf = autocrlfRaw.trim().toLowerCase();
  const files = tracked.split("\0").filter(Boolean);
  const attributes = await readAttributes(repoRoot, files);

  const findings = [];

  for (const file of files) {
    const attrs = attributes.get(file) ?? {};

    // `text: unset` is git's own "this is binary". Trust it rather than
    // sniffing, since it is what drives git's conversion in the first place.
    if (attrs["text"] === "unset") continue;

    let buffer;
    try {
      buffer = await readFile(path.join(repoRoot, file));
    } catch {
      continue; // tracked but absent from the working tree
    }

    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) continue;

    const { lf, crlf } = classifyEndings(buffer);
    if (lf === 0 && crlf === 0) continue; // no endings to be wrong about

    const { ending, source } = expectedEnding(attrs["eol"], autocrlf);

    // Mixed first: a half-rewritten file is a defect whatever the policy is,
    // and reporting it as merely the wrong convention would understate it.
    if (lf > 0 && crlf > 0) {
      findings.push({
        file,
        expected: ending,
        found: `mixed (${lf} LF, ${crlf} CRLF)`,
        reason: "mixed",
      });
      continue;
    }

    const found = crlf > 0 ? "crlf" : "lf";
    if (found !== ending) {
      findings.push({ file, expected: ending, found, reason: source });
    }
  }

  return findings;
};
