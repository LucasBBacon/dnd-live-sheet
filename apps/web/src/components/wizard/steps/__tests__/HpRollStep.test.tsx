import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { HpRollStep } from "../HpRollStep";
import { useCharacterSheetStore } from "../../../../store/characterSheetStore";
import { useLevelUpStore } from "../../../../store/levelUpStore";

/** What useQuery answers for /reference/classes; each test sets it. */
const query = vi.hoisted(() => ({
  current: { data: undefined as unknown, isError: false },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => query.current,
}));

vi.mock("../../../../hooks/useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: { CON: { score: 15, modifier: 2 } },
  }),
}));

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<HpRollStep />);
  });
  return { container, root };
};

describe("HpRollStep hit die (#105)", () => {
  beforeEach(() => {
    useCharacterSheetStore.setState({ id: "char_1", campaignId: "camp_1" });
    useLevelUpStore.setState({
      draftPayload: {
        characterId: "char_1",
        targetClassId: "class_fighter",
        newTotalLevel: 4,
      },
    });
  });

  it("offers no die while the class list loads", async () => {
    query.current = { data: undefined, isError: false };

    const { container, root } = await render();

    expect(container.textContent).toContain("Loading hit die…");
    expect(container.querySelectorAll("button")).toHaveLength(0);

    root.unmount();
    container.remove();
  });

  it("offers no die when the class list does not have the class", async () => {
    query.current = {
      data: { classes: [{ id: "class_wizard", hitDie: 6 }] },
      isError: false,
    };

    const { container, root } = await render();

    expect(container.textContent).toContain("Hit die unavailable");
    expect(container.querySelectorAll("button")).toHaveLength(0);

    root.unmount();
    container.remove();
  });

  it("offers the class's own die once it is known", async () => {
    query.current = {
      data: { classes: [{ id: "class_fighter", hitDie: 10 }] },
      isError: false,
    };

    const { container, root } = await render();
    const [average, roll] = Array.from(container.querySelectorAll("button"));

    expect(average?.textContent).toContain("Take Average6");
    expect(roll?.textContent).toContain("Roll 1d10");

    root.unmount();
    container.remove();
  });
});
