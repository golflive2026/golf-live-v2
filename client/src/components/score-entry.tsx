import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type CourseData, type Game, type Player, type Score } from "@shared/schema";
import { getScoreLabel, getStrokesForHole, buildScoresMap } from "@/lib/golf";
import { playScoreSound } from "@/lib/sounds";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, Minus, Plus, Ruler, Target } from "lucide-react";

interface Props {
  game: Game;
  players: Player[];
  scores: Score[];
  selectedPlayerId: number | null;
  onSelectPlayer: (id: number) => void;
  course: CourseData;
}

export default function ScoreEntry({ game, players, scores, selectedPlayerId, onSelectPlayer, course }: Props) {
  const [currentHole, setCurrentHole] = useState(1);
  const [saving, setSaving] = useState(false);

  const scoresMap = buildScoresMap(scores);
  const player = players.find(p => p.id === selectedPlayerId);
  const playerScores = player ? scoresMap.get(player.id) : undefined;
  const currentScore = playerScores?.get(currentHole);

  const par = course.holePars[currentHole - 1];
  const hcpIndex = course.holeHcp[currentHole - 1];
  const strokesReceived = player ? getStrokesForHole(player.handicap, currentHole - 1, course) : 0;
  const isLongestDrive = course.longestDriveHoles.includes(currentHole);
  const isClosestPin = course.par3Holes.includes(currentHole);

  const grossScore = currentScore?.grossScore ?? null;
  const longestDrive = currentScore?.longestDrive ?? null;
  const closestPin = currentScore?.closestPin ?? null;

  useEffect(() => {
    if (!player || !playerScores) {
      setCurrentHole(1);
      return;
    }
    for (let h = 1; h <= 18; h++) {
      const s = playerScores.get(h);
      if (!s?.grossScore) {
        setCurrentHole(h);
        return;
      }
    }
  }, [selectedPlayerId]);

  const saveScore = useCallback(async (data: { grossScore?: number | null; longestDrive?: number | null; closestPin?: number | null }) => {
    if (!player) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/scores", {
        gameId: game.id,
        playerId: player.id,
        hole: currentHole,
        ...data,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  }, [player, game.id, currentHole]);

  const setGrossScore = (value: number) => {
    if (value < 1) return;
    playScoreSound(value, par);
    saveScore({ grossScore: value });
  };

  const holesScored = player && playerScores
    ? Array.from({ length: 18 }, (_, i) => playerScores.get(i + 1)?.grossScore != null).filter(Boolean).length
    : 0;

  return (
    <div className="space-y-4">
      <Select value={selectedPlayerId?.toString() || ""} onValueChange={v => onSelectPlayer(Number(v))}>
        <SelectTrigger className="h-12 text-base font-medium" data-testid="select-player">
          <SelectValue placeholder="Select player" />
        </SelectTrigger>
        <SelectContent>
          {players.map(p => (
            <SelectItem key={p.id} value={p.id.toString()} data-testid={`option-player-${p.id}`}>
              {p.name} (HCP {p.handicap})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {Array.from({ length: 18 }, (_, i) => {
          const h = i + 1;
          const scored = playerScores?.get(h)?.grossScore != null;
          const active = h === currentHole;
          return (
            <button
              key={h}
              data-testid={`button-hole-${h}`}
              onClick={() => setCurrentHole(h)}
              className={`shrink-0 w-9 h-9 rounded-lg text-xs font-bold transition-all ${
                active ? "golf-gradient text-white scale-110" : scored ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {h}
            </button>
          );
        })}
      </div>

      <Card className="border-border overflow-hidden">
        <div className="golf-gradient px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-white/80 text-xs font-medium">
              Hole {currentHole} · Par {par} · HCP {hcpIndex}
            </div>
            <div className="text-white text-lg font-bold">
              {currentHole <= 9 ? "Front 9" : "Back 9"}
              {strokesReceived > 0 && (
                <span className="ml-2 text-xs font-normal bg-white/20 px-2 py-0.5 rounded-full">
                  +{strokesReceived} stroke{strokesReceived > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className="text-right text-white/70 text-xs">{holesScored}/18 holes</div>
        </div>

        <CardContent className="p-5 space-y-5">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wider">Score</p>
            <div className="flex items-center justify-center gap-4">
              <Button
                data-testid="button-score-minus"
                variant="secondary"
                size="icon"
                className="h-14 w-14 rounded-full text-xl font-bold"
                onClick={() => grossScore && setGrossScore(grossScore - 1)}
                disabled={!grossScore || grossScore <= 1}
              >
                <Minus className="w-6 h-6" />
              </Button>

              <div className="w-24 text-center">
                <div className="text-5xl font-extrabold tabular-nums" data-testid="text-gross-score">
                  {grossScore ?? "-"}
                </div>
                {grossScore && (
                  <div className={`text-sm font-semibold mt-1 ${
                    grossScore < par ? "score-birdie" : grossScore === par ? "score-par" : "score-bogey"
                  }`} data-testid="text-score-label">
                    {getScoreLabel(grossScore, par)}
                  </div>
                )}
              </div>

              <Button
                data-testid="button-score-plus"
                variant="secondary"
                size="icon"
                className="h-14 w-14 rounded-full text-xl font-bold"
                onClick={() => setGrossScore((grossScore ?? par) + (grossScore ? 1 : 0))}
              >
                <Plus className="w-6 h-6" />
              </Button>
            </div>

            <div className="flex justify-center gap-2 mt-4">
              {[par - 2, par - 1, par, par + 1, par + 2, par + 3].filter(v => v >= 1).map(v => (
                <button
                  key={v}
                  data-testid={`button-quick-score-${v}`}
                  onClick={() => setGrossScore(v)}
                  className={`h-10 w-10 rounded-lg text-sm font-bold transition-all ${
                    grossScore === v ? "golf-gradient text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {isLongestDrive && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Ruler className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Longest Drive (meters)</span>
              </div>
              <Input
                data-testid="input-longest-drive"
                type="number"
                placeholder="Distance in meters"
                defaultValue={longestDrive ?? ""}
                key={`ld-${selectedPlayerId}-${currentHole}`}
                onBlur={e => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  saveScore({ longestDrive: val });
                }}
                className="h-12 text-lg"
                min={0}
                step={1}
              />
            </div>
          )}

          {isClosestPin && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-accent-foreground" />
                <span className="text-sm font-medium">Closest to Pin (cm)</span>
              </div>
              <Input
                data-testid="input-closest-pin"
                type="number"
                placeholder="Distance in cm"
                defaultValue={closestPin ?? ""}
                key={`cp-${selectedPlayerId}-${currentHole}`}
                onBlur={e => {
                  const val = e.target.value ? parseFloat(e.target.value) : null;
                  saveScore({ closestPin: val });
                }}
                className="h-12 text-lg"
                min={0}
                step={1}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          data-testid="button-prev-hole"
          variant="secondary"
          className="flex-1 h-12"
          onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
          disabled={currentHole === 1}
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Hole {currentHole - 1 || ""}
        </Button>
        <Button
          data-testid="button-next-hole"
          className="flex-1 h-12 golf-gradient text-white border-0"
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
