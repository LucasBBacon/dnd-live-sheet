import { useParams } from "react-router-dom";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { useQuery } from "@tanstack/react-query";
import { MOCK_USER_ID } from "../api/client";
import { useEffect } from "react";
import { LiveSheetProvider } from "../components/sheet/LiveSheetProvider";
import { DashboardLayout } from "../components/sheet/DashboardLayout";
import {
  fetchCharacterSheet,
  hydrateCharacterSheet,
} from "./characterSheetRouteData";

export const LiveSheetRoute = () => {
  const { characterId } = useParams<{ characterId: string }>();
  const initializeStore = useCharacterSheetStore((state) => state.initialize);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => fetchCharacterSheet(characterId!),
    enabled: !!characterId,
  });

  useEffect(() => {
    if (data?.character) {
      hydrateCharacterSheet(initializeStore, data.character);
    }
  }, [data, initializeStore]);

  if (isLoading) return <div>Booting runtime environment...</div>;
  if (isError || !data) return <div>Failed to load character matrix.</div>;
  if (!data.character.campaignId) {
    return <div>Character is missing campaign context.</div>;
  }

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
