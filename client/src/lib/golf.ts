import { type CourseData } from "@shared/schema";

// Re-export all shared calculation functions
export {
  getStrokesForHole,
  getNetScoreForHole,
  buildScoresMap,
  computeLeaderboard,
  computeMatchPlay,
  computeBirdieEagle,
  computeSpecialBets,
  computeSettlement,
} from "@shared/golf";

export type {
  LeaderboardEntry,
  MatchPlayResult,
  BirdieEagleResult,
  SpecialBetResult,
  SettlementEntry,
} from "@shared/golf";

// CSS-dependent helpers (client-only)
export function getScoreColorClass(gross: number | null, holeIndex: number, course: CourseData): string {
  if (gross === null || gross === undefined) return "";
  const diff = gross - course.holePars[holeIndex];
  if (diff <= -2) return "score-eagle";
  if (diff === -1) return "score-birdie";
  if (diff === 0) return "score-par";
  if (diff === 1) return "score-bogey";
  return "score-double-bogey";
}

export function getScoreBgClass(gross: number | null, holeIndex: number, course: CourseData): string {
  if (gross === null || gross === undefined) return "";
  const diff = gross - course.holePars[holeIndex];
  if (diff <= -2) return "bg-eagle";
  if (diff === -1) return "bg-birdie";
  if (diff >= 2) return "bg-bogey";
  return "";
}

export function getScoreLabel(gross: number, par: number): string {
  const diff = gross - par;
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double";
  if (diff === 3) return "Triple";
  return "+" + diff;
}
