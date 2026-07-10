import { useMemo } from "react";
import { useAbilities } from "../../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { TRAIT_DICTIONARY, type Ability } from "@project/engine";
import { useLevelUpStore } from "../../../store/levelUpStore";

export const ReviewStep = () => {
  const { draftPayload, progressionContext, grantedTraitDetails } = useLevelUpStore();
  const currentTotalLevel = useCharacterSheetStore((state) => state.level);
  const currentMaxHp = useCharacterSheetStore((state) => state.maxHp);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);

  const { finalAbilities } = useAbilities();

  // 1 - calculate the projected state
  const diffs = useMemo(() => {
    const changes = [];

    // LEVEL INCREASE
    const targetClass = draftPayload.targetClassId || "Unknown Class";
    const currentClassLevel = classLevels[targetClass] || 0;

    changes.push({
      category: "Progression",
      label: `${targetClass.replace("class_", "").toUpperCase()} Level`,
      current: currentClassLevel,
      next: currentClassLevel + 1,
      delta: "+1",
    });

    changes.push({
      category: "Progression",
      label: "Total Character Level",
      current: currentTotalLevel,
      next: draftPayload.newTotalLevel,
      delta: "+1",
    });

    // HIT POINTS
    // note if CON mod increased this lvl the exact projected HP requires full engine exec
    // for clarity, approximate delta visually based on the raw roll + current CON
    if (draftPayload.hpRoll) {
      const projectedConMod = finalAbilities.con.modifier; // TODO: get updated value
      const totalHpGain = draftPayload.hpRoll + projectedConMod;
      changes.push({
        category: "Vitals",
        label: "Maximum Hit Points",
        current: currentMaxHp,
        next: currentMaxHp + totalHpGain,
        delta: `+${totalHpGain}`,
      });
    }

    // ABILITY SCORES
    if (draftPayload.asiChoices && draftPayload.asiChoices.length > 0) {
      draftPayload.asiChoices.forEach((asi) => {
        const stat = asi.stat as Ability;
        const currentScore = finalAbilities[stat].score;
        changes.push({
          category: "Ability Scores",
          label: stat.toUpperCase(),
          current: currentScore,
          next: currentScore + asi.value,
          delta: `+${asi.value}`,
        });
      });
    }

    return changes;
  }, [
    draftPayload,
    currentTotalLevel,
    currentMaxHp,
    finalAbilities,
    classLevels,
  ]);

  // 2 - Resolve gained features
  const gainedFeatures = useMemo(() => {
    if (!progressionContext) return [];

    const grantedById = new Map(
      grantedTraitDetails.map((trait) => [trait.id, trait]),
    );
    const traitIds = new Set<string>([...progressionContext.grantedTraits]);

    if (draftPayload.featId) traitIds.add(draftPayload.featId);
    if (draftPayload.subclassId) traitIds.add(draftPayload.subclassId);

    return Array.from(traitIds).map((id) => {
      const grant = grantedById.get(id);

      if (grant) {
        return {
          id,
          name: grant.name,
          sourceLabel:
            grant.grantSourceType === "multiclass_grant"
              ? "Multiclass Grant"
              : grant.grantSourceType === "subclass_progression"
                ? "Subclass Progression"
                : "Class Progression",
        };
      }

      if (id === draftPayload.featId) {
        return {
          id,
          name: TRAIT_DICTIONARY[id]?.name || id.replace(/_/g, " ").toUpperCase(),
          sourceLabel: "Feat Selection",
        };
      }

      if (id === draftPayload.subclassId) {
        return {
          id,
          name: id.replace(/_/g, " ").toUpperCase(),
          sourceLabel: "Subclass Selection",
        };
      }

      return {
        id,
        name: TRAIT_DICTIONARY[id]?.name || id.replace(/_/g, " ").toUpperCase(),
        sourceLabel: "Granted",
      };
    });
  }, [progressionContext, grantedTraitDetails, draftPayload]);

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold border-b-2 border-grey-800 pb-2 mb-4 uppercase">
        Confirm Modifications
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Review your calculated changes. Once committed, these adjustments will
        be permanently applied to your character sheet and broadcast to the
        Campaign Log.
      </p>

      <div className="flex-grow flex flex-col gap-6 overflow-y-auto pr-2">
        {/* STATISTICAL DIFFS */}
        <div className="bg-white border-2 border-gray-200 rounded overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 text-gray-600 uppercase text-xs tracking-wider border-b-2 border-gray-200">
              <tr>
                <th className="p-3">Attribute</th>
                <th className="p-3">Current</th>
                <th className="p-3"></th>
                <th className="p-3">New</th>
              </tr>
            </thead>
            <tbody className="text-sm font-bold">
              {diffs.map((diff, idx) => (
                <tr
                  key={idx}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="p-3 text-gray-900">{diff.label}</td>
                  <td className="p-3 text-center text-gray-500">
                    {diff.current}
                  </td>
                  <td className="p-3 text-center text-gray-400">→</td>
                  <td className="p-3 text-center text-green-700 flex items-center justify-center gap-2">
                    {diff.next}
                    <span className="text-xs font-black bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                      {diff.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* NEW FEATURES MANIFEST */}
        {gainedFeatures.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded shadow-sm">
            <h4 className="text-sm font-bold text-indigo-900 uppercase mb-3 border-b border-indigo-200 pb-1">
              Acquired Features & Traits
            </h4>
            <ul className="grid grid-cols-2 gap-2">
              {gainedFeatures.map((feature, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-2 text-sm text-indigo-800 font-bold"
                >
                  <span className="text-indigo-400">✦</span>
                  <span>{feature.name}</span>
                  <span className="text-xs text-indigo-500">[{feature.sourceLabel}]</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
