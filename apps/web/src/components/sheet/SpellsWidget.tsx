import { useState } from "react";
import {
  materialCoverage,
  upcastDice,
  type CastableSpell,
} from "@project/engine";
import type { ActionGrant } from "@project/shared";
import { useSpells } from "../../hooks/useSpells";
import { useCharacterSheetStore } from "../../store/characterSheetStore";

const LEVEL_HEADINGS = [
  "Cantrips",
  "1st level",
  "2nd level",
  "3rd level",
  "4th level",
  "5th level",
  "6th level",
  "7th level",
  "8th level",
  "9th level",
];

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

const ACTIVATION: Record<string, string> = {
  action: "1 action",
  bonus_action: "1 bonus action",
  reaction: "1 reaction",
  attack: "1 attack",
  special: "No action",
  minute: "1 minute",
  hour: "1 hour",
  eight_hours: "8 hours",
};

/** What each refusal the server sends means, in the player's terms. */
const REFUSALS: Record<string, string> = {
  slot_required: "Choose a spell slot to cast this with.",
  slot_too_low: "That slot is too low for this spell.",
  slot_empty: "No slots of that level left.",
  materials_required: "This spell needs its material component.",
  insufficient_resource: "No uses left.",
};

const rangeText = (spell: CastableSpell): string | undefined => {
  const range = spell.range;
  if (!range) return undefined;
  const area = range.area
    ? `${range.area.size}-foot ${range.area.shape.replace("_", " ")}`
    : undefined;
  if (range.kind === "self") return area ? `Self (${area})` : "Self";
  return area ? `${range.feet} feet (${area})` : `${range.feet} feet`;
};

const durationText = (spell: CastableSpell): string | undefined => {
  const duration = spell.duration;
  if (!duration) return undefined;
  if (duration.kind === "instantaneous") return "Instantaneous";
  const span = `${duration.amount} ${duration.unit}${duration.amount === 1 ? "" : "s"}`;
  return duration.concentration ? `Concentration, up to ${span}` : span;
};

const componentText = (spell: CastableSpell): string | undefined => {
  const components = spell.components;
  if (!components) return undefined;
  return [
    components.verbal && "V",
    components.somatic && "S",
    components.material && "M",
  ]
    .filter(Boolean)
    .join(", ");
};

/** The dice a slot-paid spell rolls from a slot of this level, for the picker. */
const upcastPreview = (
  action: ActionGrant | undefined,
  spellLevel: number,
  castLevel: number,
): string | undefined => {
  if (!action) return undefined;
  const effects =
    action.effect.type === "macro" ? action.effect.effects : [action.effect];
  for (const effect of effects) {
    if (effect.type !== "save" && effect.type !== "attack") continue;
    const segment = effect.damage?.find((entry) => entry.perSlotAbove !== undefined);
    if (segment) return upcastDice(segment, { spellLevel, castLevel });
  }
  return undefined;
};

const BUTTON =
  "rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100";

/**
 * Every spell the character has, and the way to cast it.
 *
 * One row per spell per source: Faerie Fire through Drow Magic and through the
 * cleric are two rows, because they cost different things. Casting asks only
 * what the rules leave to the player - which slot, and whether they have a
 * material nothing they carry covers - and the server checks both again.
 */
