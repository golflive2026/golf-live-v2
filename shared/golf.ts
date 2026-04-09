import { type CourseData, type Score, type Player, type Achievement, type Game, getStrokesForHole as getStrokes, getStablefordPoints } from "./schema";

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

export interface SpecialBetResult { hole: number; type: "longest_drive" | "closest_pin"; winnerId: number | null; winnerName: string; winnerValue: number; payout: number; flight?: number; }

// Internal: compute specials for a single group of players
function computeSpecialBetsForGroup(
  scoresMap: Map<number, Map<number, Score>>, groupPlayers: Player[],
  longestDriveBet: number, closestPinBet: number, course: CourseData, flightNum?: number,
) {
  const playerTotals = new Map<number, number>();
  groupPlayers.forEach(p => playerTotals.set(p.id, 0));

  function findWinner(hole: number, field: "longestDrive" | "closestPin", betAmt: number, type: "longest_drive" | "closest_pin", findMin: boolean): SpecialBetResult {
    let markerWinnerId: number | null = null, markerWinnerName = "-";
    let bestId: number | null = null, bestDist = findMin ? Infinity : 0, bestName = "-";
    const participants: number[] = [];

    for (const p of groupPlayers) {
      const val = scoresMap.get(p.id)?.get(hole)?.[field];
      if (val && val >= 999) { markerWinnerId = p.id; markerWinnerName = p.name; }
      if (val && val > 0 && val < 999) {
        participants.push(p.id);
        if (findMin ? val < bestDist : val > bestDist) { bestDist = val; bestId = p.id; bestName = p.name; }
      }
    }

    if (markerWinnerId) {
      const payout = betAmt * (groupPlayers.length - 1);
      playerTotals.set(markerWinnerId, (playerTotals.get(markerWinnerId) || 0) + payout);
      for (const p of groupPlayers) { if (p.id !== markerWinnerId) playerTotals.set(p.id, (playerTotals.get(p.id) || 0) - betAmt); }
      return { hole, type, winnerId: markerWinnerId, winnerName: markerWinnerName, winnerValue: 0, payout, flight: flightNum };
    }

    const payout = bestId ? betAmt * (participants.length - 1) : 0;
    if (bestId) {
      playerTotals.set(bestId, (playerTotals.get(bestId) || 0) + payout);
      for (const pid of participants) { if (pid !== bestId) playerTotals.set(pid, (playerTotals.get(pid) || 0) - betAmt); }
    }
    return { hole, type, winnerId: bestId, winnerName: bestName, winnerValue: bestDist === Infinity ? 0 : bestDist, payout, flight: flightNum };
  }

  const longestDrive = course.longestDriveHoles.map(h => findWinner(h, "longestDrive", longestDriveBet, "longest_drive", false));
  const closestPin = course.par3Holes.map(h => findWinner(h, "closestPin", closestPinBet, "closest_pin", true));
  return { longestDrive, closestPin, playerTotals };
}

