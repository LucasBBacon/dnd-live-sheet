import { useEffect, useMemo } from "react";
import { useAbilities } from "../../../hooks/useCharacterStats";
import { useCharacterSheetStore } from "../../../store/characterSheetStore";
import { type Ability } from "@project/engine";
import { useLevelUpStore } from "../../../store/levelUpStore";
import { ledgerTotalLevel } from "../../../utils/ledgerLevel";

/**
 * A change with its sign - "+13", "+0", "−1" - so a gain below zero reads as
 * one, not as "+-1" (#107).
 * @param value The change
 * @returns The change, signed
 */
const signedDelta = (value: number): string =>
  value < 0 ? `−${Math.abs(value)}` : `+${value}`;

export const ReviewStep = () => {
  const {
    draftPayload,
    progressionContext,
    grantedTraitDetails,
    hitPointPreview,
    requestHitPointPreview,
  } = useLevelUpStore();
  // the ledger's total, as the level-up itself counts it (#95)
  const currentTotalLevel = useCharacterSheetStore((state) =>
    ledgerTotalLevel(state.classLevels),
  );
  const currentMaxHp = useCharacterSheetStore((state) => state.getMaxHp());
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const traitsById = ruleSnapshot?.traitsById;

  const { finalAbilities } = useAbilities();

  // the server's answer, not an estimate: an ability score increase that
  // raises Constitution also raises every earlier level, which only the
  // saves the level-up itself builds can see (#88)
  useEffect(() => {
    void requestHitPointPreview();
  }, [
    requestHitPointPreview,
    draftPayload.hpRoll,
    draftPayload.asiChoices,
    draftPayload.featId,
    draftPayload.subclassId,
  ]);

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

    // HIT POINTS - the server's preview, never an estimate (#88)
    if (draftPayload.hpRoll) {
      changes.push(
        hitPointPreview.status === "ready"
          ? {
              category: "Vitals",
              label: "Maximum Hit Points",
              current: hitPointPreview.maxHpBefore,
              next: hitPointPreview.maxHpAfter,
              delta: signedDelta(hitPointPreview.hitPointGain),
            }
          : {
              category: "Vitals",
              label: "Maximum Hit Points",
              current: currentMaxHp,
              next:
                hitPointPreview.status === "error"
                  ? "Hit point preview unavailable"
                  : "Calculating…",
              delta: "",
            },
      );
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
    hitPointPreview,
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
          name:
            traitsById?.[id]?.name || id.replace(/_/g, " ").toUpperCase(),
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
        name: traitsById?.[id]?.name || id.replace(/_/g, " ").toUpperCase(),
        sourceLabel: "Granted",
      };
    });
  }, [progressionContext, grantedTraitDetails, draftPayload, traitsById]);

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
                    {diff.delta ? (
                      <span className="text-xs font-black bg-green-100 text-green-800 px-1.5 py-0.5 rounded">
                        {diff.delta}
                      </span>
                    ) : null}
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
                  <span className="text-xs text-indigo-500">
                    [{feature.sourceLabel}]
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
