import type { StartingEquipmentDefinition } from "@project/shared";

export const CLASS_STARTING_EQUIPMENT = {
  
  class_bard: {
    given: [
      { kind: "item", refId: "item_armor_leather", quantity: 1 },
      { kind: "item", refId: "item_weapon_dagger", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_rapier", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_longsword", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_diplomats", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_entertainers",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_musical_instrument_lute",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_musical_instrument",
                quantity: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  class_cleric: {
    given: [
      { kind: "category", refId: "category_armor_shield", quantity: 1 },
      { kind: "category", refId: "category_holy_symbol", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_mace", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_warhammer", quantity: 1 },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_scale_mail", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_leather", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_chain_mail", quantity: 1 },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_crossbow_light",
                quantity: 1,
              },
              { kind: "item", refId: "item_ammo_bolt", quantity: 20 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_priests", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_druid: {
    given: [
      { kind: "item", refId: "item_armor_leather", quantity: 1 },
      { kind: "item", refId: "item_pack_explorers", quantity: 1 },
      { kind: "category", refId: "category_druidic_focus", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_armor_shield_wooden",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_scimitar", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple_melee",
                quantity: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  class_fighter: {
    given: [],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_chain_mail", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_leather", quantity: 1 },
              { kind: "item", refId: "item_weapon_longbow", quantity: 1 },
              { kind: "item", refId: "item_weapon_arrow", quantity: 20 },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_martial",
                quantity: 1,
              },
              {
                kind: "category",
                refId: "category_armor_shield",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_martial",
                quantity: 2,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_light_crossbow",
                quantity: 1,
              },
              {
                kind: "item",
                refId: "item_weapon_crossbow_bolt",
                quantity: 20,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_handaxe", quantity: 2 },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_dungeoneers",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_monk: {
    given: [{ kind: "item", refId: "item_weapon_dart", quantity: 10 }],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_shortsword",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_dungeoneers",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_paladin: {
    given: [
      { kind: "item", refId: "item_armor_chain_mail", quantity: 1 },
      { kind: "category", refId: "category_holy_symbol", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_martial",
                quantity: 1,
              },
              {
                kind: "category",
                refId: "category_armor_shield",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_martial",
                quantity: 2,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_javelin", quantity: 5 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple_melee",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_priests", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_ranger: {
    given: [
      { kind: "item", refId: "item_weapon_longbow", quantity: 1 },
      { kind: "item", refId: "item_weapon_arrow", quantity: 20 },
      { kind: "item", refId: "item_pack_quiver", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_scale", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_armor_leather", quantity: 1 },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_shortsword",
                quantity: 2,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 2,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_dungeoneers",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_rogue: {
    given: [
      { kind: "item", refId: "item_armor_leather", quantity: 1 },
      { kind: "item", refId: "item_weapon_dagger", quantity: 2 },
      { kind: "item", refId: "item_tool_thieves_tools", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_rapier", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_shortsword",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_shortbow", quantity: 1 },
              { kind: "item", refId: "item_weapon_arrow", quantity: 20 },
              { kind: "item", refId: "item_pack_quiver", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_shortsword",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_burglars", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_dungeoneers",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_sorcerer: {
    given: [{ kind: "item", refId: "item_weapon_dagger", quantity: 2 }],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_light_crossbow",
                quantity: 1,
              },
              {
                kind: "item",
                refId: "item_weapon_crossbow_bolt",
                quantity: 20,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_gear_component_pouch",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_arcane_focus",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_dungeoneers",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
  class_warlock: {
    given: [
      { kind: "item", refId: "item_armor_leather", quantity: 1 },
      { kind: "item", refId: "item_weapon_dagger", quantity: 2 },
      { kind: "category", refId: "category_weapon_simple", quantity: 1 },
    ],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_light_crossbow",
                quantity: 1,
              },
              {
                kind: "item",
                refId: "item_weapon_crossbow_bolt",
                quantity: 20,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_weapon_simple",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_gear_component_pouch",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_arcane_focus",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_scholars", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_pack_dungeoneers",
                quantity: 1,
              },
            ],
          },
        ],
      },
    ],
  },
  class_wizard: {
    given: [{ kind: "item", refId: "item_magic_item_spellbook", quantity: 1 }],
    choices: [
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_weapon_quarterstaff",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_weapon_dagger", quantity: 1 },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              {
                kind: "item",
                refId: "item_gear_component_pouch",
                quantity: 1,
              },
            ],
          },
          {
            equipmentBundle: [
              {
                kind: "category",
                refId: "category_arcane_focus",
                quantity: 1,
              },
            ],
          },
        ],
      },
      {
        choose: 1,
        options: [
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_scholars", quantity: 1 },
            ],
          },
          {
            equipmentBundle: [
              { kind: "item", refId: "item_pack_explorers", quantity: 1 },
            ],
          },
        ],
      },
    ],
  },
} satisfies Record<string, StartingEquipmentDefinition>;

export const BACKGROUND_STARTING_EQUIPMENT = {
  background_acolyte: {
    given: [
      { kind: "category", refId: "category_holy_symbol", quantity: 1 },
      { kind: "item", refId: "item_pack_priests", quantity: 1 },
      { kind: "item", refId: "item_incense_stick", quantity: 5 },
      { kind: "item", refId: "item_clothes_vestments", quantity: 1 },
      { kind: "item", refId: "item_clothes_common", quantity: 1 },
      { kind: "money", refId: "money_gp", quantity: 15 },
    ],
    choices: [],
  },
  background_noble: {
    given: [
      { kind: "item", refId: "item_clothes_fine", quantity: 5 },
      { kind: "item", refId: "item_ring_signet", quantity: 1 },
      { kind: "item", refId: "item_scroll_pedigree", quantity: 5 },
      { kind: "money", refId: "money_gp", quantity: 25 },
    ],
    choices: [],
  },
  background_soldier: { given: [], choices: [] },
  background_criminal: { given: [], choices: [] },
} satisfies Record<string, StartingEquipmentDefinition>;
