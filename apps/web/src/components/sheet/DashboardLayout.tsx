import { useState } from "react";
import { useAbilities, useDerivedStats } from "../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { CombatWidget } from "./CombatWidget";

export const DashboardLayout = () => {
  const character = useCharacterSheetStore();
  const applyHealthDelta = useCharacterSheetStore(
    (state) => state.applyHealthDelta,
  );
  const equipItem = useCharacterSheetStore((state) => state.equipItem);

  const { armorClass, skills, initiative } = useDerivedStats();
  const { finalAbilities } = useAbilities();

  const [hpInput, setHpInput] = useState(1);

  return (
    <div className="h-screen w-full bg-gray-100 p-4 font-mono text-sm overflow-hidden flex flex-col">
      {/* HEADER */}
      <header className="bg-gray-900 text-white p-3 mb-4 flex justify-between items-center rounded">
        <h1 className="text-xl font-bold uppercase">
          {character.id ? "Live Session Active" : "Loading..."}
        </h1>
        <span>Lvl {character.level}</span>
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
              {initiative >= 0 ? "+" : ""}
              {initiative}
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
      <section className="mt-4 bg-white border-2 border-gray-300 p-4 rounded h-48 overflow-y-auto">
        <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-4 uppercase">
          Inventory Manager (DEV MODE)
        </h2>
        <div className="grid grid-cols-3 gap-4">
          {character.inventory.map((item) => (
            <div
              key={item.id}
              className="border p-2 rounded flex justify-between items-center bg-gray-50"
            >
              <div>
                <div className="font-bold text-sm">{item.itemId}</div>
                <div className="text-xs text-gray-500">
                  Qty: {item.quantity} | Slot: {item.slot}
                </div>
              </div>
              <select
                value={item.slot}
                onChange={(e) => equipItem(item.id, e.target.value)}
                className="border text-xs p-1 rounded cursor-pointer"
              >
                <option value="backpack">Backpack</option>
                <option value="main_hand">Main Hand</option>
                <option value="off_hand">Off Hand</option>
                <option value="armor">Armor</option>
              </select>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
