import { describe, expect, it } from "vitest";
import { SurpriseEngine } from "../surprise.js";

const FERAL = "status_feral_instinct";
const RAGING = "status_raging";

const describeWith = (surprised: boolean, activeStates: string[] = []) =>
  SurpriseEngine.describe({ surprised, activeStates });

describe("SurpriseEngine.describe", () => {
  it("says nothing when the character was not surprised", () => {
    expect(describeWith(false, [FERAL]).outcome).toBe("not_surprised");
  });

  it("reports the restriction when no trait lifts it", () => {
    const report = describeWith(true);

    expect(report.outcome).toBe("restricted");
    expect(report.summary).toMatch(/no action or reaction/i);
  });

  it("offers the release when Feral Instinct is active but the character has not raged", () => {
    const report = describeWith(true, [FERAL]);

    expect(report.outcome).toBe("release_available");
    expect(report.summary).toMatch(/rage/i);
  });

  it("releases the turn once the character is raging", () => {
    expect(describeWith(true, [FERAL, RAGING]).outcome).toBe("released");
  });

  it("withholds the release while incapacitated, even if raging", () => {
    // RAW gates the surprise clause on "aren't incapacitated", so the trait
    // cannot help here - this is the one case raging does not unlock
    const report = describeWith(true, [FERAL, RAGING, "incapacitated"]);

    expect(report.outcome).toBe("restricted");
    expect(report.summary).toMatch(/incapacitated/i);
  });
});
