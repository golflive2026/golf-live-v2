import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type CourseData, type Game, type Player, type Score, type Achievement, getStablefordPoints } from "@shared/schema";
import { getScoreLabel, getStrokesForHole, getNetScoreForHole, buildScoresMap } from "@/lib/golf";
import { playScoreSound } from "@/lib/sounds";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Minus, Plus, Ruler, Target } from "lucide-react";

interface Props {
  game: Game;
  players: Player[];
  scores: Score[];
  selectedPlayerId: number | null;
  onSelectPlayer: (id: number) => void;
  course: CourseData;
  achievements?: Achievement[];
}

export default function ScoreEntry({ game, players, scores, selectedPlayerId, onSelectPlayer, course, achievements }: Props) {
  const [currentHole, setCurrentHole] = useState(1);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const scoresMap = useMemo(() => buildScoresMap(scores), [scores]);
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
      await queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
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
                {game.gameMode === "stableford" && grossScore && (
                  <div className="text-xs font-bold mt-1">
                    {(() => {
                      const net = getNetScoreForHole(grossScore, player?.handicap ?? 0, currentHole - 1, course);
                      const pts = net !== null ? getStablefordPoints(net, par) : null;
                      return pts !== null ? (
                        <span className={pts >= 3 ? "text-green-600" : pts === 2 ? "text-muted-foreground" : pts === 1 ? "text-orange-500" : "text-red-500"}>
                          {pts} pts
                        </span>
                      ) : null;
                    })()}
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
            {/* Clear score button */}
            {grossScore && (
              <button
                onClick={async () => {
                  if (!player || !confirm("Clear this hole's score?")) return;
                  try {
                    await apiRequest("DELETE", `/api/scores/${game.id}/${player.id}/${currentHole}`);
                    queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
                    toast({ title: `Hole ${currentHole} cleared` });
                  } catch (e: any) { toast({ title: "Clear failed", description: e.message, variant: "destructive" }); }
                }}
                className="text-[10px] text-muted-foreground hover:text-destructive transition-colors mt-2"
              >
                Clear this hole
              </button>
            )}
          </div>

          {/* Longest Drive — winner buttons + distance per player */}
          {isLongestDrive && (() => {
            const ldWinner = scores.find(s => s.hole === currentHole && s.longestDrive && s.longestDrive >= 999);
            const setLdWinner = async (winnerId: number) => {
              const alreadyWinner = ldWinner?.playerId === winnerId;
              try {
                // Clear ALL LD values on this hole for clean state
                const clearPromises = players
                  .filter(pl => scores.find(s => s.playerId === pl.id && s.hole === currentHole)?.longestDrive)
                  .map(pl => apiRequest("POST", "/api/scores", { gameId: game.id, playerId: pl.id, hole: currentHole, longestDrive: null }));
                await Promise.all(clearPromises);
                // Set new winner (or deselect if same player tapped again)
                if (!alreadyWinner) {
                  await apiRequest("POST", "/api/scores", { gameId: game.id, playerId: winnerId, hole: currentHole, longestDrive: 999 });
                }
                await queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
                toast({ title: alreadyWinner ? "LD cleared" : `LD: ${players.find(p => p.id === winnerId)?.name}` });
              } catch (e: any) { toast({ title: "LD save failed", description: e.message, variant: "destructive" }); }
            };
            return (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Ruler className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Longest Drive</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Tap winner (all players in bet) · tap again to clear:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {players.map(p => (
                      <button key={p.id} onClick={() => setLdWinner(p.id)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          ldWinner?.playerId === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <details className="text-sm">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer">Or enter distances per player (exclude non-participants)</summary>
                  <div className="space-y-2 mt-2">
                    {players.map(p => {
                      const ps = scores.find(s => s.playerId === p.id && s.hole === currentHole);
                      const dist = ps?.longestDrive && ps.longestDrive < 999 ? ps.longestDrive : null;
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="text-xs font-medium w-20 truncate">{p.name}</span>
                          <Input type="number" placeholder="meters" defaultValue={dist ?? ""}
                            key={`ld-${p.id}-${currentHole}-${dist}`}
                            onBlur={e => {
                              const val = e.target.value ? parseFloat(e.target.value) : null;
                              apiRequest("POST", "/api/scores", { gameId: game.id, playerId: p.id, hole: currentHole, longestDrive: val });
                              queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
                            }}
                            className="h-10 text-sm flex-1" min={0} step={1} />
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            );
          })()}

          {/* Closest to Pin — winner buttons + distance per player */}
          {isClosestPin && (() => {
            const ctpWinner = scores.find(s => s.hole === currentHole && s.closestPin && s.closestPin >= 999);
            const setCtpWinner = async (winnerId: number) => {
              const alreadyWinner = ctpWinner?.playerId === winnerId;
              try {
                const clearPromises = players
                  .filter(pl => scores.find(s => s.playerId === pl.id && s.hole === currentHole)?.closestPin)
                  .map(pl => apiRequest("POST", "/api/scores", { gameId: game.id, playerId: pl.id, hole: currentHole, closestPin: null }));
                await Promise.all(clearPromises);
                if (!alreadyWinner) {
                  await apiRequest("POST", "/api/scores", { gameId: game.id, playerId: winnerId, hole: currentHole, closestPin: 999 });
                }
                await queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
                toast({ title: alreadyWinner ? "CTP cleared" : `CTP: ${players.find(p => p.id === winnerId)?.name}` });
              } catch (e: any) { toast({ title: "CTP save failed", description: e.message, variant: "destructive" }); }
            };
            return (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-accent-foreground" />
                  <span className="text-sm font-medium">Closest to Pin</span>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Tap winner (all players in bet) · tap again to clear:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {players.map(p => (
                      <button key={p.id} onClick={() => setCtpWinner(p.id)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          ctpWinner?.playerId === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <details className="text-sm">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer">Or enter distances per player (exclude non-participants)</summary>
                  <div className="space-y-2 mt-2">
                    {players.map(p => {
                      const ps = scores.find(s => s.playerId === p.id && s.hole === currentHole);
                      const dist = ps?.closestPin && ps.closestPin < 999 ? ps.closestPin : null;
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="text-xs font-medium w-20 truncate">{p.name}</span>
                          <Input type="number" placeholder="cm" defaultValue={dist ?? ""}
                            key={`cp-${p.id}-${currentHole}-${dist}`}
                            onBlur={e => {
                              const val = e.target.value ? parseFloat(e.target.value) : null;
                              apiRequest("POST", "/api/scores", { gameId: game.id, playerId: p.id, hole: currentHole, closestPin: val });
                              queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
                            }}
                            className="h-10 text-sm flex-1" min={0} step={1} />
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {game.gameMode === "action" && player && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Achievements</p>

            {/* Auto-detected badges */}
            {grossScore && (
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const net = getNetScoreForHole(grossScore, player.handicap, currentHole - 1, course);
                  const currentAchBadge = achievements?.find(a => a.playerId === player.id && a.hole === currentHole);
                  if (net === null) return null;
                  const diff = net - par;

                  // Bounce Back: previous hole NET was double bogey+ and current NET is par or better
                  const prevHole = currentHole - 1;
                  let isBounceBack = false;
                  if (prevHole >= 1) {
                    const prevScore = playerScores?.get(prevHole);
                    if (prevScore?.grossScore) {
                      const prevNet = getNetScoreForHole(prevScore.grossScore, player.handicap, prevHole - 1, course);
                      const prevPar = course.holePars[prevHole - 1];
                      if (prevNet !== null && (prevNet - prevPar) >= 2 && diff <= 0) {
                        isBounceBack = true;
                      }
                    }
                  }

                  // Foozle: greenie/CTP toggled but NET > par
                  const isFoozle = (currentAchBadge?.greenie || currentAchBadge?.closestPinWon) && diff > 0;

                  return (
                    <>
                      {diff <= -3 && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">Albatross!</span>}
                      {diff === -2 && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold">Eagle</span>}
                      {diff === -1 && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">Birdie</span>}
                      {diff >= 2 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-bold">Double+</span>}
                      {grossScore === 1 && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold">Hole-in-One!</span>}
                      {grossScore >= 8 && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs font-bold">Snowman</span>}
                      {isBounceBack && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-bold">Bounce Back</span>}
                      {isFoozle && <span className="px-2 py-0.5 rounded-full bg-red-200 text-red-900 text-xs font-bold">Foozle</span>}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Manual achievement toggles */}
            {(() => {
              const currentAch = achievements?.find(a => a.playerId === player.id && a.hole === currentHole);
              const saveAchievement = async (data: Record<string, number>) => {
                if (!player) return;
                await apiRequest("POST", "/api/achievements", {
                  gameId: game.id, playerId: player.id, hole: currentHole, ...data,
                });
                queryClient.invalidateQueries({ queryKey: ["/api/games", game.id, "full"] });
              };

              const isPar3 = course.par3Holes.includes(currentHole);
              const isLdHole = course.longestDriveHoles.includes(currentHole);
              const isPar5 = par === 5;

              const allToggles: Array<{ key: string; label: string; emoji: string; show: boolean; spacer?: boolean }> = [
                // Row 1: Always visible
                { key: "polie", label: "Polie", emoji: "\u26f3", show: true },
                { key: "sandy", label: "Sandy", emoji: "\u26f1\ufe0f", show: true },
                { key: "chipIn", label: "Chip-in", emoji: "\ud83c\udfaf", show: true },
                { key: "goldenFerret", label: "Ferret", emoji: "\ud83c\udfc6", show: true },
                // Row 2: Always visible
                { key: "barkie", label: "Barkie", emoji: "\ud83c\udf32", show: true },
                { key: "sharkie", label: "Sharkie", emoji: "\ud83e\udd88", show: true },
                { key: "arnie", label: "Arnie", emoji: "\ud83c\udfa9", show: true },
                { key: "hogan", label: "Hogan", emoji: "\ud83c\udfaf", show: true },
                // Row 3: Always visible
                { key: "threePutt", label: "3-putt", emoji: "\u21a9\ufe0f", show: true },
                { key: "fourPutt", label: "4-putt", emoji: "\ud83d\udc80", show: true },
                { key: "mole", label: "Mole", emoji: "\ud83d\udd73\ufe0f", show: true },
                { key: "_spacer1", label: "", emoji: "", show: true, spacer: true },
                // Row 4: Conditional
                { key: "greenie", label: "Greenie", emoji: "\ud83d\udfe2", show: isPar3 },
                { key: "closestPinWon", label: "CTP", emoji: "\ud83d\udccd", show: isPar3 },
                { key: "longestDriveWon", label: "LD", emoji: "\ud83d\udcaa", show: isLdHole },
                { key: "tigerLd", label: "Tiger", emoji: "\ud83d\udc2f", show: isPar5 },
                // Row 5: Always visible
                { key: "water", label: "Water", emoji: "\ud83d\udca7", show: true },
                { key: "ob", label: "OB", emoji: "\u26a0\ufe0f", show: true },
              ];

              const visibleToggles = allToggles.filter(t => t.show);

              return (
                <div className="grid grid-cols-4 gap-1.5">
                  {visibleToggles.map(t =>
                    t.spacer ? (
                      <div key={t.key} />
                    ) : (
                      <button
                        key={t.key}
                        onClick={() => saveAchievement({ [t.key]: (currentAch as any)?.[t.key] ? 0 : 1 })}
                        className={`flex flex-col items-center justify-center min-h-[44px] rounded-lg transition-all ${
                          (currentAch as any)?.[t.key]
                            ? "bg-primary/20 text-primary ring-1 ring-primary"
                            : "bg-muted/50 text-muted-foreground"
                        }`}
                      >
                        <span className="text-lg">{t.emoji}</span>
                        <span className="text-[9px] leading-tight">{t.label}</span>
                      </button>
                    )
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

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
