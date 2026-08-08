// apps/web/src/components/sheet/modals/RestModal.tsx
import { useState, useMemo } from "react";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import {
  getResourceMaxUses,
  resolveResourceRule,
  RestEngine,
} from "@project/engine";
import { useRollStore } from "../../../store/rollStore";
import { useAbilities } from "../../../hooks/useCharacterStats";

interface RestModalProps {
  onClose: () => void;
}

export const RestModal = ({ onClose }: RestModalProps) => {
  const [restType, setRestType] = useState<"short" | "long">("short");

  const resources = useCharacterSheetStore((state) => state.resources);
  const level = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const currentHp = useCharacterSheetStore((state) => state.currentHp);
  const maxHp = useCharacterSheetStore((state) => state.maxHp);
  const triggerRest = useCharacterSheetStore((state) => state.triggerRest);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);

  const requestRoll = useRollStore((state) => state.requestRoll);
  const applyHealthDelta = useCharacterSheetStore(
    (state) => state.applyHealthDelta,
  );
  const consumeResource = useCharacterSheetStore(
    (state) => state.consumeResource,
  );
  const { finalAbilities } = useAbilities();
  const conMod = finalAbilities.CON.modifier;

  const hitDiceResources = resources.filter((r) => r.id.startsWith("hd_"));

  const handleSpendHitDie = async (resourceId: string, sides: number) => {
    try {
      const expression = `1d${sides} ${conMod >= 0 ? "+" : "0"} ${Math.abs(conMod)}`;

      // execution halts here until user interacts with global RollInterceptor
      const totalHeal = await requestRoll(
        expression,
        "Short Rest: Hit Die Recovery",
      );

      consumeResource(resourceId, 1);
      applyHealthDelta(totalHeal, "Hit Die");
    } catch (err) {
      // fails safely if user clicks cancel exec on interceptor
      console.log("Roll cancelled:", err);
    }
  };

  // 1. Generate the Predictive State
  const recoveryPreview = useMemo(() => {
    const futureResources = RestEngine.applyRest(
      resources,
      restType,
      level,
      classLevels,
      ruleSnapshot ?? undefined,
    );

    // Compare future state to current state to find what actually changes
    const recoveredItems = futureResources
      .map((future, idx) => {
        const current = resources[idx];
        if (!current || future.current <= current.current) {
          return null;
        }

        const definition = resolveResourceRule(
          future.id,
          ruleSnapshot ?? undefined,
        );
        const maxUses = definition
          ? getResourceMaxUses(definition, level, classLevels)
          : future.current;

        return {
          id: future.id,
          name: definition?.name ?? future.id,
          recoveredAmount: future.current - current.current,
          newTotal: future.current,
          max: maxUses,
        };
      })
      .filter((item) => item !== null);

    return recoveredItems;
  }, [resources, restType, level, classLevels, ruleSnapshot]);

  // 2. Handle the Commit
  const handleConfirm = () => {
    triggerRest(restType);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 font-mono">
      <div className="w-full max-w-md rounded-2xl border border-gray-900 bg-white p-6 shadow-2xl">
        <div className="mb-4 border-b border-gray-200 pb-3">
          <h2 className="text-2xl font-bold uppercase text-gray-900">
            Camp & Recover
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Choose how much recovery to attempt before returning to the
            adventure.
          </p>
        </div>

        {/* Rest Type Selector */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setRestType("short")}
            className={`flex-1 py-2 font-bold border-2 ${restType === "short" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}
          >
            Short Rest (1 Hour)
          </button>
          <button
            onClick={() => setRestType("long")}
            className={`flex-1 py-2 font-bold border-2 ${restType === "long" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:border-gray-500"}`}
          >
            Long Rest (8 Hours)
          </button>
        </div>

        {/* Hit Dice Interface (Only visible on Short Rest) */}
        {restType === "short" && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-red-900">
              Spend Hit Dice
            </h3>
            <p className="mb-3 text-xs text-gray-600">
              Manually apply healing to your HP pool before completing this
              rest.
            </p>
            <div className="flex flex-col gap-2">
              {hitDiceResources.length === 0 ? (
                <div className="rounded border border-dashed border-red-200 bg-white/70 p-3 text-sm text-gray-600">
                  No hit dice are currently available for this rest.
                </div>
              ) : (
                hitDiceResources.map((hd) => {
                  // parse dice size from id (e.g, 'hd_d10' -> 10)
                  const sides = parseInt(hd.id.split("_d")[1], 10);
                  const isEmpty = hd.current <= 0;
                  const definition = resolveResourceRule(
                    hd.id,
                    ruleSnapshot ?? undefined,
                  );
                  const maxUses = definition
                    ? getResourceMaxUses(definition, level, classLevels)
                    : hd.current;

                  return (
                    <div
                      key={hd.id}
                      className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white p-2 shadow-sm"
                    >
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                          Hit Dice
                        </div>
                        <div className="font-mono text-sm text-gray-600">
                          Available {hd.current} / {maxUses}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSpendHitDie(hd.id, sides)}
                        disabled={isEmpty}
                        className={`rounded px-3 py-1 text-xs font-bold uppercase ${isEmpty ? "cursor-not-allowed bg-gray-200 text-gray-400" : "bg-red-600 text-white hover:bg-red-700"}`}
                      >
                        Spend & Roll
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Predictive Recovery Preview */}
        <div className="mb-6 h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-4">
          <h3 className="font-bold text-gray-900 uppercase text-sm mb-3">
            Recovery Manifest
          </h3>

          {restType === "long" && currentHp < maxHp && (
            <div className="flex justify-between items-center py-1 border-b border-gray-200 text-green-700 font-bold">
              <span>Hit Points</span>
              <span>Fully Restored</span>
            </div>
          )}

          {recoveryPreview.length === 0 &&
          (currentHp === maxHp || restType === "short") ? (
            <div className="text-gray-500 italic text-sm mt-4 text-center">
              No resources will be recovered during this rest.
            </div>
          ) : (
            <ul className="text-sm flex flex-col gap-2">
              {recoveryPreview.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between items-center border-b border-gray-100 py-1"
                >
                  <span className="font-bold text-gray-800">{item.name}</span>
                  <span className="text-green-600 font-bold">
                    +{item.recoveredAmount}{" "}
                    <span className="text-gray-400 text-xs font-normal">
                      (Total: {item.newTotal}/{item.max})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Execution Boundaries */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-gray-600 transition hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded bg-green-600 px-6 py-2 font-bold text-white shadow-sm transition hover:bg-green-700"
          >
            Confirm Rest
          </button>
        </div>
      </div>
    </div>
  );
};
