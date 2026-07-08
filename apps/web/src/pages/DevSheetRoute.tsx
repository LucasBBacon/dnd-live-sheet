import { useEffect } from "react";
import type {
  OperationalInventoryItem,
  OperationalResource,
  ProficiencyLevel,
} from "@project/engine";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { DashboardLayout } from "../components/sheet/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../api/client";

const DEV_FIXTURE_CHARACTER_ID = "00000000-0000-0000-0000-000000000101";

type DevFixtureCharacterResponse = {
  character: {
    id: string;
    campaignId: string;
    level: number;
    classLevels: Record<string, number>;
    raceId: string | null;
    subraceId: string | null;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    inventory?: OperationalInventoryItem[];
    proficiencies?: Record<string, ProficiencyLevel>;
    currentHp: number;
    maxHp: number;
    resources?: OperationalResource[];
  };
};

export const DevSheetRoute = () => {
  const initializeStore = useCharacterSheetStore((state) => state.initialize);

  const { data, isLoading, isError } = useQuery<DevFixtureCharacterResponse>({
    queryKey: ["character", "dev-fixture", DEV_FIXTURE_CHARACTER_ID],
    queryFn: () => apiClient(`/character/${DEV_FIXTURE_CHARACTER_ID}`),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  useEffect(() => {
    if (!data?.character) {
      return;
    }

    initializeStore({
      id: data.character.id,
      campaignId: data.character.campaignId,
      level: data.character.level || 1,
      classLevels: data.character.classLevels || {},
      raceId: data.character.raceId ?? null,
      subraceId: data.character.subraceId ?? null,
      baseScores: {
        str: data.character.str,
        dex: data.character.dex,
        con: data.character.con,
        int: data.character.int,
        wis: data.character.wis,
        cha: data.character.cha,
      },
      inventory: data.character.inventory || [],
      proficiencies: data.character.proficiencies || {},
      currentHp: data.character.currentHp,
      maxHp: data.character.maxHp,
      resources: data.character.resources || [],
    });
  }, [data, initializeStore]);

  if (isLoading) return <div>Booting dev fixture...</div>;

  if (isError || !data?.character) {
    return (
      <div className="p-4 text-sm text-red-700">
        Failed to load dev fixture character. Ensure the server is running and
        seed data has been applied with <code>pnpm --filter @project/database db:seed</code>.
      </div>
    );
  }

  return (
    // We do NOT wrap this in LiveSheetProvider because we don't want
    // our local dev tests firing off WebSockets to a non-existent room.
    <DashboardLayout />
  );
};
