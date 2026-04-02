import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Course data structure
export interface CourseData {
  id: string;
  name: string;
  location: string;
  totalPar: number;
  frontNinePar: number;
  backNinePar: number;
  holePars: readonly number[];
  holeHcp: readonly number[];
  par3Holes: readonly number[];
  longestDriveHoles: readonly number[];
}

function mkCourse(id: string, name: string, location: string, holePars: number[], holeHcp: number[], longestDriveHoles?: number[]): CourseData {
  const f9 = holePars.slice(0, 9).reduce((a, b) => a + b, 0);
  const b9 = holePars.slice(9).reduce((a, b) => a + b, 0);
  const par3s = holePars.map((p, i) => p === 3 ? i + 1 : 0).filter(h => h > 0);
  return { id, name, location, totalPar: f9 + b9, frontNinePar: f9, backNinePar: b9, holePars, holeHcp, par3Holes: par3s, longestDriveHoles: longestDriveHoles || [9, 18] };
}

export const COURSES: Record<string, CourseData> = {
  "st-sofia": mkCourse("st-sofia", "St. Sofia Golf Club", "Ravno Pole, Bulgaria",
    [5, 4, 4, 3, 4, 3, 4, 4, 5, 4, 4, 3, 4, 4, 3, 5, 4, 4],
    [9, 15, 5, 11, 1, 17, 7, 3, 13, 10, 4, 16, 2, 18, 14, 6, 8, 12]),
  "pravetz": mkCourse("pravetz", "Pravetz Golf Club", "Pravetz, Bulgaria",
    [5, 4, 3, 5, 4, 4, 4, 3, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4],
    [2, 6, 18, 4, 14, 16, 8, 12, 10, 1, 5, 9, 17, 11, 3, 7, 15, 13]),
  "thracian-cliffs": mkCourse("thracian-cliffs", "Thracian Cliffs", "Kavarna, Bulgaria",
    [4, 5, 5, 4, 3, 3, 4, 4, 4, 5, 4, 4, 4, 5, 3, 4, 4, 3],
    [17, 1, 13, 9, 15, 5, 3, 11, 7, 6, 4, 12, 18, 16, 8, 2, 10, 14]),
  "lighthouse": mkCourse("lighthouse", "Lighthouse Golf & Spa", "Balchik, Bulgaria",
    [4, 4, 5, 4, 5, 3, 4, 3, 4, 4, 3, 5, 4, 3, 4, 5, 3, 4],
    [5, 7, 13, 9, 3, 15, 11, 17, 1, 4, 6, 12, 18, 14, 8, 10, 16, 2]),
  "blacksearama": mkCourse("blacksearama", "BlackSeaRama Golf", "Balchik, Bulgaria",
    [5, 4, 4, 4, 3, 4, 4, 3, 5, 4, 5, 4, 3, 4, 4, 4, 5, 3],
    [12, 6, 18, 2, 16, 8, 4, 14, 10, 11, 9, 1, 13, 5, 17, 3, 15, 7]),
  "ihtiman": mkCourse("ihtiman", "Air Sofia Golf Club", "Ihtiman, Bulgaria",
    [4, 3, 4, 5, 4, 4, 4, 4, 5, 3, 4, 3, 5, 4, 3, 4, 4, 4],
    [9, 13, 5, 1, 17, 3, 15, 7, 11, 12, 8, 18, 14, 2, 4, 16, 6, 10]),
};

export const COURSE_LIST = Object.values(COURSES);

export function getCourse(id: string | null | undefined): CourseData {
  return COURSES[id || "st-sofia"] || COURSES["st-sofia"];
}

// Keep backward compat - default course
export const COURSE = COURSES["st-sofia"];

export const DEFAULT_BETS = {
  first9Bet: 5,
  second9Bet: 5,
  wholeGameBet: 15,
  birdiePot: 3,
  eaglePot: 30,
  longestDriveBet: 3,
  closestPinBet: 3,
} as const;

// Games table
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  date: text("date").notNull(),
  code: text("code").notNull().unique(),
  courseId: text("course_id").notNull().default("st-sofia"),
  status: text("status").notNull().default("setup"),
  first9Bet: real("first9_bet").notNull().default(5),
  second9Bet: real("second9_bet").notNull().default(5),
  wholeGameBet: real("whole_game_bet").notNull().default(15),
  birdiePot: real("birdie_pot").notNull().default(3),
  eaglePot: real("eagle_pot").notNull().default(30),
  longestDriveBet: real("longest_drive_bet").notNull().default(3),
  closestPinBet: real("closest_pin_bet").notNull().default(3),
});

export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

// Players table
export const players = sqliteTable("players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  name: text("name").notNull(),
  handicap: integer("handicap").notNull().default(0),
  rosterId: integer("roster_id"),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// Scores table
export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  playerId: integer("player_id").notNull(),
  hole: integer("hole").notNull(),
  grossScore: integer("gross_score"),
  longestDrive: real("longest_drive"),
  closestPin: real("closest_pin"),
});

export const insertScoreSchema = createInsertSchema(scores).omit({ id: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

// Roster table - remembered players
export const roster = sqliteTable("roster", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  handicap: integer("handicap").notNull().default(18),
  pin: text("pin"),
  statsPublic: integer("stats_public").notNull().default(0),
});

export type RosterPlayer = typeof roster.$inferSelect;

// Helper types
export type PlayerWithScores = Player & { scores: Score[] };
export type GameWithPlayers = Game & { players: PlayerWithScores[] };

// Handicap stroke calculation
export function getStrokesForHole(handicap: number, holeHcpIndex: number): number {
  if (handicap <= 0) return 0;
  let strokes = 0;
  if (holeHcpIndex <= handicap) strokes = 1;
  if (handicap > 18 && holeHcpIndex <= (handicap - 18)) strokes = 2;
  return strokes;
}