// Public: auto-detects flights. No flights → single pool. Flights → per-flight pools.
export function computeSpecialBets(
  allScores: Score[], players: Player[], longestDriveBet: number, closestPinBet: number,
  course: CourseData,
) {
  const scoresMap = buildScoresMap(allScores);
  const flightSet = new Set(players.map(p => (p as any).flight || 0));
  const flightNumbers = Array.from(flightSet);
  const hasFlights = flightNumbers.some(f => f !== 0);

  if (!hasFlights) {
    // No flights — original single-pool behavior
    return computeSpecialBetsForGroup(scoresMap, players, longestDriveBet, closestPinBet, course);
  }

  // Per-flight specials
  const playerTotals = new Map<number, number>();
  players.forEach(p => playerTotals.set(p.id, 0));
  const allLd: SpecialBetResult[] = [];
  const allCtp: SpecialBetResult[] = [];

  for (const flightNum of flightNumbers) {
    const flightPlayers = players.filter(p => ((p as any).flight || 0) === flightNum);
    const result = computeSpecialBetsForGroup(scoresMap, flightPlayers, longestDriveBet, closestPinBet, course, flightNum);
    result.playerTotals.forEach((v, k) => playerTotals.set(k, (playerTotals.get(k) || 0) + v));
    allLd.push(...result.longestDrive);
    allCtp.push(...result.closestPin);
  }

  return { longestDrive: allLd, closestPin: allCtp, playerTotals };
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

// ============================================================
// STABLEFORD MODE
// ============================================================

export interface StablefordEntry extends LeaderboardEntry {
  stablefordTotal: number;
  front9Stableford: number;
  back9Stableford: number;
  holeStablefordPoints: (number | null)[];
}

export function computeStablefordLeaderboard(players: Player[], allScores: Score[], course: CourseData): StablefordEntry[] {
  const scoresMap = buildScoresMap(allScores);
  const entries: StablefordEntry[] = players.map(player => {
    const playerScores = scoresMap.get(player.id) || new Map<number, Score>();
    let grossTotal = 0, netTotal = 0, front9Net = 0, back9Net = 0, front9Gross = 0, back9Gross = 0;
    let holesPlayed = 0, birdies = 0, eagles = 0;
    let stablefordTotal = 0, front9Stableford = 0, back9Stableford = 0;
    const holeScores: (number | null)[] = [], holeNetScores: (number | null)[] = [], holeStablefordPoints: (number | null)[] = [];
    for (let i = 0; i < 18; i++) {
      const score = playerScores.get(i + 1);
      const gross = score?.grossScore ?? null;
      holeScores.push(gross);
      if (gross !== null) {
        holesPlayed++; grossTotal += gross;
        const net = getNetScoreForHole(gross, player.handicap, i, course)!;
        netTotal += net; holeNetScores.push(net);
        const pts = getStablefordPoints(net, course.holePars[i]);
        holeStablefordPoints.push(pts);
        stablefordTotal += pts;
        if (i < 9) { front9Net += net; front9Gross += gross; front9Stableford += pts; }
        else { back9Net += net; back9Gross += gross; back9Stableford += pts; }
        const par = course.holePars[i];
        if (gross <= par - 2) eagles++; else if (gross === par - 1) birdies++;
      } else { holeNetScores.push(null); holeStablefordPoints.push(null); }
    }
    let parPlayed = 0;
    for (let i = 0; i < 18; i++) { if (holeScores[i] !== null) parPlayed += course.holePars[i]; }
    const gd = grossTotal - parPlayed, nd = netTotal - parPlayed;
    const fmtVp = (d: number) => d === 0 ? "E" : (d > 0 ? "+" + d : "" + d);
    const vsParDisplay = holesPlayed === 0 ? "-" : fmtVp(gd);
    const netVsParDisplay = holesPlayed === 0 ? "-" : fmtVp(nd);
    return { player, grossTotal, netTotal, front9Net, back9Net, front9Gross, back9Gross, holesPlayed, birdies, eagles, vsParDisplay, netVsParDisplay, holeScores, holeNetScores, stablefordTotal, front9Stableford, back9Stableford, holeStablefordPoints };
  });
  // Stableford: highest points wins (descending)
  entries.sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1; if (b.holesPlayed === 0) return -1;
    if (a.stablefordTotal !== b.stablefordTotal) return b.stablefordTotal - a.stablefordTotal;
    return a.grossTotal - b.grossTotal;
  });
  return entries;
}

