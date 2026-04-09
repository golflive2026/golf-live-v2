import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type CourseData, type Game, type Player, type Score, type Achievement, DEFAULT_DOTS } from "@shared/schema";
import {
  computeLeaderboard,
  computeMatchPlay,
  computeBirdieEagle,
  computeSpecialBets,
  computeStablefordLeaderboard,
  computeStablefordMatchPlay,
  computeActionDots,
  type DotConfig,
  type ActionDotEntry,
} from "@/lib/golf";
import { Ruler, Target } from "lucide-react";

interface Props {
  game: Game;
  players: Player[];
  scores: Score[];
  course: CourseData;
  achievements?: Achievement[];
}

function MoneyDisplay({ amount, size = "sm" }: { amount: number; size?: "sm" | "lg" }) {
  const color = amount > 0 ? "text-green-600 dark:text-green-400" : amount < 0 ? "text-red-500" : "text-muted-foreground";
  const prefix = amount > 0 ? "+" : "";
  const cls = size === "lg" ? "text-base font-bold" : "text-sm font-semibold";
  return <span className={`${color} ${cls} tabular-nums`}>{prefix}{amount.toFixed(0)}</span>;
}

export default function Bets({ game, players, scores, course, achievements }: Props) {
  const [activeTab, setActiveTab] = useState("match");

  if (players.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No players yet</div>;
  }

  // Action/Dots mode — completely different view
  if (game.gameMode === "action") {
    const dotConfig: DotConfig = Object.fromEntries(
      Object.keys(DEFAULT_DOTS).map(k => [k, (game as any)[k] ?? (DEFAULT_DOTS as any)[k]])
    ) as DotConfig;
    const dotEntries = useMemo(() => computeActionDots(players, scores, achievements ?? [], dotConfig, course), [players, scores, achievements, dotConfig, course]);
    const dotValue = game.dotValue ?? DEFAULT_DOTS.dotValue;

    return (
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground mb-2">
          Dot value: {dotValue} per dot per player · Pairwise settlement
        </div>

        {dotEntries.map((entry, idx) => (
          <Card key={entry.playerId} className={`border-border ${idx === 0 && entry.totalDots > 0 ? "border-l-2 border-l-primary" : ""}`} data-testid={`card-dots-${entry.playerId}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{entry.playerName}</span>
                <span className="text-lg font-extrabold tabular-nums">{entry.totalDots} dots</span>
              </div>

              <div className="grid grid-cols-4 gap-1 text-center text-[10px] mb-3">
                {entry.breakdown.birdies > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Birdies</div>
                    <div className="font-bold">{entry.breakdown.birdies}</div>
                  </div>
                )}
                {entry.breakdown.eagles > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Eagles</div>
                    <div className="font-bold">{entry.breakdown.eagles}</div>
                  </div>
                )}
                {entry.breakdown.albatrosses > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Albatross</div>
                    <div className="font-bold">{entry.breakdown.albatrosses}</div>
                  </div>
                )}
                {entry.breakdown.sandies > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Sandies</div>
                    <div className="font-bold">{entry.breakdown.sandies}</div>
                  </div>
                )}
                {entry.breakdown.chipIns > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Chip-ins</div>
                    <div className="font-bold">{entry.breakdown.chipIns}</div>
                  </div>
                )}
                {entry.breakdown.greenies > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Greenies</div>
                    <div className="font-bold">{entry.breakdown.greenies}</div>
                  </div>
                )}
                {entry.breakdown.longestDrives > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">LD</div>
                    <div className="font-bold">{entry.breakdown.longestDrives}</div>
                  </div>
                )}
                {entry.breakdown.closestPins > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">CP</div>
                    <div className="font-bold">{entry.breakdown.closestPins}</div>
                  </div>
                )}
                {entry.breakdown.doubleBogeys > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Dbl Bog</div>
                    <div className="font-bold text-red-500">{entry.breakdown.doubleBogeys}</div>
                  </div>
                )}
                {entry.breakdown.threePutts > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">3-Putt</div>
                    <div className="font-bold text-red-500">{entry.breakdown.threePutts}</div>
                  </div>
                )}
                {entry.breakdown.waters > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">Water</div>
                    <div className="font-bold text-red-500">{entry.breakdown.waters}</div>
                  </div>
                )}
                {entry.breakdown.obs > 0 && (
                  <div className="bg-muted rounded px-1 py-0.5">
                    <div className="text-muted-foreground">OB</div>
                    <div className="font-bold text-red-500">{entry.breakdown.obs}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-9 gap-0.5 text-center text-[9px]">
                {entry.holeDots.slice(0, 9).map(h => (
                  <div key={h.hole} className="text-muted-foreground font-medium">{h.hole}</div>
                ))}
                {entry.holeDots.slice(0, 9).map(h => (
                  <div key={h.hole} className={`font-bold rounded py-0.5 ${h.total > 0 ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20" : h.total < 0 ? "text-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}>
                    {h.total !== 0 ? (h.total > 0 ? "+" : "") + h.total : "-"}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-9 gap-0.5 text-center text-[9px] mt-1">
                {entry.holeDots.slice(9, 18).map(h => (
                  <div key={h.hole} className="text-muted-foreground font-medium">{h.hole}</div>
                ))}
                {entry.holeDots.slice(9, 18).map(h => (
                  <div key={h.hole} className={`font-bold rounded py-0.5 ${h.total > 0 ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20" : h.total < 0 ? "text-red-500 bg-red-50 dark:bg-red-900/20" : ""}`}>
                    {h.total !== 0 ? (h.total > 0 ? "+" : "") + h.total : "-"}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Stroke or Stableford mode — tabbed view
  const isStableford = game.gameMode === "stableford";
  const entries = useMemo(() => isStableford
    ? computeStablefordLeaderboard(players, scores, course)
    : computeLeaderboard(players, scores, course), [players, scores, course, isStableford]);
  const matchPlay = useMemo(() => isStableford
    ? computeStablefordMatchPlay(entries as any, game.first9Bet, game.second9Bet, game.wholeGameBet)
    : computeMatchPlay(entries, game.first9Bet, game.second9Bet, game.wholeGameBet), [entries, isStableford, game.first9Bet, game.second9Bet, game.wholeGameBet]);
  const birdieEagle = useMemo(() => computeBirdieEagle(entries, game.birdiePot, game.eaglePot), [entries, game.birdiePot, game.eaglePot]);
  const special = useMemo(() => computeSpecialBets(scores, players, game.longestDriveBet, game.closestPinBet, course), [scores, players, game.longestDriveBet, game.closestPinBet, course]);

  const driveHolesLabel = course.longestDriveHoles.join(" & ");
  const pinHolesLabel = course.par3Holes.join(", ");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="w-full grid grid-cols-4 h-10 mb-4" data-testid="tabs-bets">
        <TabsTrigger value="match" className="text-xs" data-testid="tab-match">Match</TabsTrigger>
        <TabsTrigger value="birdies" className="text-xs" data-testid="tab-birdies">Birdies</TabsTrigger>
        <TabsTrigger value="drive" className="text-xs" data-testid="tab-drive">Drive</TabsTrigger>
        <TabsTrigger value="pin" className="text-xs" data-testid="tab-pin">Pin</TabsTrigger>
      </TabsList>

      <TabsContent value="match" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          {isStableford
            ? `Comparing Stableford points (highest wins) · Front 9 (${game.first9Bet}) · Back 9 (${game.second9Bet}) · Full (${game.wholeGameBet})`
            : `Winner-takes-all · Front 9 (${game.first9Bet}) · Back 9 (${game.second9Bet}) · Full (${game.wholeGameBet})`
          }
        </div>
        {matchPlay.sort((a, b) => b.total - a.total).map(r => (
          <Card key={r.playerId} className="border-border" data-testid={`card-match-${r.playerId}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm">{r.playerName}</span>
                <MoneyDisplay amount={r.total} size="lg" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">F9</div>
                  <MoneyDisplay amount={r.front9} />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">B9</div>
                  <MoneyDisplay amount={r.back9} />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Full</div>
                  <MoneyDisplay amount={r.wholeGame} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="birdies" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          Birdie pot{isStableford ? " (gross birdies)" : ""}: {game.birdiePot}/pair · Eagle pot{isStableford ? " (gross eagles)" : ""}: {game.eaglePot}/pair
        </div>
        {birdieEagle.sort((a, b) => b.total - a.total).map(r => (
          <Card key={r.playerId} className="border-border" data-testid={`card-birdie-${r.playerId}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-sm">{r.playerName}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {r.birdieCount} birdie{r.birdieCount !== 1 ? "s" : ""} · {r.eagleCount} eagle{r.eagleCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <MoneyDisplay amount={r.total} size="lg" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Birdies</div>
                  <MoneyDisplay amount={r.birdieWinnings} />
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Eagles</div>
                  <MoneyDisplay amount={r.eagleWinnings} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="drive" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          {game.longestDriveBet}/player · Holes {driveHolesLabel} · Highest distance wins
        </div>
        {special.longestDrive.map((r, idx) => (
          <Card key={idx} className="border-border" data-testid={`card-drive-${r.hole}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Ruler className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Hole {r.hole}</span>
                {r.flight && r.flight > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">F{r.flight}</span>
                )}
              </div>
              {r.winnerId ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{r.winnerName}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.winnerValue}m</span>
                  </div>
                  <MoneyDisplay amount={r.payout} size="lg" />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No entries yet</div>
              )}
            </CardContent>
          </Card>
        ))}
      </TabsContent>

      <TabsContent value="pin" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          {game.closestPinBet}/player · Par 3 holes ({pinHolesLabel}) · Shortest distance wins
        </div>
        {special.closestPin.map((r, idx) => (
          <Card key={idx} className="border-border" data-testid={`card-pin-${r.hole}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Hole {r.hole}</span>
                {r.flight && r.flight > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">F{r.flight}</span>
                )}
              </div>
              {r.winnerId ? (
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{r.winnerName}</span>
                    <span className="text-xs text-muted-foreground ml-2">{r.winnerValue}cm</span>
                  </div>
                  <MoneyDisplay amount={r.payout} size="lg" />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No entries yet</div>
              )}
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  );
}
