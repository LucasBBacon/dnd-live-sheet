import { describe, expect, it } from "vitest";
import {
  CreateHomebrewItemSchema,
  CreateHomebrewTraitSchema,
  HomebrewLifecycleActionSchema,
  UpdateHomebrewItemSchema,
  UpdateHomebrewTraitSchema,
} from "../homebrew.js";

describe("homebrew schemas", () => {
  it("accepts valid trait creation payload", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      id: "trait_my_custom_trait",
      name: "My Custom Trait",
      lore: {
        shortDescription: "A short summary.",
      },
      effects: [],
      isStartingProficiency: false,
    };

    expect(CreateHomebrewTraitSchema.parse(payload)).toEqual(payload);
  });

  it("rejects non snake_case ids for homebrew trait creation", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      id: "Trait-Custom",
      name: "Invalid Trait",
      lore: { shortDescription: "x" },
      effects: [],
    };

    expect(() => CreateHomebrewTraitSchema.parse(payload)).toThrow();
  });

  it("accepts trait update payload with campaign scope", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      name: "Renamed Trait",
    };

    expect(UpdateHomebrewTraitSchema.parse(payload)).toEqual(payload);
  });

  it("accepts valid item creation payload", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      id: "item_shadowglass_dagger",
      name: "Shadowglass Dagger",
      weight: 100,
      description: "A dagger forged from shadowglass.",
      isBundle: false,
    };

    expect(CreateHomebrewItemSchema.parse(payload)).toEqual(payload);
  });

  it("rejects negative item weight", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      id: "item_bad_weight",
      name: "Bad Weight",
      weight: -1,
      description: "Nope.",
    };

    expect(() => CreateHomebrewItemSchema.parse(payload)).toThrow();
  });

  it("accepts item updates with optional fields", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
      description: "Updated description.",
    };
    expect(UpdateHomebrewItemSchema.parse(payload)).toEqual(payload);
  });

  it("requires campaign id for lifecycle actions", () => {
    const payload = {
      campaignId: "7a0c5bb8-0dc5-4c39-a58f-8f7baae6f27f",
    };
    expect(HomebrewLifecycleActionSchema.parse(payload)).toEqual(payload);
  });
});
