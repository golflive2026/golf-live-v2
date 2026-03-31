import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Game, type Player, type Score } from "@shared/schema";
import {
  computeLeaderboard,
  computeMatchPlay,
  computeBirdieEagle,
  computeSpecialBets,
} from "@/lib/golf";
import { Swords, Bird, Ruler, Target } from "lucide-react";

interface Props {
  game: Game;
  players: Player[];
  scores: Score[];
}

function MoneyDisplay({ amount, size = "sm" }: { amount: number; size?: "sm" | "lg" }) {
  const color = amount > 0 ? "text-green-600 dark:text-green-400" : amount < 0 ? "text-red-500" : "text-muted-foreground";
  const prefix = amount > 0 ? "+" : "";
  const cls = size === "lg" ? "text-base font-bold" : "text-sm font-semibold";
  return <span className={`${color} ${cls} tabular-nums`}>€{prefix}{amount.toFixed(0)}</span>;
}

export default function Bets({ game, players, scores }: Props) {
  const [activeTab, setActiveTab] = useState("match");
  const entries = computeLeaderboard(players, scores);
  const matchPlay = computeMatchPlay(entries, game.first9Bet, game.second9Bet, game.wholeGameBet);
  const birdieEagle = computeBirdieEagle(entries, game.birdiePot, game.eaglePot);
  const special = computeSpecialBets(scores, players, game.longestDriveBet, game.closestPinBet);

  if (players.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No players yet</div>;
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="w-full grid grid-cols-4 h-10 mb-4" data-testid="tabs-bets">
        <TabsTrigger value="match" className="text-xs" data-testid="tab-match">Match</TabsTrigger>
        <TabsTrigger value="birdies" className="text-xs" data-testid="tab-birdies">Birdies</TabsTrigger>
        <TabsTrigger value="drive" className="text-xs" data-testid="tab-drive">Drive</TabsTrigger>
        <TabsTrigger value="pin" className="text-xs" data-testid="tab-pin">Pin</TabsTrigger>
      </TabsList>

      {/* Match Play */}
      <TabsContent value="match" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          Each player vs every other · Front 9 (€{game.first9Bet}) · Back 9 (€{game.second9Bet}) · Full (€{game.wholeGameBet})
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

      {/* Birdies & Eagles */}
      <TabsContent value="birdies" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          Birdie pot: €{game.birdiePot}/pair · Eagle pot: €{game.eaglePot}/pair
        </div>
        {birdieEagle.sort((a, b) => b.total - a.total).map(r => (
          <Card key={r.playerId} className="border-border" data-testid={`card-birdie-${r.playerId}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-semibold text-sm">{r.playerName}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {r.birdieCount}🐦 {r.eagleCount}🦅
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

      {/* Longest Drive */}
      <TabsContent value="drive" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          €{game.longestDriveBet}/player · Holes 9 & 18 · Highest distance wins
        </div>
        {special.longestDrive.map(r => (
          <Card key={r.hole} className="border-border" data-testid={`card-drive-${r.hole}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Ruler className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Hole {r.hole}</span>
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

      {/* Closest to Pin */}
      <TabsContent value="pin" className="space-y-2">
        <div className="text-xs text-muted-foreground mb-3">
          €{game.closestPinBet}/player · Par 3 holes (4, 6, 12, 15) · Shortest distance wins
        </div>
        {special.closestPin.map(r => (
          <Card key={r.hole} className="border-border" data-testid={`card-pin-${r.hole}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Hole {r.hole}</span>
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
