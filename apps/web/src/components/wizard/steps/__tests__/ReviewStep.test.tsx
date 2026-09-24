import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ReviewStep } from "../ReviewStep";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";
import { apiClient } from "../../../../api/client";

vi.mock("../../../../api/client", () => ({
  apiClient: vi.fn(),
  buildLevelUpOptionsEndpoint: vi.fn(),
}));

vi.mock("../../../../hooks/useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      STR: { score: 16, modifier: 3 },
      DEX: { score: 12, modifier: 1 },
      CON: { score: 15, modifier: 2 },
      INT: { score: 10, modifier: 0 },
      WIS: { score: 13, modifier: 1 },
      CHA: { score: 8, modifier: -1 },
    },
  }),
}));

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ReviewStep />);
  });
  return { container, root };
};

/** The text of each cell in the review table row whose first cell is `label`. */
const rowCells = (container: HTMLElement, label: string) => {
  const row = Array.from(container.querySelectorAll("tr")).find(
    (candidate) => candidate.querySelector("td")?.textContent === label,
  );
  return row
    ? Array.from(row.querySelectorAll("td")).map((cell) => cell.textContent ?? "")
    : undefined;
};

describe("ReviewStep level (#95)", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    // a row whose level column drifted to 5 while its ledger says fighter 3
    useCharacterSheetStore.setState({ classLevels: { class_fighter: 3 }, level: 5 });
    useLevelUpStore.setState({
      isActive: true,
      draftPayload: {
        characterId: "char_1",
        targetClassId: "class_fighter",
        newTotalLevel: 4,
      },
      progressionContext: null,
      grantedTraitDetails: [],
    });
  });

  it("shows the current total level from the class ledger, not the level column", async () => {
    const { container, root } = await render();

    expect(rowCells(container, "Total Character Level")?.slice(0, 2)).toEqual([
      "Total Character Level",
      "3",
    ]);

    root.unmount();
    container.remove();
  });
});

describe("ReviewStep hit point preview (#88)", () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
    useCharacterSheetStore.setState({ classLevels: { class_fighter: 3 }, level: 3 });
    useLevelUpStore.setState({
      isActive: true,
      draftPayload: {
        characterId: "char_1",
        targetClassId: "class_fighter",
        newTotalLevel: 4,
        hpRoll: 6,
        asiChoices: [
          { stat: "CON", value: 1 },
          { stat: "STR", value: 1 },
        ],
      },
      progressionContext: null,
      grantedTraitDetails: [],
      hitPointPreview: { status: "idle" },
    });
  });

  it("shows the server's maximum before, after and the gain", async () => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      maxHpBefore: 31,
      maxHpAfter: 44,
      hitPointGain: 13,
    });

    const { container, root } = await render();
    await act(async () => {});

    const cells = rowCells(container, "Maximum Hit Points");
    expect(cells?.[1]).toBe("31");
    expect(cells?.[3]).toBe("44+13");
    expect(vi.mocked(apiClient)).toHaveBeenCalledWith(
      "/character/char_1/level-up/preview",
      expect.objectContaining({ method: "POST" }),
    );

    root.unmount();
    container.remove();
  });

  it("says it is calculating while the preview is pending", async () => {
    vi.mocked(apiClient).mockReturnValueOnce(new Promise(() => {}));

    const { container, root } = await render();

    expect(rowCells(container, "Maximum Hit Points")?.[3]).toBe("Calculating…");

    root.unmount();
    container.remove();
  });

  it("says the preview is unavailable when the server cannot answer", async () => {
    vi.mocked(apiClient).mockRejectedValueOnce(new Error("offline"));

    const { container, root } = await render();
    await act(async () => {});

    expect(rowCells(container, "Maximum Hit Points")?.[3]).toBe(
      "Hit point preview unavailable",
    );

    root.unmount();
    container.remove();
  });

  it.each([
    ["no change", 29, 0, "29+0"],
    ["a loss", 28, -1, "28−1"],
  ])("signs %s properly (#107)", async (_label, maxHpAfter, hitPointGain, expected) => {
    vi.mocked(apiClient).mockResolvedValueOnce({
      maxHpBefore: 29,
      maxHpAfter,
      hitPointGain,
    });

    const { container, root } = await render();
    await act(async () => {});

    expect(rowCells(container, "Maximum Hit Points")?.[3]).toBe(expected);

    root.unmount();
    container.remove();
  });
});
