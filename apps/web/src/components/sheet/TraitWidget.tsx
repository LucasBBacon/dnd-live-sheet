import {
  TRAIT_DICTIONARY,
  TraitBridge,
} from "@project/engine";
import type {
  ChoiceProficiencyGrant,
  FixedProficiencyGrant,
  RuntimeModifier,
} from "@project/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAbilities, useDerivedStats } from "../../hooks/useCharacterStats";
import {
  type CharacterSheetResponse,
  fetchCharacterSheet,
  hydrateCharacterSheetWithRules,
} from "../../pages/characterSheetRouteData";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const DEV_FIXTURE_CHARACTER_ID = "00000000-0000-0000-0000-000000000101";

const toDebugUuid = (id: string): string => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return `00000000-0000-4000-8000-${hash.toString(16).padStart(12, "0").slice(-12)}`;
};

const formatModifier = (modifier: RuntimeModifier): string => {
  const scale = modifier.scalingFactor !== "none" ? `, scale=${modifier.scalingFactor}` : "";
  return `${modifier.target} | ${modifier.type} | ${modifier.value}${scale}`;
};

const formatProficiencyGrant = (grant: FixedProficiencyGrant): string => {
  return `${grant.category} | ${grant.proficiencyId} | ${grant.level}`;
};

const formatProficiencyChoice = (choice: ChoiceProficiencyGrant): string => {
  const optionList = Array.isArray(choice.options) && choice.options.length > 0
    ? choice.options.join(", ")
    : "any in category";

  return `${choice.category} | choose=${choice.chooseAmount} | level=${choice.level} | options=${optionList}`;
};

const areRuntimeModifiersEqual = (
  left: RuntimeModifier[],
  right: RuntimeModifier[],
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftMod = left[index];
    const rightMod = right[index];

    if (
      leftMod.id !== rightMod.id ||
      leftMod.sourceName !== rightMod.sourceName ||
      leftMod.sourceOrigin !== rightMod.sourceOrigin ||
      leftMod.target !== rightMod.target ||
      leftMod.type !== rightMod.type ||
      leftMod.value !== rightMod.value ||
      leftMod.scalingFactor !== rightMod.scalingFactor ||
      leftMod.maxDexCap !== rightMod.maxDexCap ||
      leftMod.isActive !== rightMod.isActive
    ) {
      return false;
    }
  }

  return true;
};