export function computeStablefordMatchPlay(entries: StablefordEntry[], front9Bet: number, back9Bet: number, wholeGameBet: number): MatchPlayResult[] {
  const results: MatchPlayResult[] = entries.map(e => ({ playerId: e.player.id, playerName: e.player.name, front9: 0, back9: 0, wholeGame: 0, total: 0 }));
  if (entries.length < 2) return results;
  const idxMap = new Map<number, number>();
  entries.forEach((e, i) => idxMap.set(e.player.id, i));
  function settle(getPts: (e: StablefordEntry) => number, isComplete: (e: StablefordEntry) => boolean, bet: number, field: "front9" | "back9" | "wholeGame") {
    if (!entries.every(isComplete)) return;
    const bestPts = Math.max(...entries.map(getPts)); // highest wins in Stableford
    const winners = entries.filter(e => getPts(e) === bestPts);
    const losers = entries.filter(e => getPts(e) !== bestPts);
    if (losers.length === 0) return;
    const perWinner = (bet * losers.length) / winners.length;
    for (const w of winners) results[idxMap.get(w.player.id)!][field] = perWinner;
    for (const l of losers) results[idxMap.get(l.player.id)!][field] = -bet;
  }
  settle(e => e.front9Stableford, e => e.holeScores.slice(0, 9).filter(s => s !== null).length === 9, front9Bet, "front9");
  settle(e => e.back9Stableford, e => e.holeScores.slice(9, 18).filter(s => s !== null).length === 9, back9Bet, "back9");
  settle(e => e.stablefordTotal, e => e.holesPlayed === 18, wholeGameBet, "wholeGame");
  results.forEach(r => r.total = r.front9 + r.back9 + r.wholeGame);
  return results;
}

