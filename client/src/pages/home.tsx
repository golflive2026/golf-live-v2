import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCourse, type Game } from "@shared/schema";
import { Plus, LogIn, Flag, History, MapPin, Zap, Settings2, ChevronDown, Trash2, Users } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const { toast } = useToast();

  const { data: games } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/games");
      return res.json();
    },
    staleTime: 10000,
  });

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await apiRequest("GET", `/api/games/code/${joinCode.trim().toUpperCase()}`);
      const game = await res.json();
      navigate(`/game/${game.id}`);
    } catch {
      toast({ title: "Game not found", description: "Check the code and try again.", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  const deleteGame = async (gameId: number, gameName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${gameName}"? All scores and player data will be permanently removed.`)) return;
    try {
      // First try without PIN
      const res = await fetch(`/api/games/${gameId}`, { method: "DELETE", headers: { "Content-Type": "application/json" } });
      if (res.status === 403) {
        const data = await res.json();
        if (data.requiresPin) {
          const pin = prompt("This game has claimed players. Enter any player's PIN to delete:");
          if (!pin) return;
          const res2 = await fetch(`/api/games/${gameId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin }),
          });
          if (!res2.ok) {
            const err = await res2.json();
            toast({ title: err.error || "Failed to delete", variant: "destructive" });
            return;
          }
        } else {
          toast({ title: data.error || "Failed to delete", variant: "destructive" });
          return;
        }
      } else if (!res.ok) {
        toast({ title: "Failed to delete", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      toast({ title: "Game deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const allGames = games || [];
  const displayGames = showAll ? allGames : allGames.slice(0, 5);
  const hasMore = allGames.length > 5;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="text-center mb-10 mt-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full golf-gradient mb-4">
          <Flag className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-bold text-foreground tracking-tight" data-testid="text-app-title">
          Golf Live
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live scoring for Bulgarian golf
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <Button
              data-testid="button-classic-game"
              className="w-full h-14 text-base font-semibold golf-gradient text-white border-0 hover:opacity-90"
              onClick={() => navigate("/setup/classic")}
            >
              <Zap className="w-5 h-5 mr-2" />
              Quick Game
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">St. Sofia · Default bets · Fast setup</p>
            <Button
              data-testid="button-advanced-game"
              variant="secondary"
              className="w-full h-12 font-semibold"
              onClick={() => navigate("/setup/advanced")}
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Advanced Game
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">Choose course · Roster · Custom bets</p>
            <Button
              variant="outline"
              className="w-full h-10 font-medium text-sm"
              onClick={() => navigate("/roster")}
            >
              <Users className="w-4 h-4 mr-2" />
              Manage Roster
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">Join Existing Game</p>
            <Input
              data-testid="input-join-code"
              placeholder="Enter 6-digit code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              className="h-14 text-center text-lg font-mono tracking-widest uppercase"
              maxLength={6}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
            />
            <Button
              data-testid="button-join-game"
              variant="secondary"
              className="w-full h-12 font-semibold"
              onClick={handleJoin}
              disabled={joining || joinCode.trim().length < 4}
            >
              <LogIn className="w-4 h-4 mr-2" />
              {joining ? "Joining..." : "Join Game"}
            </Button>
          </CardContent>
        </Card>

        {allGames.length > 0 && (
          <Card className="border-border">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <History className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Recent Games</p>
              </div>
              {displayGames.map(g => {
                const c = getCourse(g.courseId);
                return (
                  <div
                    key={g.id}
                    className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => navigate(`/game/${g.id}`)}
                    data-testid={`button-game-${g.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{g.name}</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{c.name}</span>
                        <span>·</span>
                        <span>{g.date}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        g.status === "active" ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" :
                        g.status === "finished" ? "bg-muted text-muted-foreground" :
                        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                      }`}>
                        {g.status}
                      </span>
                      <button
                        onClick={(e) => deleteGame(g.id, g.name, e)}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        title="Delete game"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <Button
                  variant="ghost"
                  className="w-full h-9 text-xs text-muted-foreground"
                  onClick={() => setShowAll(!showAll)}
                >
                  <ChevronDown className={`w-4 h-4 mr-1 transition-transform ${showAll ? "rotate-180" : ""}`} />
                  {showAll ? "Show less" : `Show all ${allGames.length} games`}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        6 courses · Live leaderboard · Automatic bets
      </p>
    </div>
  );
}