export const TraitWidget = () => {
  const initializeStore = useCharacterSheetStore((state) => state.initialize);
  const activeModifiers = useCharacterSheetStore((state) => state.activeModifiers);
  const characterId = useCharacterSheetStore((state) => state.id);
  const campaignId = useCharacterSheetStore((state) => state.campaignId);
  const level = useCharacterSheetStore((state) => state.level);
  const classLevels = useCharacterSheetStore((state) => state.classLevels);
  const raceId = useCharacterSheetStore((state) => state.raceId);
  const subraceId = useCharacterSheetStore((state) => state.subraceId);
  const currentHp = useCharacterSheetStore((state) => state.currentHp);
  const storedMaxHp = useCharacterSheetStore((state) => state.maxHp);
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const proficiencies = useCharacterSheetStore((state) => state.proficiencies);
  const resources = useCharacterSheetStore((state) => state.resources);
  const traitGrants = useCharacterSheetStore((state) => state.traitGrants);

  const { finalAbilities, totalMods } = useAbilities();
  const { profBonus, maxHp, initiative, armorClass } = useDerivedStats();

  const [selectedTraitIds, setSelectedTraitIds] = useState<string[]>([]);
  const baselineModifiersRef = useRef<RuntimeModifier[] | null>(null);
  const hasHydratedFixtureRef = useRef(false);

  const { data, isLoading, isError } = useQuery<CharacterSheetResponse>({
    queryKey: ["character", "dev-fixture", DEV_FIXTURE_CHARACTER_ID, "trait-widget"],
    queryFn: () => fetchCharacterSheet(DEV_FIXTURE_CHARACTER_ID),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  useEffect(() => {
    if (!data?.character || hasHydratedFixtureRef.current) {
      return;
    }

    hydrateCharacterSheetWithRules(initializeStore, data);
    hasHydratedFixtureRef.current = true;
  }, [data, initializeStore]);

  useEffect(() => {
    if (!data?.character || baselineModifiersRef.current !== null) {
      return;
    }

    baselineModifiersRef.current = activeModifiers;
  }, [activeModifiers, data?.character]);

  const traitRows = useMemo(
    () =>
      Object.values(TRAIT_DICTIONARY)
        .map((trait) => ({
          id: trait.id,
          uuid: toDebugUuid(trait.id),
          name: trait.name,
          modifiers: trait.modifiers,
          fixedProficiencyGrants: trait.proficiencies?.fixed ?? [],
          proficiencyChoices: trait.proficiencies?.choices ?? [],
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [],
  );

  const selectedTraitBenefits = useMemo(
    () => TraitBridge.compileTraitBenefits(selectedTraitIds),
    [selectedTraitIds],
  );

  const selectedTraitModifiers = useMemo<RuntimeModifier[]>(() => {
    return selectedTraitBenefits.modifiers.map((modifier) => ({
      ...modifier,
      id: `trait-debug:${modifier.id}`,
    }));
  }, [selectedTraitBenefits.modifiers]);

  const selectedTraitProficiencyGrants = useMemo(
    () => selectedTraitBenefits.proficiencyGrants,
    [selectedTraitBenefits.proficiencyGrants],
  );

  const selectedTraitProficiencyChoices = useMemo(
    () => selectedTraitBenefits.proficiencyChoices,
    [selectedTraitBenefits.proficiencyChoices],
  );

  const projectedProficiencyCount = useMemo(() => {
    const baseEntries = Object.keys(proficiencies).map((id) => `existing:${id}`);
    const gainedEntries = selectedTraitProficiencyGrants.map(
      (grant) => `${grant.category}:${grant.proficiencyId}`,
    );

    return new Set([...baseEntries, ...gainedEntries]).size;
  }, [proficiencies, selectedTraitProficiencyGrants]);

  useEffect(() => {
    if (!data?.character || !hasHydratedFixtureRef.current) {
      return;
    }

    const baseline = baselineModifiersRef.current ?? [];
    const nextActiveModifiers = [...baseline, ...selectedTraitModifiers];

    if (areRuntimeModifiersEqual(activeModifiers, nextActiveModifiers)) {
      return;
    }

    initializeStore({
      activeModifiers: nextActiveModifiers,
    });
  }, [activeModifiers, data?.character, initializeStore, selectedTraitModifiers]);

  useEffect(() => {
    return () => {
      if (!baselineModifiersRef.current) {
        return;
      }

      initializeStore({ activeModifiers: baselineModifiersRef.current });
    };
  }, [initializeStore]);

  const toggleTraitSelection = (traitId: string) => {
    setSelectedTraitIds((current) =>
      current.includes(traitId)
        ? current.filter((id) => id !== traitId)
        : [...current, traitId],
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-black min-h-screen text-gray-300">
        Booting trait debugger fixture...
      </div>
    );
  }

  if (isError || !data?.character) {
    return (
      <div className="p-8 bg-black min-h-screen text-red-400">
        Failed to load dev fixture character. Ensure the server is running and seed
        data has been applied.
      </div>
    );
  }

  return (
    <div className="p-8 bg-black min-h-screen font-sans text-gray-200">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="border-b border-gray-800 pb-4">
          <h2 className="text-2xl font-bold text-white">Trait Dictionary Debugger</h2>
          <p className="text-sm text-gray-400 mt-2">
            Source: static TRAIT_DICTIONARY only. Click rows to toggle traits and stack
            modifiers through engine calculations.
          </p>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 rounded border border-gray-800 bg-gray-950/80 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 text-sm text-gray-400">
              Traits loaded: {traitRows.length} | Selected: {selectedTraitIds.length}
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-xs uppercase tracking-wider text-gray-400">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">UUID</th>
                    <th className="text-left px-4 py-3">ID</th>
                    <th className="text-left px-4 py-3">Modifiers</th>
                    <th className="text-left px-4 py-3">Fixed Proficiencies</th>
                    <th className="text-left px-4 py-3">Proficiency Choices</th>
                  </tr>
                </thead>
                <tbody>
                  {traitRows.map((trait) => {
                    const selected = selectedTraitIds.includes(trait.id);

                    return (
                      <tr
                        key={trait.id}
                        onClick={() => toggleTraitSelection(trait.id)}
                        className={`cursor-pointer border-t border-gray-900 transition-colors ${selected ? "bg-blue-900/25" : "hover:bg-gray-900/70"}`}
                      >
                        <td className="px-4 py-3 font-medium text-white">{trait.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-400">{trait.uuid}</td>
                        <td className="px-4 py-3 font-mono text-xs text-cyan-300">{trait.id}</td>
                        <td className="px-4 py-3 text-xs text-gray-300">
                          {trait.modifiers.length === 0 && (
                            <div className="text-gray-500">None</div>
                          )}
                          {trait.modifiers.map((modifier, index) => (
                            <div key={`${trait.id}:mod:${index}`}>
                              {modifier.target} | {modifier.type} | {modifier.value}
                              {modifier.scalingFactor !== "none"
                                ? ` (${modifier.scalingFactor})`
                                : ""}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-xs text-amber-300">
                          {trait.fixedProficiencyGrants.length === 0 && (
                            <div className="text-gray-500">None</div>
                          )}
                          {trait.fixedProficiencyGrants.map((grant, index) => (
                            <div key={`${trait.id}:prof:${index}`}>
                              {formatProficiencyGrant(grant)}
                            </div>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-xs text-indigo-300">
                          {trait.proficiencyChoices.length === 0 && (
                            <div className="text-gray-500">None</div>
                          )}
                          {trait.proficiencyChoices.map((choice, index) => (
                            <div key={`${trait.id}:choice:${index}`}>
                              {formatProficiencyChoice(choice)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border border-gray-800 bg-gray-950/80 p-4 space-y-4">
            <h3 className="text-lg font-semibold text-white">Character Snapshot</h3>

            <div className="text-xs space-y-1 text-gray-300">
              <div className="font-mono break-all">Character ID: {characterId}</div>
              <div className="font-mono break-all">Campaign ID: {campaignId ?? "none"}</div>
              <div>Race: {raceId ?? "none"}</div>
              <div>Subrace: {subraceId ?? "none"}</div>
              <div>Level: {level}</div>
              <div>Class Levels: {Object.keys(classLevels).length > 0 ? JSON.stringify(classLevels) : "{}"}</div>
              <div>Inventory Items: {inventory.length}</div>
              <div>Resources: {resources.length}</div>
              <div>Trait Grants: {traitGrants.length}</div>
              <div>
                HP: {currentHp} / {storedMaxHp} (engine max: {maxHp.total})
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider text-gray-400 mb-2">Abilities</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {Object.entries(finalAbilities).map(([ability, value]) => (
                  <div key={ability} className="rounded border border-gray-800 p-2 bg-black/30">
                    <div className="uppercase text-gray-400">{ability}</div>
                    <div className="text-white font-semibold">{value.score}</div>
                    <div className="text-emerald-400 font-mono">
                      {value.modifier >= 0 ? `+${value.modifier}` : value.modifier}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs space-y-1 text-gray-300">
              <div>Proficiency Bonus: +{profBonus}</div>
              <div>Armour Class: {armorClass.total}</div>
              <div>Initiative: {initiative.total >= 0 ? `+${initiative.total}` : initiative.total}</div>
              <div>
                Proficiencies: {Object.keys(proficiencies).length} | Projected with selected
                traits: {projectedProficiencyCount}
              </div>
              <div>Total Active Modifiers in Engine: {totalMods.length}</div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider text-gray-400 mb-2">
                Selected Trait Runtime Modifiers
              </h4>
              <div className="space-y-1 text-xs text-gray-300 max-h-40 overflow-auto pr-1">
                {selectedTraitModifiers.length === 0 && (
                  <div className="text-gray-500">No trait modifiers selected.</div>
                )}
                {selectedTraitModifiers.map((modifier) => (
                  <div
                    key={modifier.id}
                    className="rounded border border-gray-800 p-2 bg-black/30 font-mono break-all"
                  >
                    {modifier.sourceName}: {formatModifier(modifier)}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider text-gray-400 mb-2">
                Selected Trait Proficiency Gains
              </h4>
              <div className="space-y-1 text-xs text-amber-300 max-h-40 overflow-auto pr-1">
                {selectedTraitProficiencyGrants.length === 0 && (
                  <div className="text-gray-500">No trait proficiencies gained.</div>
                )}
                {selectedTraitProficiencyGrants.map((grant) => (
                  <div
                    key={`${grant.category}:${grant.proficiencyId}`}
                    className="rounded border border-gray-800 p-2 bg-black/30 font-mono break-all"
                  >
                    {formatProficiencyGrant(grant)}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wider text-gray-400 mb-2">
                Selected Trait Proficiency Choices
              </h4>
              <div className="space-y-1 text-xs text-indigo-300 max-h-40 overflow-auto pr-1">
                {selectedTraitProficiencyChoices.length === 0 && (
                  <div className="text-gray-500">No proficiency choices required.</div>
                )}
                {selectedTraitProficiencyChoices.map((choice) => (
                  <div
                    key={`${choice.traitId}:${choice.id}`}
                    className="rounded border border-gray-800 p-2 bg-black/30 font-mono break-all"
                  >
                    {choice.traitId}: {formatProficiencyChoice(choice)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
