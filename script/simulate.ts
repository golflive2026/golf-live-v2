/**
 * Simulation & Verification Script
 * Generates fake games on all 6 courses, verifies all settlement math sums to zero.
 * Run: npx tsx script/simulate.ts
 */

// Import shared types/functions directly (no bundler needed)
interface CourseData {
  id: string; name: string; totalPar: number; frontNinePar: number; backNinePar: number;
  holePars: number[]; holeHcp: number[]; par3Holes: number[]; longestDriveHoles: number[];
}

function mkCourse(id: string, name: string, holePars: number[], holeHcp: number[], longestDriveHoles?: number[]): CourseData {
  const f9 = holePars.slice(0, 9).reduce((a, b) => a + b, 0);
  const b9 = holePars.slice(9).reduce((a, b) => a + b, 0);
  const par3s = holePars.map((p, i) => p === 3 ? i + 1 : 0).filter(h => h > 0);
  return { id, name, totalPar: f9 + b9, frontNinePar: f9, backNinePar: b9, holePars, holeHcp, par3Holes: par3s, longestDriveHoles: longestDriveHoles || [9, 18] };
}

const COURSES: CourseData[] = [
  mkCourse("st-sofia", "St. Sofia Golf Club", [5,4,4,3,4,3,4,4,5,4,4,3,4,4,3,5,4,4], [9,15,5,11,1,17,7,3,13,10,4,16,2,18,14,6,8,12]),
  mkCourse("pravetz", "Pravetz Golf Club", [5,4,3,5,4,4,4,3,4,4,5,4,3,4,4,5,3,4], [2,6,18,4,14,16,8,12,10,1,5,9,17,11,3,7,15,13]),
  mkCourse("thracian-cliffs", "Thracian Cliffs", [4,5,5,4,3,3,4,4,4,5,4,4,4,5,3,4,4,3], [17,1,13,9,15,5,3,11,7,6,4,12,18,16,8,2,10,14]),
  mkCourse("lighthouse", "Lighthouse Golf & Spa", [4,4,5,4,5,3,4,3,4,4,3,5,4,3,4,5,3,4], [5,7,13,9,3,15,11,17,1,4,6,12,18,14,8,10,16,2]),
  mkCourse("blacksearama", "BlackSeaRama Golf", [5,4,4,4,3,4,4,3,5,4,5,4,3,4,4,4,5,3], [12,6,18,2,16,8,4,14,10,11,9,1,13,5,17,3,15,7]),
  mkCourse("ihtiman", "Air Sofia Golf Club", [4,3,4,5,4,4,4,4,5,3,4,3,5,4,3,4,4,4], [9,13,5,1,17,3,15,7,11,12,8,18,14,2,4,16,6,10]),
];

interface Player { id: number; name: string; handicap: number; gameId: number; }
interface Score { id: number; gameId: number; playerId: number; hole: number; grossScore: number | null; longestDrive: number | null; closestPin: number | null; }

// --- Calculation functions (mirror client/src/lib/golf.ts) ---

function getStrokesForHole(handicap: number, holeHcpIndex: number): number {
  if (handicap <= 0) return 0;
  let strokes = 0;
  if (holeHcpIndex <= handicap) strokes = 1;
  if (handicap > 18 && holeHcpIndex <= (handicap - 18)) strokes = 2;
  return strokes;
}

interface LeaderboardEntry {
  player: Player; grossTotal: number; netTotal: number; front9Net: number; back9Net: number;
  holesPlayed: number; birdies: number; eagles: number; holeScores: (number | null)[];
}

