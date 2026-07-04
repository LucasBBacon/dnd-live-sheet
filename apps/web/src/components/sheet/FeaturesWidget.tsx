import { useFeatures } from "../../hooks/useFeatures";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

export const FeaturesWidget = () => {
  const features = useFeatures();
  const consumeResource = useCharacterSheetStore(
    (state) => state.consumeResource,
  );

  if (features.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-2 border-gray-300 p-4 rounded shadow-sm mb-4">
      <h2 className="font-bold border-b-2 border-gray-800 pb-1 mb-3 uppercase">
        Class Features
      </h2>

      <div className="flex flex-col gap-3">
        {features.map((feature) => (
          <div
            key={feature.id}
            className="flex justify-between items-center border border-gray-200 p-2 rounded bg-gray-50"
          >
            <div>
              <div className="font-bold text-gray-900 text-sm">
                {feature.name}
              </div>
              <div className="text-xs text-gray-500 font-mono">
                Uses: {feature.current} / {feature.max} • Resets:{" "}
                {feature.resetCondition.replace("_", " ")}
              </div>
            </div>

            <button
              onClick={() => consumeResource(feature.id, 1)}
              disabled={feature.isDepleted}
              className={`px-4 py-1 text-xs uppercase rounded shadow-sm transition-colors ${feature.isDepleted ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
            >
              {feature.isDepleted ? "Expended" : "Use"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
