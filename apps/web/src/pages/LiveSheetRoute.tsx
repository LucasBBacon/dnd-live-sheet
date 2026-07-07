import { useParams } from "react-router-dom";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useQuery } from "@tanstack/react-query";
import { apiClient, MOCK_USER_ID } from "../api/client";
import { useEffect } from "react";
import { LiveSheetProvider } from "../components/sheet/LiveSheetProvider";
import { DashboardLayout } from "../components/sheet/DashboardLayout";

export const LiveSheetRoute = () => {
  const { characterId } = useParams<{ characterId: string }>();
  const initializeStore = useCharacterSheetStore((state) => state.initialize);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => apiClient(`/character/${characterId}`),
    enabled: !!characterId,
  });

  useEffect(() => {
    if (data?.character) {
      // hydrate zustand store with db payload
      initializeStore({
        id: data.character.id,
        level: data.character.level || 1,
        classLevels: data.character.classLevels || {},
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
    }
  }, [data, initializeStore]);

  if (isLoading) return <div>Booting runtime environment...</div>;
  if (isError || !data) return <div>Failed to load character matrix.</div>;

  return (
    // LiveSheetProvider joins a campaign room tied to the loaded character.
    <LiveSheetProvider
      campaignId={data.character.campaignId}
      userId={MOCK_USER_ID}
      characterId={data.character.id}
    >
      <DashboardLayout />
    </LiveSheetProvider>
  );
};