function computeLeaderboard(players: Player[], allScores: Score[], course: CourseData): LeaderboardEntry[] {
  const scoresMap = new Map<number, Map<number, Score>>();
  for (const s of allScores) {
    if (!scoresMap.has(s.playerId)) scoresMap.set(s.playerId, new Map());
    scoresMap.get(s.playerId)!.set(s.hole, s);
  }
  return players.map(player => {
    const ps = scoresMap.get(player.id) || new Map();
    let grossTotal = 0, netTotal = 0, front9Net = 0, back9Net = 0, holesPlayed = 0, birdies = 0, eagles = 0;
    const holeScores: (number | null)[] = [];
    for (let i = 0; i < 18; i++) {
      const gross = ps.get(i + 1)?.grossScore ?? null;
      holeScores.push(gross);
      if (gross !== null) {
        holesPlayed++; grossTotal += gross;
        const net = gross - getStrokesForHole(player.handicap, course.holeHcp[i]);
        netTotal += net;
        if (i < 9) front9Net += net; else back9Net += net;
        const par = course.holePars[i];
        if (gross <= par - 2) eagles++; else if (gross === par - 1) birdies++;
      }
    }
    return { player, grossTotal, netTotal, front9Net, back9Net, holesPlayed, birdies, eagles, holeScores };
  }).sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0;
    if (a.holesPlayed === 0) return 1; if (b.holesPlayed === 0) return -1;
    return a.netTotal !== b.netTotal ? a.netTotal - b.netTotal : a.grossTotal - b.grossTotal;
  });
}

function computeMatchPlay(entries: LeaderboardEntry[], f9Bet: number, b9Bet: number, wgBet: number) {
  const results = entries.map(e => ({ id: e.player.id, front9: 0, back9: 0, wholeGame: 0, total: 0 }));
  if (entries.length < 2) return results;
  const idxMap = new Map<number, number>(); entries.forEach((e, i) => idxMap.set(e.player.id, i));
  function settle(getNet: (e: LeaderboardEntry) => number, isComplete: (e: LeaderboardEntry) => boolean, bet: number, field: "front9"|"back9"|"wholeGame") {
    if (!entries.every(isComplete)) return;
    const best = Math.min(...entries.map(getNet));
    const winners = entries.filter(e => getNet(e) === best);
    const losers = entries.filter(e => getNet(e) !== best);
    if (losers.length === 0) return; // all tied
    const perW = (bet * losers.length) / winners.length;
    for (const w of winners) results[idxMap.get(w.player.id)!][field] = perW;
    for (const l of losers) results[idxMap.get(l.player.id)!][field] = -bet;
  }
  settle(e => e.front9Net, e => e.holeScores.slice(0,9).filter(s => s !== null).length === 9, f9Bet, "front9");
  settle(e => e.back9Net, e => e.holeScores.slice(9,18).filter(s => s !== null).length === 9, b9Bet, "back9");
  settle(e => e.netTotal, e => e.holesPlayed === 18, wgBet, "wholeGame");
  results.forEach(r => r.total = r.front9 + r.back9 + r.wholeGame);
  return results;
}

function computeBirdieEagle(entries: LeaderboardEntry[], birdiePot: number, eaglePot: number) {
  const results = entries.map(e => ({ id: e.player.id, birdieW: 0, eagleW: 0, total: 0 }));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const bd = entries[i].birdies - entries[j].birdies;
      results[i].birdieW += bd * birdiePot; results[j].birdieW -= bd * birdiePot;
      const ed = entries[i].eagles - entries[j].eagles;
      results[i].eagleW += ed * eaglePot; results[j].eagleW -= ed * eaglePot;
    }
  }
  results.forEach(r => r.total = r.birdieW + r.eagleW);
  return results;
}

function computeSpecialBets(allScores: Score[], players: Player[], ldBet: number, cpBet: number, course: CourseData) {
  const scoresMap = new Map<number, Map<number, Score>>();
  for (const s of allScores) {
    if (!scoresMap.has(s.playerId)) scoresMap.set(s.playerId, new Map());
    scoresMap.get(s.playerId)!.set(s.hole, s);
  }
  const totals = new Map<number, number>(); players.forEach(p => totals.set(p.id, 0));
  function findWinner(hole: number, field: "longestDrive"|"closestPin", bet: number, findMin: boolean) {
    let bestId: number | null = null, bestDist = findMin ? Infinity : 0;
    for (const p of players) {
      const val = scoresMap.get(p.id)?.get(hole)?.[field];
      if (val && val > 0 && (findMin ? val < bestDist : val > bestDist)) { bestDist = val; bestId = p.id; }
    }
    if (bestId) {
      totals.set(bestId, (totals.get(bestId) || 0) + bet * (players.length - 1));
      for (const p of players) { if (p.id !== bestId) totals.set(p.id, (totals.get(p.id) || 0) - bet); }
    }
  }
  course.longestDriveHoles.forEach(h => findWinner(h, "longestDrive", ldBet, false));
  course.par3Holes.forEach(h => findWinner(h, "closestPin", cpBet, true));
  return totals;
}

