import { type CourseData, type Score, type Player, getStrokesForHole as getStrokes } from "./schema";

export function getStrokesForHole(handicap: number, holeIndex: number, course: CourseData): number {
  return getStrokes(handicap, course.holeHcp[holeIndex]);
}

export function getNetScoreForHole(grossScore: number | null, handicap: number, holeIndex: number, course: CourseData): number | null {
  if (grossScore === null || grossScore === undefined) return null;
  return grossScore - getStrokesForHole(handicap, holeIndex, course);
}

export function buildScoresMap(allScores: Score[]): Map<number, Map<number, Score>> {
  const map = new Map<number, Map<number, Score>>();
  for (const s of allScores) {
    if (!map.has(s.playerId)) map.set(s.playerId, new Map());
    map.get(s.playerId)!.set(s.hole, s);
  }
  return map;
}

export interface LeaderboardEntry {
  player: Player; grossTotal: number; netTotal: number; front9Net: number; back9Net: number;
  front9Gross: number; back9Gross: number; holesPlayed: number; birdies: number; eagles: number;
  vsParDisplay: string; netVsParDisplay: string; holeScores: (number | null)[]; holeNetScores: (number | null)[];
}

export function computeLeaderboard(players: Player[], allScores: Score[], course: CourseData): LeaderboardEntry[] {
  const scoresMap = buildScoresMap(allScores);
  const entries: LeaderboardEntry[] = players.map(player => {
    const playerScores = scoresMap.get(player.id) || new Map<number, Score>();
    let grossTotal = 0, netTotal = 0, front9Net = 0, back9Net = 0, front9Gross = 0, back9Gross = 0;
    let holesPlayed = 0, birdies = 0, eagles = 0;
    const holeScores: (number | null)[] = [], holeNetScores: (number | null)[] = [];
    for (let i = 0; i < 18; i++) {
      const score = playerScores.get(i + 1);
      const gross = score?.grossScore ?? null;
      holeScores.push(gross);
      if (gross !== null) {
        holesPlayed++; grossTotal += gross;
        const net = getNetScoreForHole(gross, player.handicap, i, course)!;
        netTotal += net; holeNetScores.push(net);
        if (i < 9) { front9Net += net; front9Gross += gross; } else { back9Net += net; back9Gross += gross; }
        const par = course.holePars[i];
        if (gross <= par - 2) eagles++; else if (gross === par - 1) birdies++;
      } else { holeNetScores.push(null); }
    }
    let parPlayed = 0;
    for (let i = 0; i < 18; i++) { if (holeScores[i] !== null) parPlayed += course.holePars[i]; }
    const gd = grossTotal - parPlayed, nd = netTotal - parPlayed;
    const fmtVp = (d: number) => d === 0 ? "E" : (d > 0 ? "+" + d : "" + d);
    const vsParDisplay = holesPlayed === 0 ? "-" : fmtVp(gd);
    const netVsParDisplay = holesPlayed === 0 ? "-" : fmtVp(nd);
    return { player, grossTotal, netTotal, front9Net, back9Net, front9Gross, back9Gross, holesPlayed, birdies, eagles, vsParDisplay, netVsParDisplay, holeScores, holeNetScores };
  });
  entries.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1; if (b.holesPlayed === 0) return -1;
    if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
    return a.grossTotal - b.grossTotal;
  });
  return entries;
}

export interface MatchPlayResult { playerId: number; playerName: string; front9: number; back9: number; wholeGame: number; total: number; }

export function computeMatchPlay(entries: LeaderboardEntry[], front9Bet: number, back9Bet: number, wholeGameBet: number): MatchPlayResult[] {
  const results: MatchPlayResult[] = entries.map(e => ({ playerId: e.player.id, playerName: e.player.name, front9: 0, back9: 0, wholeGame: 0, total: 0 }));
  if (entries.length < 2) return results;
  const idxMap = new Map<number, number>();
  entries.forEach((e, i) => idxMap.set(e.player.id, i));
  function settle(getNet: (e: LeaderboardEntry) => number, isComplete: (e: LeaderboardEntry) => boolean, bet: number, field: "front9" | "back9" | "wholeGame") {
    if (!entries.every(isComplete)) return;
    const bestNet = Math.min(...entries.map(getNet));
    const winners = entries.filter(e => getNet(e) === bestNet);
    const losers = entries.filter(e => getNet(e) !== bestNet);
    if (losers.length === 0) return;
    const perWinner = (bet * losers.length) / winners.length;
    for (const w of winners) results[idxMap.get(w.player.id)!][field] = perWinner;
    for (const l of losers) results[idxMap.get(l.player.id)!][field] = -bet;
  }
  settle(e => e.front9Net, e => e.holeScores.slice(0, 9).filter(s => s !== null).length === 9, front9Bet, "front9");
  settle(e => e.back9Net, e => e.holeScores.slice(9, 18).filter(s => s !== null).length === 9, back9Bet, "back9");
  settle(e => e.netTotal, e => e.holesPlayed === 18, wholeGameBet, "wholeGame");
  results.forEach(r => r.total = r.front9 + r.back9 + r.wholeGame);
  return results;
}

