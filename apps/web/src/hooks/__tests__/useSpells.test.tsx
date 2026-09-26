import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, useEffect } from "react";
import type { SpellSynthesis } from "@project/engine";
import { emptyCharacterChoices } from "@project/shared";
import { useSpells } from "../useSpells";
import { useCharacterSheetStore } from "../../store/characterSheetStore";
import { packRuleSnapshot } from "../../store/__tests__/packFixture";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let captured: SpellSynthesis | null = null;

const Harness = () => {
  const synthesis = useSpells();
  useEffect(() => {
    captured = synthesis;
  });
  return null;
};

describe("useSpells", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    captured = null;
    useCharacterSheetStore.setState({
      ...useCharacterSheetStore.getState(),
      id: "char_1",
      classLevels: { class_wizard: 3 },
      subclassIds: {},
      raceId: "race_elf",
      subraceId: "subrace_elf_dark",
      backgroundId: null,
      baseScores: { STR: 8, DEX: 14, CON: 10, INT: 16, WIS: 12, CHA: 10 },
      choices: emptyCharacterChoices(),
      ruleSnapshot: packRuleSnapshot(),
      activeConditions: [],
      activeModifiers: [],
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  // CHA 10 + the drow's 1 = 11 (+0); a level-3 proficiency bonus of +2
  it("lists a drow wizard's Drow Magic spells with the sheet's own numbers", async () => {
    await act(async () => {
      root.render(<Harness />);
    });

    expect(
      captured?.spells.find((spell) => spell.spellId === "spell_dancing_lights"),
    ).toMatchObject({
      source: { kind: "trait", label: "Drow Magic" },
      ability: "CHA",
      saveDc: 10,
      payment: { kind: "at_will" },
    });
    expect(captured?.actions.map((action) => action.id)).toContain(
      "action_spell_faerie_fire@drow_magic",
    );
  });
});
