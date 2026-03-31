import { COURSE, type Score, type Player } from "@shared/schema";

// Get strokes received by a player on a specific hole (0-indexed)
export function getStrokesForHole(handicap: number, holeIndex: number): number {
  const hcpIndex = COURSE.holeHcp[holeIndex];
  if (handicap <= 0) return 0;
  let strokes = 0;
  if (hcpIndex <= handicap) strokes = 1;
  if (handicap > 18 && hcpIndex <= (handicap - 18)) strokes = 2;
  return strokes;
}

// Get net score for a single hole
export function getNetScoreForHole(grossScore: number | null, handicap: number, holeIndex: number): number | null {
  if (grossScore === null || grossScore === undefined) return null;
  return grossScore - getStrokesForHole(handicap, holeIndex);
}

// Score relative to par display
export function scoreVsPar(totalNet: number, holesPlayed: number, scores: (number | null)[]): string {
  let parForPlayed = 0;
  for (let i = 0; i < 18; i++) {
    if (scores[i] !== null && scores[i] !== undefined) {
      parForPlayed += COURSE.holePars[i];
    }
  }
  const diff = totalNet - parForPlayed;
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// Get color class for score vs par on a hole
export function getScoreColorClass(gross: number | null, holeIndex: number): string {
  if (gross === null || gross === undefined) return "";
  const par = COURSE.holePars[holeIndex];
  const diff = gross - par;
  if (diff <= -2) return "score-eagle";
  if (diff === -1) return "score-birdie";
  if (diff === 0) return "score-par";
  if (diff === 1) return "score-bogey";
  return "score-double-bogey";
}

export function getScoreBgClass(gross: number | null, holeIndex: number): string {
  if (gross === null || gross === undefined) return "";
  const par = COURSE.holePars[holeIndex];
  const diff = gross - par;
  if (diff <= -2) return "bg-eagle";
  if (diff === -1) return "bg-birdie";
  if (diff >= 2) return "bg-bogey";
  return "";
}

// Get score label relative to par
export function getScoreLabel(gross: number, par: number): string {
  const diff = gross - par;
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double";
  if (diff === 3) return "Triple";
  return `+${diff}`;
}

// Build a scores map: playerId -> hole (1-18) -> Score
export function buildScoresMap(allScores: Score[]): Map<number, Map<number, Score>> {
  const map = new Map<number, Map<number, Score>>();
  for (const s of allScores) {
    if (!map.has(s.playerId)) map.set(s.playerId, new Map());
    map.get(s.playerId)!.set(s.hole, s);
  }
  return map;
}

// Compute leaderboard data
export interface LeaderboardEntry {
  player: Player;
  grossTotal: number;
  netTotal: number;
  front9Net: number;
  back9Net: number;
  front9Gross: number;
  back9Gross: number;
  holesPlayed: number;
  birdies: number;
  eagles: number;
  vsParDisplay: string;
  netVsParDisplay: string;
  holeScores: (number | null)[]; // gross scores by hole index
  holeNetScores: (number | null)[];
}

export function computeLeaderboard(players: Player[], allScores: Score[]): LeaderboardEntry[] {
  const scoresMap = buildScoresMap(allScores);
  
  const entries: LeaderboardEntry[] = players.map(player => {
    const playerScores = scoresMap.get(player.id) || new Map<number, Score>();
    let grossTotal = 0, netTotal = 0, front9Net = 0, back9Net = 0;
    let front9Gross = 0, back9Gross = 0;
    let holesPlayed = 0, birdies = 0, eagles = 0;
    const holeScores: (number | null)[] = [];
    const holeNetScores: (number | null)[] = [];

    for (let i = 0; i < 18; i++) {
      const score = playerScores.get(i + 1);
      const gross = score?.grossScore ?? null;
      holeScores.push(gross);

      if (gross !== null) {
        holesPlayed++;
        grossTotal += gross;
        const net = getNetScoreForHole(gross, player.handicap, i)!;
        netTotal += net;
        holeNetScores.push(net);

        if (i < 9) { front9Net += net; front9Gross += gross; }
        else { back9Net += net; back9Gross += gross; }

        const par = COURSE.holePars[i];
        if (gross <= par - 2) eagles++;
        else if (gross === par - 1) birdies++;
      } else {
        holeNetScores.push(null);
      }
    }

    // Vs par display based on NET scores
    let parPlayed = 0;
    for (let i = 0; i < 18; i++) {
      if (holeScores[i] !== null) parPlayed += COURSE.holePars[i];
    }
    const grossDiff = grossTotal - parPlayed;
    const netDiff = netTotal - parPlayed;
    const vsParDisplay = holesPlayed === 0 ? "-" : (grossDiff === 0 ? "E" : (grossDiff > 0 ? `+${grossDiff}` : `${grossDiff}`));
    const netVsParDisplay = holesPlayed === 0 ? "-" : (netDiff === 0 ? "E" : (netDiff > 0 ? `+${netDiff}` : `${netDiff}`));

    return {
      player, grossTotal, netTotal, front9Net, back9Net, front9Gross, back9Gross,
      holesPlayed, birdies, eagles, vsParDisplay, netVsParDisplay, holeScores, holeNetScores,
    };
  });

  // Sort by net score (ascending), then by gross total
  entries.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1;
    if (b.holesPlayed === 0) return -1;
    if (a.netTotal !== b.netTotal) return a.netTotal - b.netTotal;
    return a.grossTotal - b.grossTotal;
  });

  return entries;
}

