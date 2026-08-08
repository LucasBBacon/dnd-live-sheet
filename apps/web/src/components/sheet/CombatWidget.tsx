/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type MouseEvent } from "react";
import type { CombatRollPayload } from "@project/shared";
import { useCombat } from "../../hooks/useCombat";
import { socketService } from "../../services/socketService";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

export const CombatWidget = () => {
  const { attacks } = useCombat();

  const characterId = useCharacterSheetStore((state) => state.id ?? "");
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

    const payload: CombatRollPayload = {
      characterId,
      attackName: attack.name,
      attackBonus: attack.attackBonus,
      damageExpression: attack.damageExpression,
      slot: attack.slot,
      requiresAmmo: Boolean(attack.requiresAmmo),
      timestamp: Date.now(),
    };

    socketService.emitCombatRoll(payload);
  };

  if (attacks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-400 bg-gray-50 p-5 text-center text-sm text-gray-600">
        <p className="font-semibold text-gray-700">No active weapon ready</p>
        <p className="mt-1">
          Equip a weapon in your active hand slots to make attacks available.
        </p>
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
            className={`flex overflow-hidden rounded-xl border shadow-sm ${outOfAmmo ? "border-red-200 bg-red-50/70" : "border-gray-300 bg-white"}`}
          >
            <div className="flex flex-1 flex-col">
              <div
                className={`flex items-center justify-between border-b px-3 py-2 ${outOfAmmo ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">
                    {attack.name}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    {attack.slot}
                  </div>
                </div>
                <div
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${outOfAmmo ? "bg-red-100 text-red-700" : "bg-gray-900 text-white"}`}
                >
                  {outOfAmmo ? "Needs ammo" : "Ready"}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 p-3">
                <div
                  className="cursor-help"
                  onMouseEnter={(event) =>
                    showTooltip(event, "Attack Roll", attack.breakdown.attack)
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  <span className="block text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    ATK
                  </span>
                  <span className="font-bold text-gray-900">
                    +{attack.attackBonus}
                  </span>
                </div>
                <div
                  className="cursor-help"
                  onMouseEnter={(event) =>
                    showTooltip(event, "Damage Roll", attack.breakdown.damage)
                  }
                  onMouseLeave={() => setTooltip(null)}
                >
                  <span className="block text-[11px] uppercase tracking-[0.2em] text-gray-500">
                    DMG
                  </span>
                  <span className="font-bold text-red-700">
                    {attack.damageExpression}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex min-w-[110px] flex-col items-center justify-center border-l border-gray-200 bg-gray-50 p-3">
              {attack.requiresAmmo && (
                <div
                  className={`mb-2 text-xs font-mono ${outOfAmmo ? "font-bold text-red-600" : "text-gray-600"}`}
                >
                  AMMO: {attack.currentAmmo}
                </div>
              )}

              <button
                onClick={() => handleAttack(attack)}
                disabled={outOfAmmo}
                className={`w-full rounded px-3 py-2 text-sm font-bold shadow-sm ${
                  outOfAmmo
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "cursor-pointer bg-red-700 text-white hover:bg-red-800"
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
