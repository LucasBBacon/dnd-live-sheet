import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import type { CastableSpell, SlotPool } from "@project/engine";
import type { ActionGrant, InventoryInstance } from "@project/shared";
import { SpellsWidget } from "../SpellsWidget";

const mocks = vi.hoisted(() => ({
  spells: { current: [] as unknown[] },
  actions: { current: [] as unknown[] },
  slotPools: { current: [] as unknown[] },
  resources: { current: [] as unknown[] },
  inventory: { current: [] as unknown[] },
  concentratingOn: { current: null as string | null },
  lastActionOutcome: { current: null as unknown },
  castSpell: vi.fn(),
}));

vi.mock("../../../hooks/useSpells", () => ({
  useSpells: () => ({
    spells: mocks.spells.current,
    actions: mocks.actions.current,
    slotPools: mocks.slotPools.current,
  }),
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      resources: mocks.resources.current,
      inventory: mocks.inventory.current,
      ruleSnapshot: {
        equipmentById: {
          item_gear_component_pouch: {
            id: "item_gear_component_pouch",
            name: "Component Pouch",
            categoryTags: ["category_component_pouch"],
          },
        },
      },
      runtimeEffects: {
        getActiveEffects: () =>
          mocks.concentratingOn.current
            ? [{ sourceName: mocks.concentratingOn.current, isSelfConcentration: true }]
            : [],
      },
      castSpell: mocks.castSpell,
      lastActionOutcome: mocks.lastActionOutcome.current,
    }),
}));

const components = (material?: string) => ({
  verbal: true,
  somatic: true,
  material: material !== undefined,
  ...(material !== undefined && { materialDescription: material }),
  goldCost: 0,
  isConsumed: false,
});

const eldritchBlast: CastableSpell = {
  spellId: "spell_eldritch_blast",
  name: "Eldritch Blast",
  level: 0,
  school: "evocation",
  range: { kind: "feet", feet: 120 },
  components: components(),
  duration: { kind: "instantaneous" },
  activation: "action",
  source: { kind: "class", classId: "class_warlock", label: "Warlock" },
  ability: "CHA",
  attackBonus: 4,
  saveDc: 12,
  payment: { kind: "at_will" },
  preparationTracked: true,
  focusCategories: ["category_arcane_focus"],
  actionId: "action_spell_eldritch_blast@class_warlock",
};

const dancingLights: CastableSpell = {
  ...eldritchBlast,
  spellId: "spell_dancing_lights",
  name: "Dancing Lights",
  components: components("a bit of phosphorus or wychwood, or a glowworm"),
  duration: { kind: "timed", amount: 1, unit: "minute", concentration: true },
  source: { kind: "trait", traitId: "drow_magic", label: "Drow Magic" },
  focusCategories: [],
  actionId: "action_spell_dancing_lights@drow_magic",
};

const burningHands: CastableSpell = {
  ...eldritchBlast,
  spellId: "spell_burning_hands",
  name: "Burning Hands",
  level: 1,
  range: { kind: "self", area: { shape: "cone", size: 15 } },
  source: { kind: "class", classId: "class_cleric", label: "Cleric" },
  payment: { kind: "slot" },
  focusCategories: ["category_holy_symbol"],
  actionId: "action_spell_burning_hands@class_cleric",
};

const darkness: CastableSpell = {
  spellId: "spell_darkness",
  name: "Darkness",
  level: 0,
  school: "evocation",
  activation: "action",
  source: { kind: "trait", traitId: "drow_magic", label: "Drow Magic" },
  payment: { kind: "at_will" },
  preparationTracked: true,
  focusCategories: [],
};

const burningHandsAction: ActionGrant = {
  id: "action_spell_burning_hands@class_cleric",
  name: "Burning Hands",
  activation: "action",
  effect: {
    type: "save",
    savingThrow: {
      targetStat: "DEX",
      dcCalculation: { base: 8, scalingStat: "WIS", includeProficiency: true },
      saveEffect: "half_damage",
      dc: 13,
    },
    damage: [
      {
        sourceName: "Burning Hands",
        baseDice: "3d6",
        damageType: "fire",
        scalingMode: "none",
        levelScaling: [],
        perSlotAbove: "1d6",
      },
    ],
  },
};

const pouch: InventoryInstance = {
  id: "inv_pouch",
  itemId: "item_gear_component_pouch",
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
};

