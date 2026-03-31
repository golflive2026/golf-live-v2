import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGameData } from "@/hooks/use-game-data";
import ScoreEntry from "@/components/score-entry";
import Leaderboard from "@/components/leaderboard";
import Bets from "@/components/bets";
import Settlement from "@/components/settlement";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClipboardCopy, Flag, Trophy, DollarSign, Receipt, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Tab = "score" | "leaderboard" | "bets" | "settlement";

export default function GamePage() {
  const [matched, params] = useRoute("/game/:id");
  const [, navigate] = useLocation();
  const gameId = matched ? Number(params!.id) : 0;
  const { data, isLoading, error } = useGameData(gameId);
  const [tab, setTab] = useState<Tab>("leaderboard");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const { toast } = useToast();

  // Auto-select first player for score entry when data loads
  useEffect(() => {
    if (data?.players?.length && !selectedPlayerId) {
      setSelectedPlayerId(data.players[0].id);
    }
  }, [data?.players]);

  if (!matched) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <p className="text-destructive font-medium">Game not found</p>
          <Button variant="secondary" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  const { game, players, scores } = data;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(game.code);
      toast({ title: "Code copied!", description: game.code });
    } catch {
      toast({ title: "Game code", description: game.code });
    }
  };

  const shareGame = async () => {
    const url = window.location.href;
    const text = `Join our golf game "${game.name}" at St. Sofia Golf Club!\nCode: ${game.code}\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Golf Game: ${game.name}`, text, url });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: "Link copied!" });
      }
    } catch {
      // User cancelled share
    }
  };

  const tabs: { key: Tab; label: string; icon: typeof Flag }[] = [
    { key: "score", label: "Score", icon: Flag },
    { key: "leaderboard", label: "Board", icon: Trophy },
    { key: "bets", label: "Bets", icon: DollarSign },
    { key: "settlement", label: "Settle", icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold truncate" data-testid="text-game-name">{game.name}</h1>
            <p className="text-xs text-muted-foreground">{game.date} · {players.length} players</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 font-mono text-xs"
              onClick={copyCode}
              data-testid="button-copy-code"
            >
              <ClipboardCopy className="w-3 h-3 mr-1" />
              {game.code}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={shareGame} data-testid="button-share">
              <Share2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {tab === "score" && (
          <ScoreEntry
            game={game}
            players={players}
            scores={scores}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayerId}
          />
        )}
        {tab === "leaderboard" && (
          <Leaderboard players={players} scores={scores} />
        )}
        {tab === "bets" && (
          <Bets game={game} players={players} scores={scores} />
        )}
        {tab === "settlement" && (
          <Settlement game={game} players={players} scores={scores} />
        )}
      </div>

      {/* Bottom tab navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border">
        <div className="max-w-lg mx-auto flex">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                data-testid={`tab-${t.key}`}
                className={`flex-1 flex flex-col items-center py-2.5 transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                onClick={() => setTab(t.key)}
              >
                <Icon className={`w-5 h-5 mb-0.5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className="text-[10px] font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