// Betting calculations
export interface MatchPlayResult {
  playerId: number;
  playerName: string;
  front9: number;
  back9: number;
  wholeGame: number;
  total: number;
}

export function computeMatchPlay(
  entries: LeaderboardEntry[],
  front9Bet: number,
  back9Bet: number,
  wholeGameBet: number
): MatchPlayResult[] {
  const results: MatchPlayResult[] = entries.map(e => ({
    playerId: e.player.id,
    playerName: e.player.name,
    front9: 0, back9: 0, wholeGame: 0, total: 0,
  }));

  if (entries.length < 2) return results;

  // Build index map: playerId -> results index
  const idxMap = new Map<number, number>();
  entries.forEach((e, i) => idxMap.set(e.player.id, i));

  // Winner-takes-all: lowest net wins the segment, collects bet from each loser.
  // If winners tie, losers'  bet is split equally among winners.

  // Front 9
  const allFront9Done = entries.every(e =>
    e.holeScores.slice(0, 9).filter(s => s !== null).length === 9
  );
  if (allFront9Done) {
    const bestNet = Math.min(...entries.map(e => e.front9Net));
    const winners = entries.filter(e => e.front9Net === bestNet);
    const losers = entries.filter(e => e.front9Net !== bestNet);
    if (losers.length > 0) {
      const perWinner = (front9Bet * losers.length) / winners.length;
      for (const w of winners) results[idxMap.get(w.player.id)!].front9 = perWinner;
      for (const l of losers) results[idxMap.get(l.player.id)!].front9 = -front9Bet;
    }
  }

  // Back 9
  const allBack9Done = entries.every(e =>
    e.holeScores.slice(9, 18).filter(s => s !== null).length === 9
  );
  if (allBack9Done) {
    const bestNet = Math.min(...entries.map(e => e.back9Net));
    const winners = entries.filter(e => e.back9Net === bestNet);
    const losers = entries.filter(e => e.back9Net !== bestNet);
    if (losers.length > 0) {
      const perWinner = (back9Bet * losers.length) / winners.length;
      for (const w of winners) results[idxMap.get(w.player.id)!].back9 = perWinner;
      for (const l of losers) results[idxMap.get(l.player.id)!].back9 = -back9Bet;
    }
  }

  // Whole game
  const allDone = entries.every(e => e.holesPlayed === 18);
  if (allDone) {
    const bestNet = Math.min(...entries.map(e => e.netTotal));
    const winners = entries.filter(e => e.netTotal === bestNet);
    const losers = entries.filter(e => e.netTotal !== bestNet);
    if (losers.length > 0) {
      const perWinner = (wholeGameBet * losers.length) / winners.length;
      for (const w of winners) results[idxMap.get(w.player.id)!].wholeGame = perWinner;
      for (const l of losers) results[idxMap.get(l.player.id)!].wholeGame = -wholeGameBet;
    }
  }

  results.forEach(r => r.total = r.front9 + r.back9 + r.wholeGame);
  return results;
}

export interface BirdieEagleResult {
  playerId: number;
  playerName: string;
  birdieCount: number;
  eagleCount: number;
  birdieWinnings: number;
  eagleWinnings: number;
  total: number;
}

export function computeBirdieEagle(
  entries: LeaderboardEntry[],
  birdiePot: number,
  eaglePot: number,
): BirdieEagleResult[] {
  const results: BirdieEagleResult[] = entries.map(e => ({
    playerId: e.player.id,
    playerName: e.player.name,
    birdieCount: e.birdies,
    eagleCount: e.eagles,
    birdieWinnings: 0,
    eagleWinnings: 0,
    total: 0,
  }));

  // Each pair: (count_i - count_j) * pot
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      // Birdies
      const bDiff = entries[i].birdies - entries[j].birdies;
      results[i].birdieWinnings += bDiff * birdiePot;
      results[j].birdieWinnings -= bDiff * birdiePot;

      // Eagles
      const eDiff = entries[i].eagles - entries[j].eagles;
      results[i].eagleWinnings += eDiff * eaglePot;
      results[j].eagleWinnings -= eDiff * eaglePot;
    }
  }

  results.forEach(r => r.total = r.birdieWinnings + r.eagleWinnings);
  return results;
}

