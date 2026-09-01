import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type {
  ActionGrant,
  EquipmentDefinition,
  InventoryInstance,
} from "@project/shared";
import type { ItemActionGrant } from "@project/engine";
import { DashboardLayout } from "../DashboardLayout";

/*
 * The task brief that drove this test names a `renderDashboardWith` helper
 * that does not exist anywhere in the repo, and its sample assertions use
 * `screen`/`userEvent` from `@testing-library/react` and
 * `@testing-library/user-event` - neither package is a dependency of
 * `apps/web`. This suite instead follows the harness the sibling widget
 * tests already use (see CombatWidget.test.tsx): a fully mocked
 * `characterSheetStore`, `createRoot`/`act` for rendering, and manual
 * `querySelectorAll` + `dispatchEvent` in place of `screen`/`userEvent`.
 *
 * DashboardLayout renders every HUD widget unconditionally, so the widgets
 * this suite is not exercising are stubbed out - otherwise this test would
 * also have to satisfy CombatWidget's, SkillsWidget's, etc. own store and
 * hook dependencies just to reach the inventory section below them.
 */

const mocks = vi.hoisted(() => ({
  applyHealthDelta: vi.fn(),
  equipItem: vi.fn(),
  toggleAttunement: vi.fn(),
  consumeItem: vi.fn(),
  setInventoryError: vi.fn(),
  useItemAction: vi.fn(),
  beginLevelUp: vi.fn(),
}));

vi.mock("../ArmorClassWidget", () => ({ ArmorClassWidget: () => null }));
vi.mock("../ConditionsWidget", () => ({ ConditionsWidget: () => null }));
vi.mock("../ActiveEffectsWidget", () => ({ ActiveEffectsWidget: () => null }));
vi.mock("../SavingThrowsWidget", () => ({ SavingThrowsWidget: () => null }));
vi.mock("../SkillsWidget", () => ({ SkillsWidget: () => null }));
vi.mock("../CombatWidget", () => ({ CombatWidget: () => null }));
vi.mock("../modals/RestModal", () => ({ RestModal: () => null }));
vi.mock("../../wizard/LevelUpWizard", () => ({ LevelUpWizard: () => null }));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      STR: { score: 10, modifier: 0 },
      DEX: { score: 10, modifier: 0 },
      CON: { score: 10, modifier: 0 },
      INT: { score: 10, modifier: 0 },
      WIS: { score: 10, modifier: 0 },
      CHA: { score: 10, modifier: 0 },
    },
  }),
  useDerivedStats: () => ({ initiative: { total: 0 } }),
}));

vi.mock("../../../store/levelUpStore", () => ({
  useLevelUpStore: (
    selector: (state: { beginLevelUp: typeof mocks.beginLevelUp }) => unknown,
  ) => selector({ beginLevelUp: mocks.beginLevelUp }),
}));

interface MockRuleSnapshot {
  equipmentById?: Record<string, EquipmentDefinition>;
}

interface MockStoreState {
  id: string;
  campaignId: string | null;
  level: number;
  classLevels: Record<string, number>;
  currentHp: number;
  maxHp: number;
  inventory: InventoryInstance[];
  ruleSnapshot: MockRuleSnapshot | null;
  itemActions: ItemActionGrant[];
  inventoryError: string | null;
  applyHealthDelta: typeof mocks.applyHealthDelta;
  equipItem: typeof mocks.equipItem;
  toggleAttunement: typeof mocks.toggleAttunement;
  consumeItem: typeof mocks.consumeItem;
  setInventoryError: typeof mocks.setInventoryError;
  useItemAction: typeof mocks.useItemAction;
}

const baseStoreState: MockStoreState = {
  id: "char_1",
  campaignId: "campaign_1",
  level: 1,
  classLevels: { class_fighter: 1 },
  currentHp: 10,
  maxHp: 10,
  inventory: [],
  ruleSnapshot: null,
  itemActions: [],
  inventoryError: null,
  applyHealthDelta: mocks.applyHealthDelta,
  equipItem: mocks.equipItem,
  toggleAttunement: mocks.toggleAttunement,
  consumeItem: mocks.consumeItem,
  setInventoryError: mocks.setInventoryError,
  useItemAction: mocks.useItemAction,
};

let storeState: MockStoreState = baseStoreState;

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector?: (state: MockStoreState) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

const rationsDefinition: EquipmentDefinition = {
  id: "item_rations",
  name: "Rations",
  type: "consumable",
  weight: 2,
  requiresAttunement: false,
  categoryTags: [],
};

const throwAcidAction: ActionGrant = {
  id: "action_acid_vial_throw",
  name: "Throw Acid",
  activation: "action",
  effect: { type: "no_effect" },
};

const renderDashboard = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<DashboardLayout />);
  });

  return { container, root };
};

const findButton = (container: HTMLElement, label: string) =>
  Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );

describe("DashboardLayout inventory actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an item action intent instead of a bare consume", async () => {
    storeState = {
      ...baseStoreState,
      inventory: [
        {
          id: "inv-vial",
          itemId: "item_acid_vial",
          quantity: 2,
          slot: "backpack",
          isAttuned: false,
        },
      ],
      itemActions: [
        {
          instanceId: "inv-vial",
          itemId: "item_acid_vial",
          action: throwAcidAction,
        },
      ],
    };

    const { container, root } = await renderDashboard();

    const button = findButton(container, "Throw Acid");
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.useItemAction).toHaveBeenCalledWith(
      "inv-vial",
      "action_acid_vial_throw",
    );
    expect(mocks.consumeItem).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });

  it("still offers a plain consume for an item with no action", async () => {
    storeState = {
      ...baseStoreState,
      inventory: [
        {
          id: "inv-ration",
          itemId: "item_rations",
          quantity: 3,
          slot: "backpack",
          isAttuned: false,
        },
      ],
      ruleSnapshot: { equipmentById: { item_rations: rationsDefinition } },
      itemActions: [],
    };

    const { container, root } = await renderDashboard();

    const button = findButton(container, "Use 1");
    expect(button).toBeDefined();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.consumeItem).toHaveBeenCalledWith("inv-ration", 1);
    expect(mocks.useItemAction).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
