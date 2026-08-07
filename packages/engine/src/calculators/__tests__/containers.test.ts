import { describe, expect, it } from "vitest";
import type { InventoryInstance } from "@project/shared";
import { ContainerEngine } from "../containers.js";
import { poundsToHundredths } from "../weight.js";

const row = (
  overrides: Partial<InventoryInstance> & Pick<InventoryInstance, "id" | "itemId">,
): InventoryInstance => ({
  quantity: 1,
  slot: "backpack",
  isAttuned: false,
  ...overrides,
});

/** A backpack holds 30 lb; plate armour weighs 65; a dagger weighs 1. */
const backpack = () => row({ id: "inv_pack", itemId: "item_backpack" });

describe("ContainerEngine.report", () => {
  it("reports nothing for an empty inventory", () => {
    expect(ContainerEngine.report([])).toEqual({
      containers: [],
      unplacedInstanceIds: [],
    });
  });

  it("reports an empty container at its authored capacity", () => {
    const report = ContainerEngine.report([backpack()]);

    expect(report.containers).toHaveLength(1);
    expect(report.containers[0]).toEqual({
      instanceId: "inv_pack",
      itemId: "item_backpack",
      name: "Backpack",
      capacityHundredths: poundsToHundredths(30),
      carriedHundredths: 0,
      isOverloaded: false,
    });
  });

  it("does not count a container's own weight against itself", () => {
    // the backpack's 5 lb is what the character carries, not what the backpack
    // holds. counting it would make every container start 5 lb down
    const report = ContainerEngine.report([backpack()]);

    expect(report.containers[0]!.carriedHundredths).toBe(0);
  });

  it("counts what is inside it", () => {
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_dagger", itemId: "item_weapon_dagger", containerId: "inv_pack" }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(poundsToHundredths(1));
    expect(report.containers[0]!.isOverloaded).toBe(false);
  });

  it("scales by the quantity in the stack", () => {
    const report = ContainerEngine.report([
      backpack(),
      row({
        id: "inv_arrows",
        itemId: "item_ammo_arrow",
        quantity: 20,
        containerId: "inv_pack",
      }),
    ]);

    // 20 arrows at 0.05 lb, asserted in hundredths so a float implementation
    // cannot launder its own error away
    expect(report.containers[0]!.carriedHundredths).toBe(100);
  });

  it("flags a container carrying more than it holds", () => {
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_plate", itemId: "item_armor_plate", containerId: "inv_pack" }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(poundsToHundredths(65));
    expect(report.containers[0]!.isOverloaded).toBe(true);
  });

  it("treats exactly full as not overloaded", () => {
    // the rule is "holds 30 pounds of gear", so 30 lb on the nose fits. without
    // this a >= regression passes every other test in this file
    const report = ContainerEngine.report([
      backpack(),
      row({
        id: "inv_daggers",
        itemId: "item_weapon_dagger",
        quantity: 30,
        containerId: "inv_pack",
      }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(poundsToHundredths(30));
    expect(report.containers[0]!.isOverloaded).toBe(false);
  });

  it("counts a nested container's own weight but not its contents", () => {
    // a deliberate one-level rule: summing the subtree is more correct and
    // needs cycle detection, and no 5e rule turns on the difference
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_pouch", itemId: "item_pouch", containerId: "inv_pack" }),
      row({
        id: "inv_dagger",
        itemId: "item_weapon_dagger",
        containerId: "inv_pouch",
      }),
    ]);

    const outer = report.containers.find((c) => c.instanceId === "inv_pack")!;
    const inner = report.containers.find((c) => c.instanceId === "inv_pouch")!;

    expect(outer.carriedHundredths).toBe(poundsToHundredths(1)); // the pouch
    expect(inner.carriedHundredths).toBe(poundsToHundredths(1)); // the dagger
  });

  it("reports a row pointing at a container that is not carried", () => {
    const report = ContainerEngine.report([
      row({ id: "inv_dagger", itemId: "item_weapon_dagger", containerId: "inv_gone" }),
    ]);

    expect(report.containers).toEqual([]);
    expect(report.unplacedInstanceIds).toEqual(["inv_dagger"]);
  });

  it("reports a row pointing at something that is not a container", () => {
    const report = ContainerEngine.report([
      row({ id: "inv_sword", itemId: "item_weapon_longsword" }),
      row({ id: "inv_dagger", itemId: "item_weapon_dagger", containerId: "inv_sword" }),
    ]);

    expect(report.unplacedInstanceIds).toEqual(["inv_dagger"]);
  });

  it("reports a row that claims to be inside itself", () => {
    const report = ContainerEngine.report([
      row({ id: "inv_pack", itemId: "item_backpack", containerId: "inv_pack" }),
    ]);

    // the container is still reported, it just holds nothing - a self-reference
    // is bad data, not a reason to drop the row
    expect(report.containers[0]!.carriedHundredths).toBe(0);
    expect(report.unplacedInstanceIds).toEqual(["inv_pack"]);
  });

  it("ignores an item with no rule behind it", () => {
    // a save outlives the homebrew pack that authored its contents
    const report = ContainerEngine.report([
      backpack(),
      row({ id: "inv_ghost", itemId: "item_homebrew_gone", containerId: "inv_pack" }),
    ]);

    expect(report.containers[0]!.carriedHundredths).toBe(0);
    expect(report.unplacedInstanceIds).toEqual([]);
  });
});