export const SpellsWidget = () => {
  const { spells, actions, slotPools } = useSpells();
  const resources = useCharacterSheetStore((state) => state.resources);
  const inventory = useCharacterSheetStore((state) => state.inventory);
  const ruleSnapshot = useCharacterSheetStore((state) => state.ruleSnapshot);
  const runtimeEffects = useCharacterSheetStore((state) => state.runtimeEffects);
  const castSpell = useCharacterSheetStore((state) => state.castSpell);
  const lastActionOutcome = useCharacterSheetStore(
    (state) => state.lastActionOutcome,
  );

  const [expanded, setExpanded] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    actionId: string;
    slotResourceId?: string;
  } | null>(null);

  if (spells.length === 0) return null;

  const charges = (resourceId: string) =>
    resources.find((resource) => resource.id === resourceId)?.current ?? 0;
  const concentratingOn = runtimeEffects
    ?.getActiveEffects()
    .find((effect) => effect.isSelfConcentration)?.sourceName;

  const send = (
    spell: CastableSpell,
    slotResourceId?: string,
    materialsConfirmed = false,
  ) => {
    if (!spell.actionId) return;
    castSpell(spell.actionId, {
      ...(slotResourceId !== undefined && { slotResourceId }),
      ...(materialsConfirmed && { materialsConfirmed: true }),
    });
    setPicking(null);
    setConfirming(null);
  };

  const withMaterials = (spell: CastableSpell, slotResourceId?: string) => {
    if (
      spell.actionId &&
      !materialCoverage(spell, inventory, ruleSnapshot ?? undefined).covered
    ) {
      setPicking(null);
      setConfirming({
        actionId: spell.actionId,
        ...(slotResourceId !== undefined && { slotResourceId }),
      });
      return;
    }
    send(spell, slotResourceId);
  };

  const onCast = (spell: CastableSpell) => {
    if (!spell.actionId) return;
    if (spell.payment.kind === "slot") {
      setPicking(picking === spell.actionId ? null : spell.actionId);
      return;
    }
    withMaterials(spell);
  };

  const levels = [...new Set(spells.map((spell) => spell.level))].sort(
    (a, b) => a - b,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">
        Spells
      </p>

      <div className="mt-3 space-y-4">
        {levels.map((level) => {
          const group = spells.filter((spell) => spell.level === level);

          return (
            <section key={level}>
              <h4 className="text-xs font-bold uppercase text-slate-600">
                {LEVEL_HEADINGS[level]}
              </h4>
              {group.some((spell) => !spell.preparationTracked) && (
                <p className="mt-1 text-[11px] text-amber-700">
                  {"Preparation isn't tracked; cast only what you prepared today."}
                </p>
              )}

              <ul className="mt-2 space-y-2">
                {group.map((spell) => {
                  const key =
                    spell.actionId ?? `${spell.spellId}@${spell.source.label}`;
                  const action = actions.find((entry) => entry.id === spell.actionId);
                  const coverage = materialCoverage(
                    spell,
                    inventory,
                    ruleSnapshot ?? undefined,
                  );
                  const concentrates =
                    spell.duration?.kind === "timed" && spell.duration.concentration;
                  const details = [
                    ACTIVATION[spell.activation],
                    rangeText(spell),
                    componentText(spell),
                    durationText(spell),
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  const price =
                    spell.payment.kind === "at_will"
                      ? "At will"
                      : spell.payment.kind === "resource"
                        ? `${charges(spell.payment.resourceId)} left`
                        : "Slot";
                  const outcome =
                    lastActionOutcome?.actionId === spell.actionId
                      ? lastActionOutcome
                      : null;
                  const isPicking = picking !== null && picking === spell.actionId;
                  const isConfirming =
                    confirming !== null && confirming.actionId === spell.actionId;
                  const usablePools = slotPools.filter(
                    (pool) => pool.level >= spell.level && charges(pool.resourceId) > 0,
                  );

                  return (
                    <li
                      key={key}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {spell.name}
                            {concentrates && (
                              <span className="ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                                Concentration
                              </span>
                            )}
                            {!spell.actionId && (
                              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                                Not yet automated
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {spell.source.label} · {price}
                          </p>
                          {details && (
                            <p className="text-[11px] text-slate-500">{details}</p>
                          )}
                        </div>

                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => setExpanded(expanded === key ? null : key)}
                            className={BUTTON}
                          >
                            Details
                          </button>
                          {spell.actionId && (
                            <button
                              type="button"
                              onClick={() => onCast(spell)}
                              className="rounded bg-indigo-700 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-indigo-800"
                            >
                              Cast
                            </button>
                          )}
                        </div>
                      </div>

                      {concentratingOn && concentrates && spell.actionId && (
                        <p className="mt-1 text-[11px] text-indigo-700">
                          Casting this ends {concentratingOn}.
                        </p>
                      )}

                      {isPicking && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {usablePools.length === 0 ? (
                            <p className="text-[11px] text-slate-500">
                              No slots left that can cast this.
                            </p>
                          ) : (
                            usablePools.map((pool) => {
                              const preview = upcastPreview(action, spell.level, pool.level);
                              return (
                                <button
                                  key={pool.resourceId}
                                  type="button"
                                  onClick={() => withMaterials(spell, pool.resourceId)}
                                  className={BUTTON}
                                >
                                  {`${ORDINALS[pool.level]} level (${charges(pool.resourceId)} left)${preview ? ` · ${preview}` : ""}`}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}

                      {isConfirming && (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                          <p className="text-[11px] text-amber-800">
                            {`Needs ${spell.components?.materialDescription ?? "a material component"}. Do you have it?`}
                          </p>
                          <div className="mt-1 flex gap-1">
                            <button
                              type="button"
                              onClick={() => send(spell, confirming?.slotResourceId, true)}
                              className={BUTTON}
                            >
                              Cast anyway
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming(null)}
                              className={BUTTON}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {outcome && !outcome.executed && (
                        <p className="mt-1 text-[11px] text-red-700">
                          {REFUSALS[outcome.reason ?? ""] ?? "The spell was not cast."}
                        </p>
                      )}
                      {outcome?.executed && outcome.economyOverdrawn && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Your action was already used this turn.
                        </p>
                      )}

                      {expanded === key && (
                        <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                          {spell.actionId ? (
                            <p className="whitespace-pre-line">
                              {spell.lore?.fullText ?? spell.lore?.shortDescription}
                            </p>
                          ) : (
                            <p>
                              {"This spell's rules haven't been authored — resolve it at the table."}
                            </p>
                          )}
                          {spell.components?.material && (
                            <p>
                              {`Material: ${spell.components.materialDescription}. `}
                              {coverage.covered
                                ? `Covered by: ${coverage.by}`
                                : "No pouch or usable focus."}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
};