export interface BirdieEagleResult { playerId: number; playerName: string; birdieCount: number; eagleCount: number; birdieWinnings: number; eagleWinnings: number; total: number; }

export function computeBirdieEagle(entries: LeaderboardEntry[], birdiePot: number, eaglePot: number): BirdieEagleResult[] {
  const results: BirdieEagleResult[] = entries.map(e => ({ playerId: e.player.id, playerName: e.player.name, birdieCount: e.birdies, eagleCount: e.eagles, birdieWinnings: 0, eagleWinnings: 0, total: 0 }));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const bDiff = entries[i].birdies - entries[j].birdies;
      results[i].birdieWinnings += bDiff * birdiePot; results[j].birdieWinnings -= bDiff * birdiePot;
      const eDiff = entries[i].eagles - entries[j].eagles;
      results[i].eagleWinnings += eDiff * eaglePot; results[j].eagleWinnings -= eDiff * eaglePot;
    }
  }
  results.forEach(r => r.total = r.birdieWinnings + r.eagleWinnings);
  return results;
}

export interface SpecialBetResult { hole: number; type: "longest_drive" | "closest_pin"; winnerId: number | null; winnerName: string; winnerValue: number; payout: number; }

export function computeSpecialBets(allScores: Score[], players: Player[], longestDriveBet: number, closestPinBet: number, course: CourseData) {
  const scoresMap = buildScoresMap(allScores);
  const playerTotals = new Map<number, number>();
  players.forEach(p => playerTotals.set(p.id, 0));
  function findWinner(hole: number, field: "longestDrive" | "closestPin", betAmt: number, type: "longest_drive" | "closest_pin", findMin: boolean): SpecialBetResult {
    let bestId: number | null = null, bestDist = findMin ? Infinity : 0, bestName = "-";
    for (const p of players) {
      const val = scoresMap.get(p.id)?.get(hole)?.[field];
      if (val && val > 0 && (findMin ? val < bestDist : val > bestDist)) { bestDist = val; bestId = p.id; bestName = p.name; }
    }
    const payout = bestId ? betAmt * (players.length - 1) : 0;
    if (bestId) {
      playerTotals.set(bestId, (playerTotals.get(bestId) || 0) + payout);
      for (const p of players) { if (p.id !== bestId) playerTotals.set(p.id, (playerTotals.get(p.id) || 0) - betAmt); }
    }
    return { hole, type, winnerId: bestId, winnerName: bestName, winnerValue: bestDist === Infinity ? 0 : bestDist, payout };
  }
  const longestDrive = course.longestDriveHoles.map(h => findWinner(h, "longestDrive", longestDriveBet, "longest_drive", false));
  const closestPin = course.par3Holes.map(h => findWinner(h, "closestPin", closestPinBet, "closest_pin", true));
  return { longestDrive, closestPin, playerTotals };
}

export interface SettlementEntry { playerId: number; playerName: string; matchPlay: number; birdies: number; eagles: number; specialBets: number; grandTotal: number; }

export function computeSettlement(
  entries: LeaderboardEntry[], allScores: Score[], players: Player[],
  game: { first9Bet: number; second9Bet: number; wholeGameBet: number; birdiePot: number; eaglePot: number; longestDriveBet: number; closestPinBet: number },
  course: CourseData,
): SettlementEntry[] {
  const matchPlay = computeMatchPlay(entries, game.first9Bet, game.second9Bet, game.wholeGameBet);
  const birdieEagle = computeBirdieEagle(entries, game.birdiePot, game.eaglePot);
  const special = computeSpecialBets(allScores, players, game.longestDriveBet, game.closestPinBet, course);
  const settlement: SettlementEntry[] = players.map(p => {
    const mp = matchPlay.find(r => r.playerId === p.id);
    const be = birdieEagle.find(r => r.playerId === p.id);
    const sp = special.playerTotals.get(p.id) || 0;
    return { playerId: p.id, playerName: p.name, matchPlay: mp?.total || 0, birdies: be?.birdieWinnings || 0, eagles: be?.eagleWinnings || 0, specialBets: sp, grandTotal: (mp?.total || 0) + (be?.total || 0) + sp };
  });
  settlement.sort((a, b) => b.grandTotal - a.grandTotal);
  return settlement;
}
