import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Game, Player, Score } from "@shared/schema";

export interface GameData {
  game: Game;
  players: Player[];
  scores: Score[];
}

export function useGameData(gameId: number) {
  return useQuery<GameData>({
    queryKey: ["/api/games", gameId, "full"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/games/${gameId}/full`);
      return res.json();
    },
    refetchInterval: 4000, // Poll every 4 seconds
    staleTime: 2000,
  });
}