// --- Simulation ---

const NAMES = ["Dimitar","Ivan","Georgi","Nikolay","Stefan","Petar","Martin","Hristo","Todor","Angel",
  "Boris","Viktor","Emil","Plamen","Krasimir","Boyan","Yavor","Tihomir","Svetoslav","Lyubomir",
  "Vasil","Rosen","Dragomir","Zhivko","Momchil","Stanislav","Dobrin","Atanas","Kiril","Radoslav",
  "Milen","Chavdar","Bogdan","Yordan","Kostadin","Evgeni","Simeon","Vladimir","Aleksandar","Ognyan",
  "Tsvetan","Boyko","Lyudmil","Zahari","Valentin","Deyan","Asen","Zdravko","Spas","Galin"];

let nextId = 1;

function generatePlayers(count: number, gameId: number): Player[] {
  const shuffled = [...NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(name => ({
    id: nextId++, name, handicap: Math.floor(Math.random() * 28) + 5, gameId,
  }));
}

function generateScores(players: Player[], course: CourseData, gameId: number, withSpecial: boolean): Score[] {
  const scores: Score[] = [];
  for (const p of players) {
    for (let hole = 1; hole <= 18; hole++) {
      const par = course.holePars[hole - 1];
      // Realistic distribution: mostly par/bogey, occasional birdie, rare eagle
      const r = Math.random();
      let diff: number;
      if (r < 0.03) diff = -2;       // 3% eagle
      else if (r < 0.15) diff = -1;   // 12% birdie
      else if (r < 0.40) diff = 0;    // 25% par
      else if (r < 0.70) diff = 1;    // 30% bogey
      else if (r < 0.88) diff = 2;    // 18% double
      else diff = 3;                   // 12% triple+

      const grossScore = Math.max(1, par + diff);
      const isLD = withSpecial && course.longestDriveHoles.includes(hole);
      const isCP = withSpecial && course.par3Holes.includes(hole);
      scores.push({
        id: nextId++, gameId, playerId: p.id, hole, grossScore,
        longestDrive: isLD ? Math.floor(Math.random() * 80) + 200 : null,
        closestPin: isCP ? Math.floor(Math.random() * 800) + 50 : null,
      });
    }
  }
  return scores;
}

function generateTiedScores(players: Player[], course: CourseData, gameId: number): Score[] {
  // Everyone scores the same on every hole
  const scores: Score[] = [];
  for (const p of players) {
    for (let hole = 1; hole <= 18; hole++) {
      scores.push({
        id: nextId++, gameId, playerId: p.id, hole,
        grossScore: course.holePars[hole - 1], // everyone shoots par
        longestDrive: null, closestPin: null,
      });
    }
  }
  return scores;
}

// --- Test runner ---

const BETS = { first9Bet: 5, second9Bet: 5, wholeGameBet: 15, birdiePot: 3, eaglePot: 30, longestDriveBet: 3, closestPinBet: 3 };
const ZERO_BETS = { first9Bet: 0, second9Bet: 0, wholeGameBet: 0, birdiePot: 0, eaglePot: 0, longestDriveBet: 0, closestPinBet: 0 };

let passed = 0, failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  FAIL: ${msg}`); failed++; }
  else passed++;
}

function nearZero(v: number): boolean { return Math.abs(v) < 0.001; }

function verifySettlement(label: string, players: Player[], allScores: Score[], course: CourseData, bets: typeof BETS) {
  const entries = computeLeaderboard(players, allScores, course);
  const mp = computeMatchPlay(entries, bets.first9Bet, bets.second9Bet, bets.wholeGameBet);
  const be = computeBirdieEagle(entries, bets.birdiePot, bets.eaglePot);
  const sp = computeSpecialBets(allScores, players, bets.longestDriveBet, bets.closestPinBet, course);

  // Match play sums to zero
  const mpSum = mp.reduce((s, r) => s + r.total, 0);
  assert(nearZero(mpSum), `${label}: match play sum = ${mpSum}, expected 0`);

  // Front9 sums to zero
  const f9Sum = mp.reduce((s, r) => s + r.front9, 0);
  assert(nearZero(f9Sum), `${label}: front9 sum = ${f9Sum}, expected 0`);

  // Back9 sums to zero
  const b9Sum = mp.reduce((s, r) => s + r.back9, 0);
  assert(nearZero(b9Sum), `${label}: back9 sum = ${b9Sum}, expected 0`);

  // Whole game sums to zero
  const wgSum = mp.reduce((s, r) => s + r.wholeGame, 0);
  assert(nearZero(wgSum), `${label}: wholeGame sum = ${wgSum}, expected 0`);

  // Birdie/eagle sums to zero
  const beSum = be.reduce((s, r) => s + r.total, 0);
  assert(nearZero(beSum), `${label}: birdie/eagle sum = ${beSum}, expected 0`);

  // Special bets sum to zero
  let spSum = 0; sp.forEach(v => spSum += v);
  assert(nearZero(spSum), `${label}: special bets sum = ${spSum}, expected 0`);

  // Grand total sums to zero
  const grandTotals = players.map(p => {
    const m = mp.find(r => r.id === p.id)!;
    const b = be.find(r => r.id === p.id)!;
    const s = sp.get(p.id) || 0;
    return m.total + b.total + s;
  });
  const grandSum = grandTotals.reduce((a, b) => a + b, 0);
  assert(nearZero(grandSum), `${label}: grand total sum = ${grandSum}, expected 0`);
}

console.log("=== Golf Live V2 Simulation & Verification ===\n");

// Test 1: Each course with random players (10-20)
console.log("--- Test 1: Random games on all 6 courses ---");
for (const course of COURSES) {
  const numPlayers = Math.floor(Math.random() * 11) + 10; // 10-20
  const players = generatePlayers(numPlayers, nextId);
  const scores = generateScores(players, course, nextId, true);

  // Verify par totals
  const expectedPar = course.holePars.reduce((a, b) => a + b, 0);
  assert(course.totalPar === expectedPar, `${course.name}: totalPar = ${course.totalPar}, computed = ${expectedPar}`);
  assert(course.frontNinePar === course.holePars.slice(0,9).reduce((a,b) => a+b, 0), `${course.name}: frontNinePar`);
  assert(course.backNinePar === course.holePars.slice(9).reduce((a,b) => a+b, 0), `${course.name}: backNinePar`);

  verifySettlement(`${course.name} (${numPlayers}p)`, players, scores, course, BETS);
  console.log(`  ${course.name}: ${numPlayers} players - OK`);
}

// Test 2a: Same gross, different handicaps → higher HCP wins on net (correct golf math)
console.log("\n--- Test 2a: Same gross, different handicaps → highest HCP wins ---");
for (const course of COURSES) {
  const players = generatePlayers(4, nextId);
  // Give each player a distinct handicap
  players[0].handicap = 5;
  players[1].handicap = 12;
  players[2].handicap = 18;
  players[3].handicap = 24;
  const scores = generateTiedScores(players, course, nextId); // everyone shoots par
  const entries = computeLeaderboard(players, scores, course);

  // Highest handicap player should have lowest net (more strokes subtracted)
  const sorted = [...entries].sort((a, b) => a.netTotal - b.netTotal);
  assert(sorted[0].player.handicap === 24, `${course.name}: HCP 24 should lead on net`);
  assert(sorted[sorted.length - 1].player.handicap === 5, `${course.name}: HCP 5 should trail on net`);

  // Settlement still sums to zero
  verifySettlement(`${course.name} same-gross-diff-hcp`, players, scores, course, BETS);
  console.log(`  ${course.name}: handicap ordering correct, sums zero - OK`);
}

// Test 2b: True net tie (same handicap, same gross) → no money changes hands
console.log("\n--- Test 2b: True net tie (same HCP, same gross) → no money ---");
for (const course of COURSES) {
  const players = generatePlayers(4, nextId);
  players.forEach(p => p.handicap = 15);
  const scores = generateTiedScores(players, course, nextId);
  const entries = computeLeaderboard(players, scores, course);
  const mp = computeMatchPlay(entries, BETS.first9Bet, BETS.second9Bet, BETS.wholeGameBet);

  assert(mp.every(r => r.total === 0), `${course.name}: true net tie, match play should be 0`);
  assert(mp.every(r => r.front9 === 0), `${course.name}: true net tie, front9 should be 0`);
  assert(mp.every(r => r.back9 === 0), `${course.name}: true net tie, back9 should be 0`);
  assert(mp.every(r => r.wholeGame === 0), `${course.name}: true net tie, wholeGame should be 0`);
  console.log(`  ${course.name}: true net tie - OK`);
}

// Test 2c: Handicap stroke allocation per hole
console.log("\n--- Test 2c: Stroke allocation per hole is correct ---");
{
  const course = COURSES[0]; // St. Sofia, HCP indexes: [9,15,5,11,1,17,7,3,13,10,4,16,2,18,14,6,8,12]
  // HCP 5 player: gets stroke on holes with index 1-5 → holes 5(idx1), 3(idx5), 8(idx3), 7(idx7 NO→only <=5)
  // Actually: hole 5 has hcpIdx=1, hole 8 has hcpIdx=3, hole 3 has hcpIdx=5, hole 1 has hcpIdx=9 (NO)
  // So HCP 5 gets strokes on holes where holeHcp[i] <= 5: holes 3(5), 5(1), 8(3), 7(7 NO, >5), ...
  // holeHcp = [9,15,5,11,1,17,7,3,13,10,4,16,2,18,14,6,8,12]
  // Indices where holeHcp <= 5: idx2(5), idx4(1), idx7(3), idx10(4), idx12(2) → 5 strokes total
  let totalStrokes = 0;
  for (let i = 0; i < 18; i++) {
    totalStrokes += getStrokesForHole(5, course.holeHcp[i]);
  }
  assert(totalStrokes === 5, `HCP 5 on St. Sofia should get 5 total strokes, got ${totalStrokes}`);

  // HCP 18: gets exactly 18 strokes (1 per hole)
  let hcp18Strokes = 0;
  for (let i = 0; i < 18; i++) hcp18Strokes += getStrokesForHole(18, course.holeHcp[i]);
  assert(hcp18Strokes === 18, `HCP 18 should get 18 total strokes, got ${hcp18Strokes}`);

  // HCP 27: gets 27 strokes (2 on 9 hardest, 1 on 9 easiest)
  let hcp27Strokes = 0;
  for (let i = 0; i < 18; i++) hcp27Strokes += getStrokesForHole(27, course.holeHcp[i]);
  assert(hcp27Strokes === 27, `HCP 27 should get 27 total strokes, got ${hcp27Strokes}`);

  console.log(`  Stroke allocation per hole - OK`);
}

// Test 3: 2-way tie (winners split)
console.log("\n--- Test 3: 2-way tie split ---");
{
  const course = COURSES[0];
  const players = generatePlayers(4, nextId);
  // Make first two players identical, others worse
  const scores: Score[] = [];
  for (let pi = 0; pi < players.length; pi++) {
    for (let hole = 1; hole <= 18; hole++) {
      const par = course.holePars[hole - 1];
      scores.push({
        id: nextId++, gameId: 999, playerId: players[pi].id, hole,
        grossScore: pi < 2 ? par : par + 2, // first 2 shoot par, others +2
        longestDrive: null, closestPin: null,
      });
    }
  }
  // Force same handicap so net is same
  players.forEach(p => p.handicap = 10);
  const entries = computeLeaderboard(players, scores, course);
  const mp = computeMatchPlay(entries, 10, 10, 20);

  // 2 winners, 2 losers: each loser pays bet, split among winners
  const winners = mp.filter(r => r.total > 0);
  const losers = mp.filter(r => r.total < 0);
  assert(winners.length === 2, `2-way tie: should have 2 winners, got ${winners.length}`);
  assert(losers.length === 2, `2-way tie: should have 2 losers, got ${losers.length}`);
  // Each winner gets (bet * 2 losers) / 2 winners = bet per segment
  assert(nearZero(winners[0].total - winners[1].total), `2-way tie: winners should get equal amounts`);
  const mpSum = mp.reduce((s, r) => s + r.total, 0);
  assert(nearZero(mpSum), `2-way tie: match play sum = ${mpSum}`);
  console.log(`  2-way tie split - OK`);
}

// Test 4: 50 players max
console.log("\n--- Test 4: 50 players ---");
{
  const course = COURSES[2]; // Thracian Cliffs
  const players = generatePlayers(50, nextId);
  const scores = generateScores(players, course, nextId, true);
  verifySettlement("50 players", players, scores, course, BETS);
  console.log(`  50 players - OK`);
}

// Test 5: 2 players minimum
console.log("\n--- Test 5: 2 players ---");
{
  const course = COURSES[3];
  const players = generatePlayers(2, nextId);
  const scores = generateScores(players, course, nextId, true);
  verifySettlement("2 players", players, scores, course, BETS);
  console.log(`  2 players - OK`);
}

// Test 6: Zero bets
console.log("\n--- Test 6: Zero bets ---");
{
  const course = COURSES[0];
  const players = generatePlayers(5, nextId);
  const scores = generateScores(players, course, nextId, false);
  const entries = computeLeaderboard(players, scores, course);
  const mp = computeMatchPlay(entries, 0, 0, 0);
  const be = computeBirdieEagle(entries, 0, 0);
  assert(mp.every(r => r.total === 0), "Zero bets: match play all zero");
  assert(be.every(r => r.total === 0), "Zero bets: birdie/eagle all zero");
  console.log(`  Zero bets - OK`);
}

// Test 7: Handicap stroke correctness
console.log("\n--- Test 7: Handicap strokes ---");
{
  // HCP 0 gets no strokes
  assert(getStrokesForHole(0, 1) === 0, "HCP 0 gets 0 strokes");
  // HCP 18 gets 1 stroke on every hole (hcp index 1-18)
  for (let h = 1; h <= 18; h++) {
    assert(getStrokesForHole(18, h) === 1, `HCP 18 gets 1 stroke on hcp index ${h}`);
  }
  // HCP 36 gets 2 strokes on every hole
  for (let h = 1; h <= 18; h++) {
    assert(getStrokesForHole(36, h) === 2, `HCP 36 gets 2 strokes on hcp index ${h}`);
  }
  // HCP 10 gets 1 stroke on holes with hcp index <= 10
  assert(getStrokesForHole(10, 10) === 1, "HCP 10 gets stroke on index 10");
  assert(getStrokesForHole(10, 11) === 0, "HCP 10 gets no stroke on index 11");
  // HCP 22 gets 2 strokes on hardest 4 holes
  assert(getStrokesForHole(22, 1) === 2, "HCP 22 gets 2 strokes on index 1");
  assert(getStrokesForHole(22, 4) === 2, "HCP 22 gets 2 strokes on index 4");
  assert(getStrokesForHole(22, 5) === 1, "HCP 22 gets 1 stroke on index 5");
  console.log(`  Handicap strokes - OK`);
}

// Test 8: Stress test - 100 random games (2-50 players)
console.log("\n--- Test 8: Stress test (100 random games, 2-50 players) ---");
for (let i = 0; i < 100; i++) {
  const course = COURSES[i % COURSES.length];
  const n = Math.floor(Math.random() * 49) + 2; // 2-50
  const players = generatePlayers(n, nextId);
  const scores = generateScores(players, course, nextId, Math.random() > 0.5);
  verifySettlement(`stress-${i}`, players, scores, course, BETS);
}
console.log(`  100 random games (2-50 players) - OK`);

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
console.log("All settlement math verified: every sum is zero.");
