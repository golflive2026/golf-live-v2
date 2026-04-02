import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player, RosterPlayer } from "@shared/schema";
import { BarChart3, Link } from "lucide-react";

interface ClaimProfileProps {
  player: Player;
  gameId: number;
}

export default function ClaimProfile({ player, gameId }: ClaimProfileProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [linking, setLinking] = useState(false);

  // Player already linked to roster → show Stats link
  if (player.rosterId) {
    return (
      <button
        onClick={() => navigate(`/stats/${player.rosterId}`)}
        className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:underline"
      >
        <BarChart3 className="w-3.5 h-3.5" />
        <span>Stats</span>
      </button>
    );
  }

  // Fetch roster to find matching entry for old/unlinked players
  const { data: rosterList } = useQuery<RosterPlayer[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/roster");
      return res.json();
    },
  });

  const rosterEntry = rosterList?.find(
    r => r.name.toLowerCase() === player.name.toLowerCase()
  );

  // Link this old game-player to their roster entry
  const handleLink = async () => {
    if (!rosterEntry) return;
    setLinking(true);
    try {
      await apiRequest("POST", `/api/roster/${rosterEntry.id}/claim`, {
        playerId: player.id,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });
      toast({ title: `${player.name} linked to profile` });
    } catch {
      toast({ title: "Failed to link", variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs px-2.5"
      onClick={handleLink}
      disabled={linking || !rosterEntry}
    >
      <Link className="w-3.5 h-3.5 mr-1" />
      {linking ? "..." : "Link"}
    </Button>
  );
}
