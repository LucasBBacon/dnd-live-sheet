# Copilot Instructions

> **About this `.github/` directory.** These files were copied from the Copilot customization library, which is a **meta-repo**: it ships the *processes, rules, instructions, skills, and agents* used across the owner's projects, not their state. The library deliberately does **not** ship project-state files such as `.github/lessons/lessons.md` or `.github/decisions/GLOBAL_ARCHITECTURE_DECISIONS.md` -- those are owned by the consuming project and are bootstrapped on first use from instructions in this directory (see Lessons section below and `.github/instructions.adr-capture.instructions.md`). This way, future library updates never collide with the project's accumulated entries. Project-context instructions (`python-project-context`, `typescript-project-context`, `java-project-context`) ship with starter examples that the consuming project should adapt to its own package names, JIRA project key, and architecture.

## Language & Communication

**IMPORTANT:** Use English (British) spelling, vocabulary and grammar in all code, comments, documentation and communication.
- Don't split infinitives (e.g., use "to run" not "to quickly run")
- Note that 'yy' and 'kk' should both be interpreted as affirmative when given in reply to yes-or-no questions.
- **Always use hyphen-minus (`-`, U+002D)** for hyphenation and dashes in code, comments, and documentation. Never use en-dash (U+2013), em-dash (U+2014), or other dash variants.

**IMPORTANT:** Use British units of measurement in all examples, documentation, and communication. In particular:
- **Currency**: pounds (£) and pence/pennies (p) - not dollars, cents, or euros.
- **Distance**: miles, yards, feet, inches - not kilometers or meters (unless the context is explicitly scientific or metric-only).
- **Weight**: stones, pounds, ounces for everyday use; tonnes for large quantities.
- **Volume**: pints, fluid ounces for liquids in everyday contexts; litres are acceptable for scientific or fuel contexts.
- **Temperature**: Celsius (degrees C) - British usage follows metric convention here.

---

## Shell Command Execution Guidelines (PowerShell)

Core rules, mandatory patterns, background execution, and PowerShell notes are defined in `instructions/shell-execution.instructions.md` (loaded on demand)

---

## Lessons Learned & Maintenance

**Read `.github/lessons/lessons.md` before generating text or code.** It contains corrections from previous interactions in this project that must be applied going forward.

When the user corrects a mistake (e.g., word choice, technical inaccuracy, style issue), record the required learning as a new lesson in `.github/lessons/lessons.md` following the format below.


### Bootstrap: creating `lessons.md` in your project

The customization library does not ship `.github/lessons/lessons.md` (so library updates never collide with the project's lessons). The first time a lesson needs to be recorded in a project that does not yet have a lesson log, create the file with the skeleton below, then append the first entry under the marker line. After bootstrap, the file is owned by the project.

````markdown
# Lessons Learned

Staging area for corrections. New lessons are added in full. Once promoted to an instruction file or skill the full entry is replaced with a one-line stub. The file should stay short -- if it is growing, follow `.github/instructions/lesson-extraction.instructions.md` to promote and trim.

## Format

```
## YYYY-MM-DD -- Short title
**Context:** What the user was doing.
**Correction:** What was wrong and the right approach.
**Rule:** A one-line takeaway to apply in future.
```

Once promoted: replace the full entry with `## YYYY-MM-DD -- Short title *(promoted -> instructions/<file>.instructions.md)*` (or `*(promoted -> skills/<name>/SKILL.md)*`).

When a lesson is durable, promote it: an actionable rule scoped to specific files becomes a `.github/instructions/<topic>.instructions.md` file with an `applyTo` glob; a recurring multi-step procedure or body of domain knowledge becomes a `.github/skills/<name>/SKILL.md`. Reference the source lesson date/title in the target file so origin is traceable. See `.github/instructions/lesson-extraction.instructions.md` for the full decision rule, promotion steps, and anti-bloat rules.

---

<!-- Add new lessons below this line -->

````

### Promotion to Instructions & Skills

When a lesson (or a durable `/memories/` note) has earned a permanent home, promote it: an actionable rule scoped to specific files becomes a `.github/instructions/<topic>.instructions.md` file with an `applyTo` glob; a recurring multi-step procedure or body of domain knowledge becomes a `.github/skills/<name>/SKILL.md`.

- **Keep `lessons.md`** as the canonical chronological log (append-only), trimmed toa one-line stub once an entry is promoted
- **Promote the rule/procedure** into the right target by shape (instructions vs skill)
- **Reference the source** lesson date/title (or memory note) in the target file so the origin is traceable

see `.github/instructions/lesson-extraction.instructions.md` for the decision rule, promotion steps, and anti-bloat rules.

## Architecture Decisions (ADRs)

Two ADR logs, distinguished by scope:

- **Project ADRs** -- specific to this project. Live in the project's own docs repo, typically at `<project>/docs/decisions/ARCHITECTURE_DECISIONS.md`.
- **Global ADRs** -- apply across every project the owner contributes to (e.g. code0generation conventions, language-version standards, security defaults, tooling preferences). Live at `.github/decisions/GLOBAL_ARCHITECTURE_DECISIONS.md`. The customization library does not ship this file; it is bootstrapped on first use (see `.github/instructions/adr-capture.instructions.md`).

When you detect a design/architecture decision in the conversation (user picks one option over another, accepts a design steer, rejects a previously planned approach, lays down a "don't do X going forward" rule), classify by scope, propose an ADR entry in the right log, and ask before writing. See `.github/instructions/adr-capture.instructions.md` for the trigger list, capture flow, scope decision rule, and bootstrap skeleton.

## Skill and Instruction File edits

After editing any skill file (`.github/skills/**/SKILL.md`) or instruction file (`.github/instructions/*.instructions.md`) that was previously read into context during the current session, **re-read the file** before resuming tasks that depend on its content. the in-memory copy is stale after edits.