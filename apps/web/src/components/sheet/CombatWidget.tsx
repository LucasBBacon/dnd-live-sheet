/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type MouseEvent } from "react";
import { useCombat } from "../../hooks/useCombat";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

export const CombatWidget = () => {
  const { attacks } = useCombat();

  const consumeItem = useCharacterSheetStore((state) => state.consumeItem);
  const [tooltip, setTooltip] = useState<{
    title: string;
    lines: string[];
    top: number;
    left: number;
  } | null>(null);

  const showTooltip = (
    event: MouseEvent<HTMLDivElement>,
    title: string,
    lines: string[],
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 220;
    const left = Math.min(rect.left, window.innerWidth - width - 12);

    setTooltip({
      title,
      lines,
      top: rect.bottom + 8,
      left: Math.max(12, left),
    });
  };

  const handleAttack = (attack: any) => {
    if (attack.requiresAmmo) {
      if (attack.currentAmmo <= 0) return; // prevent negative ammo
      consumeItem(attack.ammoInventoryId, 1);
    }
    // TODO :DISPATCH DICE ROLL EVENT TO VTT LOG
    console.log(`Rolled attack with ${attack.name}`);
  };

  if (attacks.length === 0) {
    return (
      <div className="p-4 border border-dashed border-gray-400 text-center text-gray-500">
        No weapon equipped in active hand slots.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {attacks.map((attack, idx) => {
        const outOfAmmo = attack.requiresAmmo && attack.currentAmmo <= 0;

        return (
          <div
            key={idx}
            className={`flex border-2 shadow-sm ${outOfAmmo ? "border-red-300 opacity-75" : "border-gray-800"}`}
          >
            {/* Core Stats (To Hit / Damage) */}
            <div className="flex flex-col w-2/3">
              <div className="bg-gray-100 px-3 py-1 font-bold text-gray-900 border-b border-gray-300">
                {attack.name}{" "}
                <span className="text-xs font-normal text-gray-500">
                  ({attack.slot})
                </span>
              </div>
              <div className="flex p-2 gap-4">
                <div
                  className="cursor-help"
                  onMouseEnter={(event) =>
                    showTooltip(event, "Attack Roll", attack.breakdown.attack)
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  <span className="text-xs text-gray-500 block">ATK</span>
                  <span className="font-bold">+{attack.attackBonus}</span>
                </div>
                <div
                  className="cursor-help"
                  onMouseEnter={(event) =>
                    showTooltip(event, "Damage Roll", attack.breakdown.damage)
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  <span className="text-xs text-gray-500 block">DMG</span>
                  <span className="font-bold text-red-700">
                    {attack.damageExpression}
                  </span>
                </div>
              </div>
            </div>

            {/* Execution Boundary & Ammo Counter */}
            <div className="w-1/3 flex flex-col justify-center items-center bg-gray-50 border-l border-gray-300 p-2">
              {attack.requiresAmmo && (
                <div
                  className={`text-xs mb-2 font-mono ${outOfAmmo ? "text-red-600 font-bold" : "text-gray-600"}`}
                >
                  AMMO: {attack.currentAmmo}
                </div>
              )}

              <button
                onClick={() => handleAttack(attack)}
                disabled={outOfAmmo}
                className={`w-full py-2 font-bold rounded shadow-sm text-sm ${
                  outOfAmmo
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-red-700 hover:bg-red-800 text-white cursor-pointer"
                }`}
              >
                {outOfAmmo ? "EMPTY" : "STRIKE"}
              </button>
            </div>
          </div>
        );
      })}

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none flex max-w-[220px] flex-col rounded border border-gray-700 bg-gray-900 p-2 text-xs text-white shadow-xl"
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          <span className="font-bold mb-1 border-b border-gray-600">
            {tooltip.title}
          </span>
          {tooltip.lines.map((step, index) => (
            <span key={index}>{step}</span>
          ))}
        </div>
      )}
    </div>
  );
};