export interface SpecialBetResult {
  hole: number;
  type: "longest_drive" | "closest_pin";
  winnerId: number | null;
  winnerName: string;
  winnerValue: number;
  payout: number; // total collected
}

export function computeSpecialBets(
  allScores: Score[],
  players: Player[],
  longestDriveBet: number,
  closestPinBet: number,
): { longestDrive: SpecialBetResult[]; closestPin: SpecialBetResult[]; playerTotals: Map<number, number> } {
  const scoresMap = buildScoresMap(allScores);
  const playerTotals = new Map<number, number>();
  players.forEach(p => playerTotals.set(p.id, 0));

  // Longest drive (holes 9, 18 - 1-indexed)
  const longestDrive: SpecialBetResult[] = COURSE.longestDriveHoles.map(hole => {
    let bestId: number | null = null;
    let bestDist = 0;
    let bestName = "-";

    for (const p of players) {
      const s = scoresMap.get(p.id)?.get(hole);
      if (s?.longestDrive && s.longestDrive > bestDist) {
        bestDist = s.longestDrive;
        bestId = p.id;
        bestName = p.name;
      }
    }

    const payout = bestId ? longestDriveBet * (players.length - 1) : 0;
    if (bestId) {
      playerTotals.set(bestId, (playerTotals.get(bestId) || 0) + payout);
      for (const p of players) {
        if (p.id !== bestId) {
          playerTotals.set(p.id, (playerTotals.get(p.id) || 0) - longestDriveBet);
        }
      }
    }

    return { hole, type: "longest_drive" as const, winnerId: bestId, winnerName: bestName, winnerValue: bestDist, payout };
  });

  // Closest to pin (par 3 holes: 4, 6, 12, 15 - 1-indexed)
  const closestPin: SpecialBetResult[] = COURSE.par3Holes.map(hole => {
    let bestId: number | null = null;
    let bestDist = Infinity;
    let bestName = "-";

    for (const p of players) {
      const s = scoresMap.get(p.id)?.get(hole);
      if (s?.closestPin && s.closestPin > 0 && s.closestPin < bestDist) {
        bestDist = s.closestPin;
        bestId = p.id;
        bestName = p.name;
      }
    }

    const payout = bestId ? closestPinBet * (players.length - 1) : 0;
    if (bestId) {
      playerTotals.set(bestId, (playerTotals.get(bestId) || 0) + payout);
      for (const p of players) {
        if (p.id !== bestId) {
          playerTotals.set(p.id, (playerTotals.get(p.id) || 0) - closestPinBet);
        }
      }
    }

    return { hole, type: "closest_pin" as const, winnerId: bestId, winnerName: bestName, winnerValue: bestDist === Infinity ? 0 : bestDist, payout };
  });

  return { longestDrive, closestPin, playerTotals };
}

export interface SettlementEntry {
  playerId: number;
  playerName: string;
  matchPlay: number;
  birdies: number;
  eagles: number;
  specialBets: number;
  grandTotal: number;
}

export function computeSettlement(
  entries: LeaderboardEntry[],
  allScores: Score[],
  players: Player[],
  game: { first9Bet: number; second9Bet: number; wholeGameBet: number; birdiePot: number; eaglePot: number; longestDriveBet: number; closestPinBet: number },
): SettlementEntry[] {
  const matchPlay = computeMatchPlay(entries, game.first9Bet, game.second9Bet, game.wholeGameBet);
  const birdieEagle = computeBirdieEagle(entries, game.birdiePot, game.eaglePot);
  const special = computeSpecialBets(allScores, players, game.longestDriveBet, game.closestPinBet);

  const settlement: SettlementEntry[] = players.map(p => {
    const mp = matchPlay.find(r => r.playerId === p.id);
    const be = birdieEagle.find(r => r.playerId === p.id);
    const sp = special.playerTotals.get(p.id) || 0;

    return {
      playerId: p.id,
      playerName: p.name,
      matchPlay: mp?.total || 0,
      birdies: be?.birdieWinnings || 0,
      eagles: be?.eagleWinnings || 0,
      specialBets: sp,
      grandTotal: (mp?.total || 0) + (be?.total || 0) + sp,
    };
  });

  settlement.sort((a, b) => b.grandTotal - a.grandTotal);
  return settlement;
}
