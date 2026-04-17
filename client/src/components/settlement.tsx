import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type CourseData, type Game, type Player, type Score, type Achievement, DEFAULT_DOTS } from "@shared/schema";
import {
  computeLeaderboard,
  computeSettlement,
  computeStablefordLeaderboard,
  computeStablefordSettlement,
  computeActionDots,
  computeActionSettlement,
  type DotConfig,
} from "@/lib/golf";
import ClaimProfile from "@/components/claim-profile";
import { Receipt, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface Props { game: Game; players: Player[]; scores: Score[]; course: CourseData; achievements?: Achievement[]; }

function MoneyDisplay({ amount, size = "sm" }: { amount: number; size?: "sm" | "lg" }) {
  const color = amount > 0 ? "text-green-600 dark:text-green-400" : amount < 0 ? "text-red-500" : "text-muted-foreground";
  const prefix = amount > 0 ? "+" : "";
  const cls = size === "lg" ? "text-lg font-extrabold" : "text-sm font-semibold";
  return <span className={`${color} ${cls} tabular-nums`}>{prefix}{amount.toFixed(0)}</span>;
}

export default function Settlement({ game, players, scores, course, achievements }: Props) {
  if (players.length === 0) return <div className="text-center py-12 text-muted-foreground">No players yet</div>;

  const isAction = game.gameMode === "action";
  const isStableford = game.gameMode === "stableford";

  const isLive = game.status === "active";

  const { settlement, entries } = useMemo(() => {
    let settlement: ReturnType<typeof computeSettlement>;
    let entries: ReturnType<typeof computeLeaderboard>;

    const allowance = (game as any).handicapAllowance ?? 100;
    if (isAction) {
      const dotConfig: DotConfig = Object.fromEntries(
        Object.keys(DEFAULT_DOTS).map(k => [k, (game as any)[k] ?? (DEFAULT_DOTS as any)[k]])
      ) as DotConfig;
      const dotEntries = computeActionDots(players, scores, achievements ?? [], dotConfig, course, allowance);
      const dotValue = game.dotValue ?? DEFAULT_DOTS.dotValue;
      settlement = computeActionSettlement(dotEntries, dotValue);
      entries = computeLeaderboard(players, scores, course, allowance);
    } else if (isStableford) {
      const stablefordEntries = computeStablefordLeaderboard(players, scores, course, allowance);
      settlement = computeStablefordSettlement(stablefordEntries, scores, players, game, course, isLive);
      entries = stablefordEntries;
    } else {
      entries = computeLeaderboard(players, scores, course, allowance);
      settlement = computeSettlement(entries, scores, players, game, course, isLive);
    }

    return { settlement, entries };
  }, [players, scores, course, game, achievements, isAction, isStableford, isLive]);

  // Detect flights for per-flight special display
  const flightSet = new Set(players.map(p => (p as any).flight || 0));
  const flightNumbers = Array.from(flightSet).filter(f => f > 0).sort();
  const hasFlights = flightNumbers.length > 1;

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
          <span>Game in progress ({minHoles}/18 holes). {isAction ? "Dot settlements update as scores are entered." : "Match play bets settle after all 18 holes are complete."}</span>
        </div>
      )}
      {settlement.map(s => {
        // With flights: grand total excludes specials (shown separately per flight)
        const displayTotal = hasFlights ? s.grandTotal - s.specialBets : s.grandTotal;
        return (
        <Card key={s.playerId} className={`border-border ${displayTotal > 0 ? "border-l-2 border-l-green-500" : displayTotal < 0 ? "border-l-2 border-l-red-500" : ""}`} data-testid={`card-settlement-${s.playerId}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {displayTotal > 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : displayTotal < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : null}
                <span className="font-bold text-sm">{s.playerName}</span>
                {game.status === "finished" && (() => {
                  const p = players.find(pl => pl.id === s.playerId);
                  return p ? <ClaimProfile player={p} gameId={game.id} /> : null;
                })()}
              </div>
              <MoneyDisplay amount={displayTotal} size="lg" />
            </div>
            {isAction ? (
              <div className="grid grid-cols-1 gap-2 text-center">
                <div><div className="text-[10px] text-muted-foreground uppercase">Dots</div><MoneyDisplay amount={s.matchPlay} /></div>
              </div>
            ) : (
              <div className={`grid ${hasFlights ? "grid-cols-3" : "grid-cols-4"} gap-2 text-center`}>
                <div><div className="text-[10px] text-muted-foreground uppercase">Match</div><MoneyDisplay amount={s.matchPlay} /></div>
                <div><div className="text-[10px] text-muted-foreground uppercase">Birdies</div><MoneyDisplay amount={s.birdies} /></div>
                <div><div className="text-[10px] text-muted-foreground uppercase">Eagles</div><MoneyDisplay amount={s.eagles} /></div>
                {!hasFlights && (
                  <div><div className="text-[10px] text-muted-foreground uppercase">Special</div><MoneyDisplay amount={s.specialBets} /></div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        );
      })}
      {/* Per-flight special settlements (only with multi-flight games) */}
      {hasFlights && !isAction && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Special Bets (per flight)
          </h3>
          {flightNumbers.map(flightNum => {
            const flightPlayers = players.filter(p => (p as any).flight === flightNum);
            const flightSettlements = settlement.filter(s =>
              flightPlayers.some(p => p.id === s.playerId)
            );
            return (
              <Card key={flightNum} className="border-border">
                <CardContent className="p-3">
                  <p className="text-xs font-bold mb-2">Flight {flightNum}</p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">{flightPlayers.length} players</p>
                    {flightSettlements
                      .sort((a, b) => b.specialBets - a.specialBets)
                      .map(s => (
                      <div key={s.playerId} className="flex items-center justify-between">
                        <span className="text-xs font-medium">{s.playerName}</span>
                        <MoneyDisplay amount={s.specialBets} />
                      </div>
                    ))}
                    {flightSettlements.every(s => s.specialBets === 0) && (
                      <p className="text-[10px] text-muted-foreground">No specials recorded yet</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <p className="text-[10px] text-muted-foreground text-center">LD/CTP settle within flights only — not included in main total above</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center py-4">Positive = amount to collect · Negative = amount to pay</div>
      {/* Main "Who Pays Whom" — uses displayTotal (excludes specials when multi-flight) */}
      {(() => {
        const adjusted = settlement.map(s => ({
          ...s, displayTotal: hasFlights ? s.grandTotal - s.specialBets : s.grandTotal,
        }));
        const mainWinners = adjusted.filter(s => s.displayTotal > 0);
        const mainLosers = adjusted.filter(s => s.displayTotal < 0);
        if (mainWinners.length === 0 || mainLosers.length === 0) return null;
        const payees = mainWinners.map(w => ({ ...w, remaining: w.displayTotal }));
        const payers = mainLosers.map(l => ({ ...l, remaining: Math.abs(l.displayTotal) }));
        const transactions: { from: string; to: string; amount: number }[] = [];
        let pi = 0, ri = 0;
        while (pi < payers.length && ri < payees.length) {
          const amount = Math.min(payers[pi].remaining, payees[ri].remaining);
          if (amount > 0) transactions.push({ from: payers[pi].playerName, to: payees[ri].playerName, amount });
          payers[pi].remaining -= amount; payees[ri].remaining -= amount;
          if (payers[pi].remaining < 0.5) pi++; if (payees[ri].remaining < 0.5) ri++;
        }
        return (
          <Card className="border-border"><CardHeader className="pb-2"><CardTitle className="text-sm">Who Pays Whom{hasFlights ? " (Match + Birdies + Eagles)" : ""}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {transactions.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`row-transaction-${i}`}>
                  <div className="text-sm"><span className="font-medium text-red-500">{t.from}</span><span className="text-muted-foreground mx-2">{"->"}</span><span className="font-medium text-green-600 dark:text-green-400">{t.to}</span></div>
                  <span className="font-bold text-sm tabular-nums">{t.amount.toFixed(0)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* Per-flight special payments (Who Pays Whom within each flight) */}
      {hasFlights && !isAction && flightNumbers.map(flightNum => {
        const flightPlayers = players.filter(p => (p as any).flight === flightNum);
        const flightEntries = settlement.filter(s => flightPlayers.some(p => p.id === s.playerId));
        const fWinners = flightEntries.filter(s => s.specialBets > 0);
        const fLosers = flightEntries.filter(s => s.specialBets < 0);
        if (fWinners.length === 0 || fLosers.length === 0) return null;
        const payees = fWinners.map(w => ({ ...w, remaining: w.specialBets }));
        const payers = fLosers.map(l => ({ ...l, remaining: Math.abs(l.specialBets) }));
        const transactions: { from: string; to: string; amount: number }[] = [];
        let pi = 0, ri = 0;
        while (pi < payers.length && ri < payees.length) {
          const amount = Math.min(payers[pi].remaining, payees[ri].remaining);
          if (amount > 0) transactions.push({ from: payers[pi].playerName, to: payees[ri].playerName, amount });
          payers[pi].remaining -= amount; payees[ri].remaining -= amount;
          if (payers[pi].remaining < 0.5) pi++; if (payees[ri].remaining < 0.5) ri++;
        }
        return (
          <Card key={flightNum} className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Flight {flightNum} — Special Payments</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {transactions.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="text-sm"><span className="font-medium text-red-500">{t.from}</span><span className="text-muted-foreground mx-2">{"->"}</span><span className="font-medium text-green-600 dark:text-green-400">{t.to}</span></div>
                  <span className="font-bold text-sm tabular-nums">{t.amount.toFixed(0)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
