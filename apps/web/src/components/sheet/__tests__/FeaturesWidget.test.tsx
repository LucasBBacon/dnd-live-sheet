import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { FeaturePool } from "../../../hooks/useFeatures";
import { FeaturesWidget } from "../FeaturesWidget";

const mocks = vi.hoisted(() => ({
  features: { current: [] as FeaturePool[] },
  consumeResource: vi.fn(),
}));

vi.mock("../../../hooks/useFeatures", () => ({
  useFeatures: () => mocks.features.current,
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ consumeResource: mocks.consumeResource }),
}));

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<FeaturesWidget />);
  });

  return container;
};

describe("FeaturesWidget", () => {
  it("counts a uses pool and offers no Use button, because the save spends it", async () => {
    mocks.features.current = [
      {
        kind: "uses",
        id: "resource_relentless_rage",
        name: "Relentless Rage Uses",
        used: 1,
        resetCondition: "short_rest",
      },
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("Relentless Rage Uses");
    expect(container.textContent).toContain("Used 1 since your last rest");
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("says long rest for a uses pool that resets only on one", async () => {
    mocks.features.current = [
      {
        kind: "uses",
        id: "resource_test",
        name: "Test Uses",
        used: 0,
        resetCondition: "long_rest",
      },
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("Used 0 since your last long rest");
  });

  it("keeps the Use button on a charges pool", async () => {
    mocks.features.current = [
      {
        kind: "charges",
        id: "resource_barbarian_rage",
        name: "Rage",
        current: 2,
        max: 3,
        resetCondition: "long_rest",
        isDepleted: false,
      },
    ];

    const container = await renderWidget();

    expect(container.textContent).toContain("Uses: 2 / 3");
    expect(container.querySelector("button")?.textContent).toBe("Use");
  });
});
