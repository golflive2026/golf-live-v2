import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type CourseData, type Game, type Player, type Score } from "@shared/schema";
import { computeLeaderboard, computeSettlement } from "@/lib/golf";
import ClaimProfile from "@/components/claim-profile";
import { Receipt, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface Props { game: Game; players: Player[]; scores: Score[]; course: CourseData; }

function MoneyDisplay({ amount, size = "sm" }: { amount: number; size?: "sm" | "lg" }) {
  const color = amount > 0 ? "text-green-600 dark:text-green-400" : amount < 0 ? "text-red-500" : "text-muted-foreground";
  const prefix = amount > 0 ? "+" : "";
  const cls = size === "lg" ? "text-lg font-extrabold" : "text-sm font-semibold";
  return <span className={`${color} ${cls} tabular-nums`}>{prefix}{amount.toFixed(0)}</span>;
}

export default function Settlement({ game, players, scores, course }: Props) {
  const entries = computeLeaderboard(players, scores, course);
  const settlement = computeSettlement(entries, scores, players, game, course);
  if (players.length === 0) return <div className="text-center py-12 text-muted-foreground">No players yet</div>;
  const winners = settlement.filter(s => s.grandTotal > 0);
  const losers = settlement.filter(s => s.grandTotal < 0);
  const allComplete = entries.every(e => e.holesPlayed === 18);
  const minHoles = entries.length > 0 ? Math.min(...entries.map(e => e.holesPlayed)) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2"><Receipt className="w-5 h-5 text-primary" /><h2 className="text-base font-bold">Final Settlement</h2></div>
      {!allComplete && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Game in progress ({minHoles}/18 holes). Match play bets settle after all 18 holes are complete.</span>
        </div>
      )}
      {settlement.map(s => (
        <Card key={s.playerId} className={`border-border ${s.grandTotal > 0 ? "border-l-2 border-l-green-500" : s.grandTotal < 0 ? "border-l-2 border-l-red-500" : ""}`} data-testid={`card-settlement-${s.playerId}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {s.grandTotal > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : s.grandTotal < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : null}
                <span className="font-bold text-sm">{s.playerName}</span>
                {game.status === "finished" && (() => {
                  const p = players.find(pl => pl.id === s.playerId);
                  return p ? <ClaimProfile player={p} gameId={game.id} /> : null;
                })()}
              </div>
              <MoneyDisplay amount={s.grandTotal} size="lg" />
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div><div className="text-[10px] text-muted-foreground uppercase">Match</div><MoneyDisplay amount={s.matchPlay} /></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Birdies</div><MoneyDisplay amount={s.birdies} /></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Eagles</div><MoneyDisplay amount={s.eagles} /></div>
              <div><div className="text-[10px] text-muted-foreground uppercase">Special</div><MoneyDisplay amount={s.specialBets} /></div>
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="text-xs text-muted-foreground text-center py-4">Positive = amount to collect - Negative = amount to pay</div>
      {winners.length > 0 && losers.length > 0 && (
        <Card className="border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">Who Pays Whom</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const payees = winners.map(w => ({ ...w, remaining: w.grandTotal }));
              const payers = losers.map(l => ({ ...l, remaining: Math.abs(l.grandTotal) }));
              const transactions: { from: string; to: string; amount: number }[] = [];
              let pi = 0, ri = 0;
              while (pi < payers.length && ri < payees.length) {
                const amount = Math.min(payers[pi].remaining, payees[ri].remaining);
                if (amount > 0) transactions.push({ from: payers[pi].playerName, to: payees[ri].playerName, amount });
                payers[pi].remaining -= amount; payees[ri].remaining -= amount;
                if (payers[pi].remaining < 0.5) pi++; if (payees[ri].remaining < 0.5) ri++;
              }
              return transactions.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`row-transaction-${i}`}>
                  <div className="text-sm"><span className="font-medium text-red-500">{t.from}</span><span className="text-muted-foreground mx-2">{"->"}</span><span className="font-medium text-green-600 dark:text-green-400">{t.to}</span></div>
                  <span className="font-bold text-sm tabular-nums">{t.amount.toFixed(0)}</span>
                </div>
              ));
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
