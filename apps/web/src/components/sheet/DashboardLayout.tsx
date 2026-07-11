import { useMemo, useState } from "react";
import { useAbilities, useDerivedStats } from "../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { useLevelUpStore } from "../../store/levelUpStore";
import { CombatWidget } from "./CombatWidget";
import { RestModal } from "./modals/RestModal";
import { LevelUpWizard } from "../wizard/LevelUpWizard";

export const DashboardLayout = () => {
  const character = useCharacterSheetStore();
  const applyHealthDelta = useCharacterSheetStore(
    (state) => state.applyHealthDelta,
  );
  const equipItem = useCharacterSheetStore((state) => state.equipItem);
  const consumeItem = useCharacterSheetStore((state) => state.consumeItem);
  const inventoryError = useCharacterSheetStore((state) => state.inventoryError);
  const setInventoryError = useCharacterSheetStore(
    (state) => state.setInventoryError,
  );
  const beginLevelUp = useLevelUpStore((state) => state.beginLevelUp);

  const { armorClass, skills, initiative } = useDerivedStats();
  const { finalAbilities } = useAbilities();

  const activeClassId = useMemo(() => {
    const classEntries = Object.entries(character.classLevels);

    if (classEntries.length === 0) {
      return null;
    }

    return (
      classEntries.sort(
        ([, leftLevel], [, rightLevel]) => rightLevel - leftLevel,
      )[0]?.[0] ?? null
    );
  }, [character.classLevels]);

  const [hpInput, setHpInput] = useState(1);
  const [isRestModalOpen, setIsRestModalOpen] = useState(false);

  const inferItemTypeFromId = (
    itemId: string,
  ): "armor" | "weapon" | "consumable" | "gear" => {
    if (itemId.startsWith("item_weapon_")) return "weapon";
    if (itemId.startsWith("item_armor_")) return "armor";
    return "gear";
  };

  const getAllowedSlots = (itemId: string, itemType: string): string[] => {
    if (itemType === "weapon") {
      return ["backpack", "main_hand", "off_hand"];
    }

    if (itemType === "armor") {
      if (itemId === "item_armor_shield") {
        return ["backpack", "off_hand"];
      }
      return ["backpack", "armor"];
    }

    return ["backpack"];
  };

  const getSlotLabel = (slot: string): string => {
    switch (slot) {
      case "main_hand":
        return "Main Hand";
      case "off_hand":
        return "Off Hand";
      case "armor":
        return "Armor";
      case "backpack":
        return "Backpack";
      default:
        return slot;
    }
  };

  const inventoryRows = useMemo(() => {
    const itemsById = character.ruleSnapshot?.itemsById ?? {};

    return character.inventory.map((item) => {
      const itemMeta = itemsById[item.itemId];
      const type = itemMeta?.type ?? inferItemTypeFromId(item.itemId);
      const allowedSlots = getAllowedSlots(item.itemId, type);
      return {
        ...item,
        itemName: itemMeta?.name ?? item.itemId,
        itemType: type,
        allowedSlots,
      };
    });
  }, [character.inventory, character.ruleSnapshot]);

  const equippedItems = useMemo(
    () => inventoryRows.filter((item) => item.slot !== "backpack"),
    [inventoryRows],
  );

  const backpackItems = useMemo(
    () => inventoryRows.filter((item) => item.slot === "backpack"),
    [inventoryRows],
  );

  return (
    <div className="h-screen w-full bg-gray-100 p-4 font-mono text-sm overflow-hidden flex flex-col">
      {/* HEADER */}
      <header className="bg-gray-900 text-white p-3 mb-4 flex justify-between items-center rounded">
        <h1 className="text-xl font-bold uppercase">
          {character.id ? "Live Session Active" : "Loading..."}
        </h1>
        <div className="flex items-center gap-3">
          <span>Lvl {character.level}</span>

          <button
            onClick={() => {
              if (!character.id || !activeClassId) {
                return;
              }

              const currentLevelInActiveClass =
                character.classLevels[activeClassId] ?? 0;

              void beginLevelUp(
                character.id,
                activeClassId,
                currentLevelInActiveClass,
                character.level + 1,
                { campaignId: character.campaignId },
              );
            }}
            disabled={!character.id || !activeClassId}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1 rounded font-bold uppercase shadow"
          >
            Level Up
          </button>

          {/* GLOBAL ACTION */}
          <button
            onClick={() => setIsRestModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded font-bold uppercase shadow"
          >
            Camp / Rest
          </button>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="flex-grow grid grid-cols-12 gap-4 overflow-hidden">
        {/* HUD */}
        <section className="col-span-3 bg-white border-2 border-gray-300 p-4 rounded overflow-y-auto">
          <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-4 uppercase">
            Vitals
          </h2>

          {/* socket action test area */}
          <div className="bg-red-50 border border-red-200 p-3 mb-4 rounded text-center">
            <div className="text-gray-500 text-xs uppercase">Hit Points</div>
            <div className="text-3xl font-bold text-red-700 my-2">
              {character.currentHp}/{character.maxHp}
            </div>

            <div className="flex gap-2 justify-center mt-2">
              <input
                type="number"
                value={hpInput}
                onChange={(e) => setHpInput(Number(e.target.value))}
                className="w-16 border px-1 text-center"
              />
              <button
                onClick={() => applyHealthDelta(-hpInput, "Manual Damage")}
                className="bg-red-600 text-white px-3 py-1 font-bold rounded hover:bg-red-700"
              >
                DMG
              </button>
              <button
                onClick={() => applyHealthDelta(hpInput, "Manual Healing")}
                className="bg-green-600 text-white px-3 py-1 font-bold rounded hover:bg-green-700"
              >
                HEAL
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center bg-gray-50 border p-3 rounded">
            <span className="font-bold">Armor Class</span>
            <span className="text-2xl font-bold">{armorClass.total}</span>
          </div>

          <div className="flex justify-between items-center bg-gray-50 border p-3 rounded mt-2">
            <span className="font-bold">Initiative</span>
            <span className="text-xl">
              {initiative.total >= 0 ? "+" : ""}
              {initiative.total}
            </span>
          </div>
        </section>

        {/* ACTION ECONOMY */}
        <section className="col-span-6 bg-white border-2 border-gray-300 p-4 rounded overflow-y-auto">
          <CombatWidget />
        </section>

        {/* ENGINE */}
        <section className="col-span-3 flex flex-col gap-4 overflow-hidden">
          <div className="bg-white border-2 border-gray-300 p-4 rounded">
            <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-2 uppercase">
              Attributes
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {(
                Object.keys(finalAbilities) as Array<
                  keyof typeof finalAbilities
                >
              ).map((stat) => (
                <div
                  key={stat}
                  className="bg-gray-50 border p-2 text-center rounded flex flex-col"
                >
                  <span className="text-xs uppercase font-bold text-gray-500">
                    {stat}
                  </span>
                  <span className="font-bold text-lg">
                    {finalAbilities[stat].modifier >= 0 ? "+" : ""}
                    {finalAbilities[stat].modifier}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({finalAbilities[stat].score})
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border-2 border-gray-300 p-4 rounded flex-grow overflow-y-auto">
            <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-2 uppercase">
              Skills
            </h2>
            <ul className="text-xs flex-col gap-1">
              {skills.map((skill) => (
                <li
                  key={skill.id}
                  className="flex justify-between border-b border-gray-100 py-1"
                >
                  <span
                    className={
                      skill.isProficient ? "font-bold" : "text-gray-600"
                    }
                  >
                    {skill.name}
                  </span>
                  <span>
                    {skill.totalModifier >= 0 ? "+" : ""}
                    {skill.totalModifier}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* CARGO HOLD */}
      <section className="mt-4 bg-white border-2 border-gray-300 p-4 rounded h-56 overflow-y-auto">
        <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-4 uppercase">
          Inventory Manager (DEV MODE)
        </h2>

        {inventoryError && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded p-2 flex items-center justify-between gap-3">
            <span className="text-xs text-red-700">{inventoryError}</span>
            <button
              onClick={() => setInventoryError(null)}
              className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-100"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
              Equipped
            </h3>
            <div className="space-y-2">
              {equippedItems.length === 0 && (
                <div className="text-xs text-gray-500 border border-dashed border-gray-300 rounded p-2">
                  No equipped items.
                </div>
              )}
              {equippedItems.map((item) => (
                <div
                  key={item.id}
                  className="border p-2 rounded flex justify-between items-center bg-gray-50 gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{item.itemName}</div>
                    <div className="text-xs text-gray-500">
                      {item.itemType.toUpperCase()} | Qty: {item.quantity} | Slot: {getSlotLabel(item.slot)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={item.slot}
                      onChange={(e) => equipItem(item.id, e.target.value)}
                      className="border text-xs p-1 rounded cursor-pointer"
                    >
                      {item.allowedSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {getSlotLabel(slot)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => equipItem(item.id, "backpack")}
                      className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-100"
                    >
                      Stow
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase text-gray-600 mb-2">
              Backpack
            </h3>
            <div className="space-y-2">
              {backpackItems.length === 0 && (
                <div className="text-xs text-gray-500 border border-dashed border-gray-300 rounded p-2">
                  Backpack is empty.
                </div>
              )}
              {backpackItems.map((item) => (
                <div
                  key={item.id}
                  className="border p-2 rounded flex justify-between items-center bg-gray-50 gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{item.itemName}</div>
                    <div className="text-xs text-gray-500">
                      {item.itemType.toUpperCase()} | Qty: {item.quantity}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={item.slot}
                      onChange={(e) => equipItem(item.id, e.target.value)}
                      className="border text-xs p-1 rounded cursor-pointer"
                    >
                      {item.allowedSlots.map((slot) => (
                        <option key={slot} value={slot}>
                          {getSlotLabel(slot)}
                        </option>
                      ))}
                    </select>
                    {item.itemType === "consumable" && (
                      <button
                        onClick={() => consumeItem(item.id, 1)}
                        className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-100"
                      >
                        Use 1
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {isRestModalOpen && (
        <RestModal onClose={() => setIsRestModalOpen(false)} />
      )}

      <LevelUpWizard />
    </div>
  );
};