const render = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<SpellsWidget />);
  });
  return container;
};

const button = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll("button")).find((entry) =>
    entry.textContent?.startsWith(text),
  );

const click = async (element: Element | undefined) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("SpellsWidget", () => {
  beforeEach(() => {
    mocks.spells.current = [];
    mocks.actions.current = [];
    mocks.slotPools.current = [];
    mocks.resources.current = [];
    mocks.inventory.current = [];
    mocks.concentratingOn.current = null;
    mocks.lastActionOutcome.current = null;
    mocks.castSpell.mockReset();
  });

  it("renders nothing for a character with no spells", async () => {
    expect((await render()).textContent).toBe("");
  });

  it("groups spells by level, each with its source, price and details", async () => {
    mocks.spells.current = [eldritchBlast, burningHands];

    const text = (await render()).textContent;

    expect(text).toContain("Cantrips");
    expect(text).toContain("1st level");
    expect(text).toContain("Warlock · At will");
    expect(text).toContain("Cleric · Slot");
    expect(text).toContain("Self (15-foot cone)");
    expect(text).toContain("120 feet");
  });

  it("lists a stub as not yet automated, with no Cast button", async () => {
    mocks.spells.current = [darkness];

    const container = await render();

    expect(container.textContent).toContain("Not yet automated");
    expect(button(container, "Cast")).toBeUndefined();
  });

  it("notes that preparation is not tracked for a prepared caster's picks", async () => {
    mocks.spells.current = [{ ...burningHands, preparationTracked: false }];

    expect((await render()).textContent).toContain("Preparation isn't tracked");
  });

  it("casts an at-will spell with nothing to ask", async () => {
    mocks.spells.current = [eldritchBlast];
    const container = await render();

    await click(button(container, "Cast"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_eldritch_blast@class_warlock",
      {},
    );
  });

  it("offers only the slots that can pay, with the dice each one rolls", async () => {
    mocks.spells.current = [burningHands];
    mocks.actions.current = [burningHandsAction];
    mocks.slotPools.current = [
      { resourceId: "spell_slots_1", level: 1 },
      { resourceId: "spell_slots_2", level: 2 },
      { resourceId: "spell_slots_3", level: 3 },
    ] satisfies SlotPool[];
    mocks.resources.current = [
      { id: "spell_slots_1", current: 0 },
      { id: "spell_slots_2", current: 2 },
      { id: "spell_slots_3", current: 1 },
    ];
    const container = await render();

    await click(button(container, "Cast"));

    expect(button(container, "1st level")).toBeUndefined();
    expect(button(container, "2nd level")?.textContent).toBe("2nd level (2 left) · 4d6");
    expect(button(container, "3rd level")?.textContent).toBe("3rd level (1 left) · 5d6");

    await click(button(container, "2nd level"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_burning_hands@class_cleric",
      { slotResourceId: "spell_slots_2" },
    );
  });

  it("asks for a material nothing covers, and casts once the player confirms", async () => {
    mocks.spells.current = [dancingLights];
    const container = await render();

    await click(button(container, "Cast"));

    expect(container.textContent).toContain(
      "Needs a bit of phosphorus or wychwood, or a glowworm. Do you have it?",
    );
    expect(mocks.castSpell).not.toHaveBeenCalled();

    await click(button(container, "Cast anyway"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_dancing_lights@drow_magic",
      { materialsConfirmed: true },
    );
  });

  it("casts unasked when a component pouch covers the material", async () => {
    mocks.spells.current = [dancingLights];
    mocks.inventory.current = [pouch];
    const container = await render();

    await click(button(container, "Cast"));

    expect(mocks.castSpell).toHaveBeenCalledWith(
      "action_spell_dancing_lights@drow_magic",
      {},
    );
  });

  it("says why a cast was refused, under the spell it refused", async () => {
    mocks.spells.current = [burningHands];
    mocks.lastActionOutcome.current = {
      actionId: "action_spell_burning_hands@class_cleric",
      executed: false,
      reason: "slot_empty",
    };

    expect((await render()).textContent).toContain("No slots of that level left.");
  });

  it("warns that casting a concentration spell ends the current one", async () => {
    mocks.spells.current = [dancingLights];
    mocks.concentratingOn.current = "Faerie Fire";

    expect((await render()).textContent).toContain("Casting this ends Faerie Fire.");
  });
});
