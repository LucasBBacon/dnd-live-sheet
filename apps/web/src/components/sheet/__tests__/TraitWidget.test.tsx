import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { create } from "zustand";
import type { FixedProficiencyGrant } from "@project/shared";

type TraitGrant = { id: string; traitId: string; source: string };

type FakeStoreState = {
  initialize: (payload: Partial<FakeStoreState>) => void;
  activeModifiers: unknown[];
  id: string;
  campaignId: string | null;
  level: number;
  classLevels: Record<string, number>;
  ruleSnapshot: { traitsById: Record<string, unknown> } | null;
  raceId: string | null;
  subraceId: string | null;
  currentHp: number;
  maxHp: number;
  inventory: unknown[];
  resources: unknown[];
  traitGrants: TraitGrant[];
  getProficiencyGrants: () => FixedProficiencyGrant[];
};

// A real zustand store, not a bare selector stub: this is what makes the
// test able to reproduce the bug. `initialize` merges a partial the way the
// real store's `initialize` does (`{...state, ...payload}`), which keeps
// `getProficiencyGrants` the SAME function reference across the update -
// exactly the condition that starved the widget's old
// `useMemo(() => getProficiencyGrants(), [getProficiencyGrants])`.
const buildStore = () =>
  create<FakeStoreState>()((set, get) => ({
    initialize: (payload) => set((state) => ({ ...state, ...payload })),
    activeModifiers: [],
    id: "char_1",
    campaignId: null,
    level: 1,
    classLevels: {},
    ruleSnapshot: null,
    raceId: null,
    subraceId: null,
    currentHp: 10,
    maxHp: 10,
    inventory: [],
    resources: [],
    traitGrants: [],
    // Stands in for the real store method, which derives grants from
    // ruleSnapshot/classLevels/traitGrants via toCharacterSave. Keying this
    // off traitGrants is enough to exercise the same failure shape: the
    // widget already subscribes to traitGrants directly, so a real
    // re-render happens on hydration - the bug is that the memoized count
    // never reflects it.
    getProficiencyGrants: () =>
      get().traitGrants.map((grant) => ({
        category: "weapons",
        proficiencyId: grant.traitId,
        level: "proficient",
        requiredStates: [],
      })) as FixedProficiencyGrant[],
  }));

let useFakeStore: ReturnType<typeof buildStore>;

const mocks = vi.hoisted(() => ({
  queryData: {
    current: null as { character: { id: string } } | null,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: mocks.queryData.current,
    isLoading: mocks.queryData.current === null,
    isError: false,
  }),
}));

vi.mock("../../../hooks/useCharacterStats", () => ({
  useAbilities: () => ({
    finalAbilities: {
      STR: { score: 10, modifier: 0 },
    },
    totalMods: [],
  }),
  useDerivedStats: () => ({
    profBonus: 2,
    maxHp: { total: 10 },
    initiative: { total: 0 },
    armorClass: { total: 10 },
  }),
}));

const postHydrationGrants: TraitGrant[] = [
  { id: "grant_1", traitId: "trait_martial_weapons", source: "class" },
  { id: "grant_2", traitId: "trait_heavy_armor", source: "class" },
];

vi.mock("../../../pages/characterSheetRouteData", () => ({
  fetchCharacterSheet: vi.fn(async () => ({
    character: { id: "char_1" },
    ruleSnapshot: null,
  })),
  // The real implementation resolves the rule pack asynchronously and then
  // calls `initialize` with the character's actual traits/race/class -
  // arriving strictly after first mount. Mirrors that ordering here.
  hydrateCharacterSheetWithRules: (
    initializeStore: FakeStoreState["initialize"],
  ) => {
    initializeStore({
      ruleSnapshot: { traitsById: {} },
      classLevels: { class_fighter: 1 },
      raceId: "race_human",
      subraceId: null,
      traitGrants: postHydrationGrants,
    });
  },
}));

vi.mock("../../../store/characterSheetStore", () => ({
  useCharacterSheetStore: (selector: (state: FakeStoreState) => unknown) =>
    useFakeStore(selector),
}));

import { TraitWidget } from "../TraitWidget";

const renderWidget = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<TraitWidget />);
  });

  return container;
};

describe("TraitWidget held proficiencies", () => {
  it("reports the character's real proficiency count once hydration completes", async () => {
    useFakeStore = buildStore();
    mocks.queryData.current = { character: { id: "char_1" } };

    const container = await renderWidget();

    // Hydration (and the resulting traitGrants update) has already run
    // inside the act() above. The panel must reflect the two grants that
    // arrived post-mount, not the empty snapshot from before hydration.
    expect(container.textContent).toContain("Trait Grants: 2");
    expect(container.textContent).toContain("Proficiencies: 2");
    expect(container.textContent).not.toContain("Proficiencies: 0");
  });

  it("shows the class ledger's total level, not the level column (#109)", async () => {
    useFakeStore = buildStore();
    // a drifted column; hydration below brings a fighter 1 ledger
    useFakeStore.setState({ level: 5 });
    mocks.queryData.current = { character: { id: "char_1" } };

    const container = await renderWidget();

    expect(container.textContent).toContain("Level: 1");
    expect(container.textContent).not.toContain("Level: 5");
  });
});
