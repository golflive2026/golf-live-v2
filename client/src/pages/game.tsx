import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGameData } from "@/hooks/use-game-data";
import { getCourse } from "@shared/schema";
import ScoreEntry from "@/components/score-entry";
import QuickScore from "@/components/quick-score";
import PaceTimer from "@/components/pace-timer";
import Leaderboard from "@/components/leaderboard";
import Bets from "@/components/bets";
import Settlement from "@/components/settlement";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClipboardCopy, Flag, Trophy, DollarSign, Receipt, Share2, Users, Clock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Tab = "quick" | "score" | "leaderboard" | "bets" | "settlement";

export default function GamePage() {
  const [matched, params] = useRoute("/game/:id");
  const [, navigate] = useLocation();
  const gameId = matched ? Number(params!.id) : 0;
  const { data, isLoading, error } = useGameData(gameId);
  const [tab, setTab] = useState<Tab>("quick");
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [showPace, setShowPace] = useState(false);
  const { toast } = useToast();

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
  const course = getCourse(game.courseId);

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
    const text = `Join our golf game "${game.name}" at ${course.name}!\nCode: ${game.code}\n${url}`;
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

  const finishGame = async () => {
    try {
      await apiRequest("POST", `/api/games/${game.id}/finish`);
      toast({ title: "Game finished!" });
    } catch (e) {
      console.error("Finish failed", e);
    }
  };

  const totalHolesScored = players.length > 0
    ? Math.min(...players.map(p => {
        let count = 0;
        for (const s of scores) { if (s.playerId === p.id && s.grossScore != null) count++; }
        return count;
      }))
    : 0;

  const tabs: { key: Tab; label: string; icon: typeof Flag }[] = [
    { key: "quick", label: "Quick", icon: Users },
    { key: "score", label: "Detail", icon: Flag },
    { key: "leaderboard", label: "Board", icon: Trophy },
    { key: "bets", label: "Bets", icon: DollarSign },
    { key: "settlement", label: "Settle", icon: Receipt },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate("/")} data-testid="button-home">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold truncate" data-testid="text-game-name">{game.name}</h1>
            <p className="text-xs text-muted-foreground">{course.name} · {game.date} · {players.length} players</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${showPace ? "text-primary" : ""}`}
              onClick={() => setShowPace(!showPace)}
              data-testid="button-pace"
            >
              <Clock className="w-4 h-4" />
            </Button>
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
            {game.status === "active" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-600"
                onClick={finishGame}
                data-testid="button-finish"
                title="Finish game"
              >
                <CheckCircle2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {showPace && <PaceTimer gameId={game.id} currentHole={1} />}

        {tab === "quick" && (
          <QuickScore game={game} players={players} scores={scores} course={course} />
        )}
        {tab === "score" && (
          <ScoreEntry
            game={game}
            players={players}
            scores={scores}
            selectedPlayerId={selectedPlayerId}
            onSelectPlayer={setSelectedPlayerId}
            course={course}
          />
        )}
        {tab === "leaderboard" && (
          <Leaderboard players={players} scores={scores} course={course} />
        )}
        {tab === "bets" && (
          <Bets game={game} players={players} scores={scores} course={course} />
        )}
        {tab === "settlement" && (
          <Settlement game={game} players={players} scores={scores} course={course} />
        )}
      </div>

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
