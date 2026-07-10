import { useEffect } from "react";
import { useCharacterSheetStore } from "../store/characterSheetStore";
import { DashboardLayout } from "../components/sheet/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import {
  type CharacterSheetResponse,
  fetchCharacterSheet,
  hydrateCharacterSheetWithRules,
} from "./characterSheetRouteData";

const DEV_FIXTURE_CHARACTER_ID = "00000000-0000-0000-0000-000000000101";

export const DevSheetRoute = () => {
  const initializeStore = useCharacterSheetStore((state) => state.initialize);

  const { data, isLoading, isError } = useQuery<CharacterSheetResponse>({
    queryKey: ["character", "dev-fixture", DEV_FIXTURE_CHARACTER_ID],
    queryFn: () => fetchCharacterSheet(DEV_FIXTURE_CHARACTER_ID),
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  useEffect(() => {
    if (!data?.character) {
      return;
    }

    hydrateCharacterSheetWithRules(initializeStore, data);
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
