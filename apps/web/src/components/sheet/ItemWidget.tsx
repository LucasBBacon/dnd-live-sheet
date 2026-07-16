/* eslint-disable @typescript-eslint/no-explicit-any */
import { EQUIPMENT_DICTIONARY } from "@project/engine";
import { useMemo } from "react";

interface WeaponData {
  category: string;
  damageDice: string;
  damageType: string;
  properties: string[];
  ammoItemId?: string;
}

interface Modifier {
  target: string;
  type: string;
  value: number;
  scalingFactor?: number;
}

interface StaticItemView {
  id: string;
  name: string;
  type: "armor" | "weapon" | "consumable" | "gear";
  modifiersCount: number;
  modifiers?: Modifier[];
  weapon?: WeaponData;
}

const ModifierList = ({ modifiers }: { modifiers: Modifier[] }) => (
  <div className="mt-3 space-y-1 text-sm bg-black/30 p-2 rounded">
    <h4 className="font-semibold text-gray-400 text-xs uppercase tracking-wider mb-2">
      Modifiers
    </h4>
    <ul className="space-y-1">
      {modifiers.map((mod, index) => (
        // Using index as a fallback key since modifiers might lack unique IDs
        <li key={index} className="flex justify-between border-b border-gray-700/50 pb-1 last:border-0">
          <span className="text-gray-300">
            <span className="text-blue-400 font-medium">{mod.target}</span> ({mod.type})
          </span>
          <div className="text-right">
            <span className="font-mono text-green-400">{mod.value}</span>
            {mod.scalingFactor && (
              <span className="text-xs text-gray-500 ml-2">Scale: {mod.scalingFactor}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  </div>
);

const WeaponDetails = ({ weapon }: { weapon: WeaponData }) => (
  <div className="mt-3 p-3 bg-gray-800 rounded border border-gray-700 text-sm">
    <h4 className="font-semibold text-gray-400 text-xs uppercase tracking-wider mb-2">
      Weapon Stats
    </h4>
    <div className="grid grid-cols-2 gap-2 text-gray-300 mb-2">
      <div>
        <span className="text-gray-500 block text-xs">Category</span>{" "}
        {weapon.category}
      </div>
      <div>
        <span className="text-gray-500 block text-xs">Damage</span>{" "}
        {weapon.damageDice} {weapon.damageType}
      </div>
    </div>

    {weapon.properties.length > 0 && (
      <div className="mt-2">
        <span className="text-gray-500 text-xs block mb-1">Properties</span>
        <div className="flex flex-wrap gap-1">
          {weapon.properties.map((prop, index) => (
            <span
              key={index}
              className="px-2 py-0.5 bg-gray-900 rounded text-xs text-gray-300 border border-gray-700"
            >
              {prop}
            </span>
          ))}
        </div>
      </div>
    )}

    {weapon.ammoItemId && (
      <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-orange-400 flex items-center gap-1">
        <span>Requires Ammo:</span>{" "}
        <span className="font-mono">{weapon.ammoItemId}</span>
      </div>
    )}
  </div>
);

const ItemCard = ({ item }: { item: StaticItemView }) => {
  const typeStyles: Record<StaticItemView["type"], string> = {
    armor: "bg-blue-900/20 border-blue-500/50 text-blue-300",
    weapon: "bg-red-900/20 border-red-500/50 text-red-300",
    consumable: "bg-green-900/20 border-green-500/50 text-green-300",
    gear: "bg-yellow-900/20 border-yellow-500/50 text-yellow-300",
  };

  const badgeStyle =
    typeStyles[item.type] || "bg-gray-800 border-gray-500 tet-gray-300";

  return (
    <div>
      <div className="flex justify-between items-start mb-1">
        <h3 className="font-bold text-lg text-white truncate pr-2">
          {item.name}
        </h3>
        <span
          className={`px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full border ${badgeStyle}`}
        >
          {item.type}
        </span>
      </div>

      <div className="text-xs text-gray-500 font-mono mb-4 flex justify-between">
        <span>ID: {item.id}</span>
        {item.modifiersCount > 0 && <span>Mods: {item.modifiersCount}</span>}
      </div>

      <div className="flex-grow">
        {item.modifiers && item.modifiers.length > 0 && (
          <ModifierList modifiers={item.modifiers} />
        )}
        {item.weapon && <WeaponDetails weapon={item.weapon} />}
      </div>
    </div>
  );
};

export const ItemWidget = () => {
  const allStaticItems = useMemo<StaticItemView[]>(() => {
    return Object.values(EQUIPMENT_DICTIONARY).map((item: any) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      modifiersCount: item.modifiers?.length ?? 0,
      modifiers: item.modifiers,
      weapon: item.weapon,
    }));
  }, []);

  return (
    <div className="p-8 bg-black min-h-screen font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 border-b border-gray-800 pb-4">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            Equipment Dictionary Debugger
            <span className="text-sm font-normal px-3 py-1 bg-gray-800 rounded-full text-gray-400">
              {allStaticItems.length} items loaded
            </span>
          </h2>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {allStaticItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
};