export function computeStablefordSettlement(
  entries: StablefordEntry[], allScores: Score[], players: Player[],
  game: { first9Bet: number; second9Bet: number; wholeGameBet: number; birdiePot: number; eaglePot: number; longestDriveBet: number; closestPinBet: number; ldCtpMode?: string },
  course: CourseData,
): SettlementEntry[] {
  const matchPlay = computeStablefordMatchPlay(entries, game.first9Bet, game.second9Bet, game.wholeGameBet);
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

// ============================================================
// ACTION/DOTS MODE
// ============================================================

export interface DotConfig {
  dotBirdie: number; dotEagle: number; dotAlbatross: number; dotDoubleBogey: number;
  dotSandy: number; dotChipIn: number; dotGreenie: number;
  dotLongestDrive: number; dotClosestPin: number;
  dotThreePutt: number; dotWater: number; dotOb: number;
  // New categories
  dotPolie: number; dotBarkie: number; dotGoldenFerret: number;
  dotArnie: number; dotHogan: number; dotSharkie: number;
  dotFourPutt: number; dotTigerLd: number; dotMole: number;
  dotFoozle: number; dotBounceBack: number; dotSnowman: number; dotHoleInOne: number;
  carryoverEnabled: number;
}

export interface ActionDotEntry {
  playerId: number;
  playerName: string;
  totalDots: number;
  holeDots: { hole: number; auto: number; manual: number; total: number }[];
  breakdown: {
    birdies: number; eagles: number; albatrosses: number; doubleBogeys: number;
    sandies: number; chipIns: number; greenies: number;
    longestDrives: number; closestPins: number;
    threePutts: number; waters: number; obs: number;
    // New
    polies: number; barkies: number; goldenFerrets: number;
    arnies: number; hogans: number; sharkies: number;
    fourPutts: number; tigerLds: number; moles: number;
    foozles: number; bounceBacks: number; snowmen: number; holesInOne: number;
  };
}

export function buildAchievementsMap(allAchievements: Achievement[]): Map<number, Map<number, Achievement>> {
  const map = new Map<number, Map<number, Achievement>>();
  for (const a of allAchievements) {
    if (!map.has(a.playerId)) map.set(a.playerId, new Map());
    map.get(a.playerId)!.set(a.hole, a);
  }
  return map;
}

export function computeActionDots(
  players: Player[], allScores: Score[], allAchievements: Achievement[],
  dotConfig: DotConfig, course: CourseData,
): ActionDotEntry[] {
  const scoresMap = buildScoresMap(allScores);
  const achievementsMap = buildAchievementsMap(allAchievements);

  // Pre-compute per-player NET scores for bounce-back detection
  const playerNetByHole = new Map<number, (number | null)[]>();
  for (const p of players) {
    const nets: (number | null)[] = [];
    const ps = scoresMap.get(p.id) || new Map();
    for (let i = 0; i < 18; i++) {
      const gross = ps.get(i + 1)?.grossScore ?? null;
      nets.push(gross !== null ? getNetScoreForHole(gross, p.handicap, i, course) : null);
    }
    playerNetByHole.set(p.id, nets);
  }

  // Carryover tracking (across all players)
  let greenieCarryover = 0;
  let ldCarryover = 0;
  const par3Holes = course.par3Holes.map(h => h - 1); // 0-indexed
  const ldHoles = course.longestDriveHoles.map(h => h - 1);

  // For carryover: check if anyone won on each eligible hole
  const greenieWonByHole = new Map<number, boolean>();
  const ldWonByHole = new Map<number, boolean>();
  if (dotConfig.carryoverEnabled) {
    for (const h0 of par3Holes) {
      let won = false;
      for (const p of players) {
        const ach = achievementsMap.get(p.id)?.get(h0 + 1);
        if (ach?.greenie || ach?.closestPinWon) { won = true; break; }
      }
      greenieWonByHole.set(h0, won);
    }
    for (const h0 of ldHoles) {
      let won = false;
      for (const p of players) {
        const ach = achievementsMap.get(p.id)?.get(h0 + 1);
        if (ach?.longestDriveWon) { won = true; break; }
      }
      ldWonByHole.set(h0, won);
    }
  }

  // Compute carryover multipliers per hole
  const greenieMultiplier = new Map<number, number>();
  const ldMultiplier = new Map<number, number>();
  if (dotConfig.carryoverEnabled) {
    let carry = 0;
    for (const h0 of par3Holes) {
      if (greenieWonByHole.get(h0)) {
        greenieMultiplier.set(h0, 1 + carry);
        carry = 0;
      } else {
        greenieMultiplier.set(h0, 0);
        carry++;
      }
    }
    carry = 0;
    for (const h0 of ldHoles) {
      if (ldWonByHole.get(h0)) {
        ldMultiplier.set(h0, 1 + carry);
        carry = 0;
      } else {
        ldMultiplier.set(h0, 0);
        carry++;
      }
    }
  }

  const entries: ActionDotEntry[] = players.map(player => {
    const playerScores = scoresMap.get(player.id) || new Map<number, Score>();
    const playerAch = achievementsMap.get(player.id) || new Map<number, Achievement>();
    const playerNets = playerNetByHole.get(player.id) || [];
    let totalDots = 0;
    const holeDots: ActionDotEntry["holeDots"] = [];
    const breakdown = {
      birdies: 0, eagles: 0, albatrosses: 0, doubleBogeys: 0,
      sandies: 0, chipIns: 0, greenies: 0, longestDrives: 0, closestPins: 0,
      threePutts: 0, waters: 0, obs: 0,
      polies: 0, barkies: 0, goldenFerrets: 0, arnies: 0, hogans: 0, sharkies: 0,
      fourPutts: 0, tigerLds: 0, moles: 0, foozles: 0, bounceBacks: 0, snowmen: 0, holesInOne: 0,
    };

    for (let i = 0; i < 18; i++) {
      const hole = i + 1;
      const score = playerScores.get(hole);
      const ach = playerAch.get(hole);
      const gross = score?.grossScore ?? null;
      const net = playerNets[i];
      const par = course.holePars[i];
      let autoDots = 0, manualDots = 0;

      if (gross !== null && net !== null) {
        const netDiff = net - par;

        // Score-based auto-detection
        if (gross === 1) { breakdown.holesInOne++; autoDots += dotConfig.dotHoleInOne; }
        if (netDiff <= -3) { breakdown.albatrosses++; autoDots += dotConfig.dotAlbatross; }
        else if (netDiff === -2) { breakdown.eagles++; autoDots += dotConfig.dotEagle; }
        else if (netDiff === -1) { breakdown.birdies++; autoDots += dotConfig.dotBirdie; }
        else if (netDiff >= 2) { breakdown.doubleBogeys++; autoDots += dotConfig.dotDoubleBogey; }

        // Snowman: gross >= 8
        if (gross >= 8) { breakdown.snowmen++; autoDots += dotConfig.dotSnowman; }

        // Bounce Back: par or better after previous hole was double bogey+
        if (i > 0 && playerNets[i - 1] !== null) {
          const prevNet = playerNets[i - 1]!;
          const prevPar = course.holePars[i - 1];
          if (prevNet - prevPar >= 2 && netDiff <= 0) {
            breakdown.bounceBacks++; autoDots += dotConfig.dotBounceBack;
          }
        }
      }

      // Manual achievements
      if (ach) {
        if (ach.sandy) { breakdown.sandies++; manualDots += dotConfig.dotSandy; }
        if (ach.chipIn) { breakdown.chipIns++; manualDots += dotConfig.dotChipIn; }
        if (ach.polie) { breakdown.polies++; manualDots += dotConfig.dotPolie; }
        if (ach.barkie) { breakdown.barkies++; manualDots += dotConfig.dotBarkie; }
        if (ach.goldenFerret) { breakdown.goldenFerrets++; manualDots += dotConfig.dotGoldenFerret; }
        if (ach.arnie) { breakdown.arnies++; manualDots += dotConfig.dotArnie; }
        if (ach.hogan) { breakdown.hogans++; manualDots += dotConfig.dotHogan; }
        if (ach.sharkie) { breakdown.sharkies++; manualDots += dotConfig.dotSharkie; }
        if (ach.mole) { breakdown.moles++; manualDots += dotConfig.dotMole; }
        if (ach.tigerLd) { breakdown.tigerLds++; manualDots += dotConfig.dotTigerLd; }

        // Greenie with foozle mechanic
        if (ach.greenie || ach.closestPinWon) {
          if (gross !== null && net !== null && net <= par) {
            // Earned greenie/CTP — apply carryover multiplier if enabled
            const mult = dotConfig.carryoverEnabled ? (greenieMultiplier.get(i) || 1) : 1;
            breakdown.greenies++;
            manualDots += (ach.greenie ? dotConfig.dotGreenie : dotConfig.dotClosestPin) * mult;
          } else if (gross !== null && net !== null && net > par) {
            // Foozle: had CTP but missed par → penalty
            breakdown.foozles++; manualDots += dotConfig.dotFoozle;
          }
        }

        // LD won with carryover
        if (ach.longestDriveWon) {
          const mult = dotConfig.carryoverEnabled ? (ldMultiplier.get(i) || 1) : 1;
          breakdown.longestDrives++; manualDots += dotConfig.dotLongestDrive * mult;
        }

        // Negative manual
        if (ach.threePutt) { breakdown.threePutts++; manualDots += dotConfig.dotThreePutt; }
        if (ach.fourPutt) { breakdown.fourPutts++; manualDots += dotConfig.dotFourPutt; }
        if (ach.water) { breakdown.waters++; manualDots += dotConfig.dotWater; }
        if (ach.ob) { breakdown.obs++; manualDots += dotConfig.dotOb; }
      }

      const holeTotal = autoDots + manualDots;
      totalDots += holeTotal;
      holeDots.push({ hole, auto: autoDots, manual: manualDots, total: holeTotal });
    }

    return { playerId: player.id, playerName: player.name, totalDots, holeDots, breakdown };
  });

  entries.sort((a, b) => b.totalDots - a.totalDots);
  return entries;
}

export function computeActionSettlement(
  dotEntries: ActionDotEntry[], dotValue: number,
): SettlementEntry[] {
  // Pairwise: each pair settles dot difference × dotValue
  const totals = new Map<number, number>();
  dotEntries.forEach(e => totals.set(e.playerId, 0));

  for (let i = 0; i < dotEntries.length; i++) {
    for (let j = i + 1; j < dotEntries.length; j++) {
      const diff = dotEntries[i].totalDots - dotEntries[j].totalDots;
      const amount = diff * dotValue;
      totals.set(dotEntries[i].playerId, (totals.get(dotEntries[i].playerId) || 0) + amount);
      totals.set(dotEntries[j].playerId, (totals.get(dotEntries[j].playerId) || 0) - amount);
    }
  }

  const settlement: SettlementEntry[] = dotEntries.map(e => ({
    playerId: e.playerId,
    playerName: e.playerName,
    matchPlay: totals.get(e.playerId) || 0,
    birdies: 0,
    eagles: 0,
    specialBets: 0,
    grandTotal: totals.get(e.playerId) || 0,
  }));
  settlement.sort((a, b) => b.grandTotal - a.grandTotal);
  return settlement;
}
