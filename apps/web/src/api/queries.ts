import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type {
  CharacterEngineData,
  CharacterFlavorSchema,
} from "@project/shared";
import type { z } from "zod";

// Match the database return type closely
interface HydratedCharacter {
  id: string;
  userId: string;
  totalLevel: number;
  currentHp: number;
  engineData: CharacterEngineData;
  flavorData: z.infer<typeof CharacterFlavorSchema>;
}

export const useCharacterSheet = (characterId: string) => {
  return useQuery({
    queryKey: ["character", characterId],
    queryFn: async (): Promise<HydratedCharacter> => {
      const data = await apiClient(`/character/${characterId}`);
      return data.character;
    },
    enabled: !!characterId,
    // prevent aggressive refetching while testing locally
    staleTime: 1000 * 60 * 5,
  });
};

export const useUpdateFlavor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      flavorUpdates: Partial<z.infer<typeof CharacterFlavorSchema>>,
    ) => {
      return apiClient("/character/flavor", {
        method: "PATCH",
        body: JSON.stringify(flavorUpdates),
      });
    },
    onSuccess: () => {
      // instantly invalidate the cache so the UI refreshes with new db data
      queryClient.invalidateQueries({ queryKey: ["character"] });
    },
  });
};
