// apps/web/src/components/sheet/modals/RestModal.tsx
import { useState, useMemo } from "react";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { RestEngine } from "@project/engine";

interface RestModalProps {
  onClose: () => void;
}

export const RestModal = ({ onClose }: RestModalProps) => {
  const [restType, setRestType] = useState<"short" | "long">("short");

  const resources = useCharacterSheetStore((state) => state.resources);
  const currentHp = useCharacterSheetStore((state) => state.currentHp);
  const maxHp = useCharacterSheetStore((state) => state.maxHp);
  const triggerRest = useCharacterSheetStore((state) => state.triggerRest);

  // 1. Generate the Predictive State
  const recoveryPreview = useMemo(() => {
    const futureResources = RestEngine.applyRest(resources, restType);

    // Compare future state to current state to find what actually changes
    const recoveredItems = futureResources
      .filter((future, idx) => future.current > resources[idx].current)
      .map((future, idx) => ({
        name: future.name,
        recoveredAmount: future.current - resources[idx].current,
        newTotal: future.current,
      }));

    return recoveredItems;
  }, [resources, restType]);

  // 2. Handle the Commit
  const handleConfirm = () => {
    triggerRest(restType);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 font-mono">
      <div className="bg-white border-2 border-gray-900 rounded p-6 max-w-md w-full shadow-2xl">
        <h2 className="text-2xl font-bold uppercase border-b-2 border-gray-900 pb-2 mb-4">
          Camp & Recover
        </h2>

        {/* Rest Type Selector */}
        <div className="flex gap-2 mb-6">
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
          <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded">
            <h3 className="font-bold text-red-900 uppercase text-sm mb-2">
              Spend Hit Dice
            </h3>
            <p className="text-xs text-gray-600 mb-3">
              Manually apply healing to your HP pool before completing this
              rest.
            </p>
            {/* TODO: Map over available Hit Dice resources and add Roll/Spend buttons */}
            <div className="text-center text-gray-500 italic border border-dashed border-gray-300 p-2">
              Hit Dice Interface Pending...
            </div>
          </div>
        )}

        {/* Predictive Recovery Preview */}
        <div className="bg-gray-50 border border-gray-200 p-4 mb-6 rounded h-48 overflow-y-auto">
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
              {recoveryPreview.map((item, idx) => (
                <li
                  key={idx}
                  className="flex justify-between items-center border-b border-gray-100 py-1"
                >
                  <span className="font-bold text-gray-800">{item.name}</span>
                  <span className="text-green-600 font-bold">
                    +{item.recoveredAmount}{" "}
                    <span className="text-gray-400 text-xs font-normal">
                      (Total: {item.newTotal})
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
            className="px-4 py-2 font-bold text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 font-bold bg-green-600 text-white rounded hover:bg-green-700 shadow-sm"
          >
            Confirm Rest
          </button>
        </div>
      </div>
    </div>
  );
};
