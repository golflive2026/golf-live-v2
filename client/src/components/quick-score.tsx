import { useState, useCallback, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type CourseData, type Game, type Player, type Score, getStrokesForHole } from "@shared/schema";
import { buildScoresMap, getScoreLabel, getScoreBgClass } from "@/lib/golf";
import { playScoreSound } from "@/lib/sounds";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

interface Props {
  game: Game;
  players: Player[];
  scores: Score[];
  course: CourseData;
}

export default function QuickScore({ game, players, scores, course }: Props) {
  const [currentHole, setCurrentHole] = useState(() => {
    const scoresMap = buildScoresMap(scores);
    for (let h = 1; h <= 18; h++) {
      const allScored = players.every(p => scoresMap.get(p.id)?.get(h)?.grossScore != null);
      if (!allScored) return h;
    }
    return 18;
  });

  const scoresMap = buildScoresMap(scores);
  const par = course.holePars[currentHole - 1];
  const hcpIndex = course.holeHcp[currentHole - 1];
  const prevAllScoredRef = useRef(false);

  const allScoredThisHole = players.every(p => scoresMap.get(p.id)?.get(currentHole)?.grossScore != null);
  const scoredCount = players.filter(p => scoresMap.get(p.id)?.get(currentHole)?.grossScore != null).length;

  // Auto-advance to next hole when all players scored
  useEffect(() => {
    if (allScoredThisHole && !prevAllScoredRef.current && currentHole < 18) {
      const timer = setTimeout(() => setCurrentHole(currentHole + 1), 800);
      return () => clearTimeout(timer);
    }
    prevAllScoredRef.current = allScoredThisHole;
  }, [allScoredThisHole, currentHole]);

  const saveScore = useCallback(async (playerId: number, grossScore: number) => {
    try {
      await apiRequest("POST", "/api/scores", {
        gameId: game.id,
        playerId,
        hole: currentHole,
        grossScore,
      });
      playScoreSound(grossScore, par);
      await queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
    } catch (e) {
      console.error("Save failed", e);
    }
  }, [game.id, currentHole, par]);

  const quickValues = [par - 2, par - 1, par, par + 1, par + 2, par + 3].filter(v => v >= 1);

  return (
    <div className="space-y-3">
      {/* Hole navigation strip */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {Array.from({ length: 18 }, (_, i) => {
          const h = i + 1;
          const allScored = players.every(p => scoresMap.get(p.id)?.get(h)?.grossScore != null);
          const active = h === currentHole;
          return (
            <button
              key={h}
              onClick={() => setCurrentHole(h)}
              className={`shrink-0 w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                active ? "golf-gradient text-white scale-110" : allScored ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {h}
            </button>
          );
        })}
      </div>

      {/* Hole header */}
      <Card className="border-border overflow-hidden">
        <div className="golf-gradient px-4 py-2.5 flex items-center justify-between">
          <div>
            <span className="text-white text-base font-bold">Hole {currentHole}</span>
            <span className="text-white/70 text-xs ml-2">Par {par} · HCP {hcpIndex}</span>
          </div>
          <div className="flex items-center gap-2">
            {allScoredThisHole && currentHole < 18 && (
              <span className="text-[10px] text-white/80 bg-white/20 px-2 py-0.5 rounded-full animate-pulse">
                Next...
              </span>
            )}
            <span className="text-white/70 text-xs">{scoredCount}/{players.length}</span>
          </div>
        </div>
      </Card>

      {/* Quick score labels */}
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `1fr repeat(${quickValues.length}, 2.5rem)` }}>
        <div className="text-[10px] text-muted-foreground font-medium px-2">Player</div>
        {quickValues.map(v => (
          <div key={v} className="text-center text-[10px] text-muted-foreground font-medium">
            {v === par ? "Par" : v < par ? v - par : "+" + (v - par)}
          </div>
        ))}
      </div>

      {/* Player rows */}
      {players.map(player => {
        const existing = scoresMap.get(player.id)?.get(currentHole)?.grossScore ?? null;
        const strokes = getStrokesForHole(player.handicap, course.holeHcp[currentHole - 1]);
        return (
          <div
            key={player.id}
            className={`grid gap-0.5 items-center rounded-lg py-1 transition-colors ${existing != null ? "opacity-70" : ""}`}
            style={{ gridTemplateColumns: `1fr repeat(${quickValues.length}, 2.5rem)` }}
          >
            <div className="flex items-center gap-1 px-2 min-w-0">
              {existing != null ? (
                <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
              ) : (
                <div className="w-3.5 shrink-0" />
              )}
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block">{player.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  HCP {player.handicap}
                  {strokes > 0 && <span className="text-primary font-semibold ml-1">+{strokes}</span>}
                </span>
              </div>
              {existing != null && (
                <span className={`text-xs font-bold shrink-0 ml-auto ${
                  existing < par ? "score-birdie" : existing === par ? "score-par" : "score-bogey"
                }`}>
                  {existing}
                </span>
              )}
            </div>
            {quickValues.map(v => (
              <button
                key={v}
                onClick={() => saveScore(player.id, v)}
                className={`h-10 rounded-md text-sm font-bold transition-all ${
                  existing === v
                    ? "golf-gradient text-white ring-2 ring-primary/50"
                    : `bg-muted/60 hover:bg-muted active:scale-95 ${
                        v < par ? "text-green-600 dark:text-green-400" : v === par ? "text-foreground" : "text-red-500"
                      }`
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        );
      })}

      {/* Hole navigation */}
      <div className="flex gap-3 pt-2">
        <Button
          variant="secondary"
          className="flex-1 h-11"
          onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
          disabled={currentHole === 1}
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Hole {currentHole - 1 || ""}
        </Button>
        <Button
          className="flex-1 h-11 golf-gradient text-white border-0"
          onClick={() => setCurrentHole(Math.min(18, currentHole + 1))}
          disabled={currentHole === 18}
        >
          Hole {currentHole + 1 > 18 ? "" : currentHole + 1}
          <ChevronRight className="w-5 h-5 ml-1" />
        </Button>
      </div>
    </div>
  );
}
