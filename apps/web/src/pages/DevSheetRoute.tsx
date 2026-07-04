import { useEffect } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { DashboardLayout } from "../components/sheet/DashboardLayout";

export const DevSheetRoute = () => {
  const initializeStore = useCharacterSheetStore((state) => state.initialize);

  useEffect(() => {
    // inject comprehensive test payload into store
    initializeStore({
      id: "dev-tester-001",
      level: 3,
      currentHp: 28,
      maxHp: 28,
      baseScores: {
        str: 16, // +3
        dex: 12, // +1
        con: 14, // +2
        int: 10, // +0
        wis: 13, // +1
        cha: 8, // -1
      },
      proficiencies: {
        athletics: "proficient",
        perception: "proficient",
        martial_melee: "proficient",
        simple_melee: "proficient",
      },
      inventory: [
        {
          id: "inv_1",
          itemId: "item_chain_mail",
          quantity: 1,
          slot: "armor",
          isAttuned: false,
        },
        {
          id: "inv_2",
          itemId: "item_longsword",
          quantity: 1,
          slot: "backpack",
          isAttuned: false,
        },
        {
          id: "inv_3",
          itemId: "item_longbow",
          quantity: 1,
          slot: "main_hand",
          isAttuned: false,
        },
        {
          id: "inv_4",
          itemId: "item_shield",
          quantity: 1,
          slot: "off_hand",
          isAttuned: false,
        },
        {
          id: "inv_5",
          itemId: "item_potion_of_healing",
          quantity: 2,
          slot: "backpack",
          isAttuned: false,
        },
        {
          id: "inv_6",
          itemId: "item_arrow",
          quantity: 5,
          slot: "backpack",
          isAttuned: false,
        },
      ],
      resources: [
        {
          id: "hd_d6",
          name: "Hit Dice: d6",
          current: 1,
          max: 1,
          resetCondition: "long_rest",
        },
      ],
    });
  }, [initializeStore]);

  return (
    // We do NOT wrap this in LiveSheetProvider because we don't want
    // our local dev tests firing off WebSockets to a non-existent room.
    <DashboardLayout />
  );
};
