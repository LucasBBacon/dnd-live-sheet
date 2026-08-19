import { describe, expect, it } from "vitest";
import {
  ActionGrantSchema,
  STANDARD_ACTIONS,
  STANDARD_ACTION_IDS,
} from "../index.js";

const byId = (id: string) =>
  STANDARD_ACTIONS.find((action) => action.id === id);

const PHB_ACTIONS = [
  "action_dash",
  "action_disengage",
  "action_dodge",
  "action_help",
  "action_hide",
  "action_ready",
  "action_search",
  "action_use_object",
];

describe("STANDARD_ACTIONS", () => {
  it("offers every action a character can take on their turn", () => {
    for (const id of PHB_ACTIONS) {
      expect(byId(id), id).toBeDefined();
    }
  });

  it("gives each action a distinct id", () => {
    expect(new Set(STANDARD_ACTION_IDS).size).toBe(STANDARD_ACTION_IDS.length);
  });

  it("validates every action against the grant contract", () => {
    for (const action of STANDARD_ACTIONS) {
      expect(() => ActionGrantSchema.parse(action), action.id).not.toThrow();
    }
  });

  it("costs an action for each of the eight", () => {
    for (const id of PHB_ACTIONS) {
      expect(byId(id)?.activation, id).toBe("action");
    }
  });

  it("names each action for the player", () => {
    expect(byId("action_dodge")?.name).toBe("Dodge");
    expect(byId("action_use_object")?.name).toBe("Use an Object");
  });
});

describe("Dash", () => {
  const dash = byId("action_dash");

  it("doubles speed rather than adding a fixed amount", () => {
    if (dash?.effect.type !== "apply_effect") throw new Error("expected effect");

    expect(dash.effect.modifiers).toEqual([
      expect.objectContaining({
        target: "SPEED",
        type: "multiplier",
        value: 2,
      }),
    ]);
  });

  it("lasts only for the turn it was taken on", () => {
    if (dash?.effect.type !== "apply_effect") throw new Error("expected effect");

    expect(dash.effect.durationType).toBe("turn_end");
  });
});

describe("Dodge", () => {
  const dodge = byId("action_dodge");

  it("grants advantage on Dexterity saves", () => {
    if (dodge?.effect.type !== "apply_effect") {
      throw new Error("expected effect");
    }

    expect(dodge.effect.modifiers).toEqual([
      expect.objectContaining({ target: "DEX_SAVE", type: "advantage" }),
    ]);
  });

  it("flags that attacks against you are made at disadvantage", () => {
    if (dodge?.effect.type !== "apply_effect") {
      throw new Error("expected effect");
    }

    // the mirror of Reckless Attack's exposure: someone else's roll, so it is
    // surfaced as a state rather than calculated
    expect(dodge.effect.states).toContain(
      "status_attacks_against_have_disadvantage",
    );
  });

  it("lasts until the start of your next turn", () => {
    if (dodge?.effect.type !== "apply_effect") {
      throw new Error("expected effect");
    }

    expect(dodge.effect.durationType).toBe("turn_start");
  });
});

describe("Hide", () => {
  const hide = byId("action_hide");

  it("keeps you hidden past the end of your turn", () => {
    if (hide?.effect.type !== "apply_effect") throw new Error("expected effect");

    // being hidden ends when you are found, not when your turn does
    expect(hide.effect.durationType).toBe("manual");
    expect(hide.effect.states).toContain("status_hidden");
  });

  it("can be ended, since nothing else will end it", () => {
    const end = byId("action_end_hiding");

    expect(end?.activation).toBe("special");
    if (end?.effect.type !== "remove_effect") {
      throw new Error("expected a removal");
    }
    expect(end.effect.effectTag).toBe("hidden");
  });
});

describe("actions the engine does not model", () => {
  it.each(["action_disengage", "action_help", "action_ready", "action_search", "action_use_object"])(
    "%s costs the action and claims nothing more",
    (id) => {
      expect(byId(id)?.effect.type).toBe("no_effect");
    },
  );
});
