import { type CourseData } from "./schema";
import { getStrokesForHole } from "./schema";

// Net Double Bogey cap for a hole
function adjustedHoleScore(gross: number | null, par: number, holeHcpIdx: number, courseHcp: number): number {
  const strokes = getStrokesForHole(courseHcp, holeHcpIdx);
  const cap = par + 2 + strokes;
  if (gross == null || gross <= 0) return cap;
  return Math.min(gross, cap);
}

export function adjustedGrossScore(holeScores: (number | null)[], course: CourseData, courseHcp: number): number {
  let total = 0;
  for (let i = 0; i < 18; i++) {
    total += adjustedHoleScore(holeScores[i], course.holePars[i], course.holeHcp[i], courseHcp);
  }
  return total;
}

export function scoreDifferential(ags: number, courseRating: number, slope: number): number {
  return Math.round((113 / slope) * (ags - courseRating) * 10) / 10;
}

// Best-N table from WHS Appendix E
const WHS_RULES: [number, number, number, number][] = [
  [3, 3, 1, -2.0], [4, 4, 1, -1.0], [5, 5, 1, 0],
  [6, 6, 2, -1.0], [7, 8, 2, 0], [9, 11, 3, 0],
  [12, 14, 4, 0], [15, 16, 5, 0], [17, 18, 6, 0],
  [19, 19, 7, 0], [20, 20, 8, 0],
];

export function rawHandicapIndex(differentials: number[]): number | null {
  const recent20 = differentials.slice(-20);
  const n = recent20.length;
  if (n < 3) return null;
  const rule = WHS_RULES.find(([lo, hi]) => n >= lo && n <= hi);
  if (!rule) return null;
  const [, , k, adj] = rule;
  const sorted = [...recent20].sort((a, b) => a - b);
  const avg = sorted.slice(0, k).reduce((s, d) => s + d, 0) / k;
  return Math.min(54.0, Math.max(0, Math.round((avg + adj) * 10) / 10));
}

export function courseHandicap(handicapIndex: number, slope: number, courseRating: number, par: number): number {
  return Math.round(handicapIndex * (slope / 113) + (courseRating - par));
}

// Get effective course rating + slope, preferring tee-specific values if teeId provided
export function getEffectiveTeeRating(course: CourseData, teeId?: string | null): { rating: number; slope: number } {
  if (teeId && course.tees) {
    const tee = course.tees.find(t => t.id === teeId);
    if (tee) return { rating: tee.courseRating, slope: tee.slope };
  }
  return { rating: course.courseRating ?? course.totalPar, slope: course.slope ?? 113 };
}

// Compute WHS handicap from a player's history of finished games
export interface PlayerRound {
  holeScores: (number | null)[];
  course: CourseData;
  storedHandicap: number;  // course handicap at time of round (use stored as approximation)
  teeId?: string | null;   // optional tee box used in that round
}

export function computeHandicapFromRounds(rounds: PlayerRound[]): { index: number | null; differentials: number[] } {
  const differentials: number[] = [];
  for (const r of rounds) {
    const { rating, slope } = getEffectiveTeeRating(r.course, r.teeId);
    const ags = adjustedGrossScore(r.holeScores, r.course, r.storedHandicap);
    const diff = scoreDifferential(ags, rating, slope);
    differentials.push(diff);
  }
  const index = rawHandicapIndex(differentials);
  return { index, differentials };
}
