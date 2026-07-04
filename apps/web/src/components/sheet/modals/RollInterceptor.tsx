import React, { useState } from "react";
import { useRollStore } from "../../../store/rollStore";
import { DiceEngine } from "@project/engine";

export const RollInterceptor = () => {
  const { pendingRoll, fulfillRoll, cancelRoll } = useRollStore();
  const [manualInput, setManualInput] = useState<string>("");

  console.log(pendingRoll);

  if (!pendingRoll) return null;

  const handleDigitalRoll = () => {
    const { total } = DiceEngine.rollDigital(pendingRoll.expression);
    fulfillRoll(total);
  };

  const handlePhysicalRoll = (e: React.SubmitEvent) => {
    e.preventDefault();
    const result = parseInt(manualInput, 10);
    if (!isNaN(result)) fulfillRoll(result);
  };

  console.log("Called!");

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-[100] font-mono">
      <div className="bg-white border-2 border-gray-900 rounded p-6 max-w-sm w-full shadow-2xl">
        <h2 className="text-xl font-bold uppercase mb-1">Action Required</h2>
        <p className="text-sm text-gray-600 mb-4 border-b pb-2">
          {pendingRoll.reason}
        </p>

        <div className="text-center mb-6">
          <span className="text-xs text-gray-500 uppercase tracking-widest block mb-1">
            Target
          </span>
          <span className="text-3xl font-extrabold text-gray-900">
            {pendingRoll.expression}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={handleDigitalRoll}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded shadow"
          >
            Roll Digitally
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase">
              Or Physical Roll
            </span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <form onSubmit={handlePhysicalRoll} className="flex gap-2">
            <input
              type="number"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Total..."
              className="flex-grow border-2 border-gray-300 p-2 rounded text-center font-bold"
              autoFocus
            />
            <button
              type="submit"
              disabled={!manualInput}
              className="bg-gray-800 hover:bg-gray-900 text-white font-bold px-4 rounded disabled:opacity-50"
            >
              Submit
            </button>
          </form>
        </div>

        <button
          onClick={cancelRoll}
          className="w-full mt-4 text-xs text-gray-500 hover:text-gray-800 uppercase"
        >
          Cancel Execution
        </button>
      </div>
    </div>
  );
};
