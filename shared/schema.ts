import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Course data - hardcoded for St. Sofia Golf Club
export const COURSE = {
  name: "St. Sofia Golf Club",
  location: "Ravno Pole, Bulgaria",
  totalPar: 71,
  frontNinePar: 36,
  backNinePar: 35,
  holePars: [5, 4, 4, 3, 4, 3, 4, 4, 5, 4, 4, 3, 4, 4, 3, 5, 4, 4],
  holeHcp: [9, 15, 5, 11, 1, 17, 7, 3, 13, 10, 4, 16, 2, 18, 14, 6, 8, 12],
  par3Holes: [4, 6, 12, 15], // 1-indexed
  longestDriveHoles: [9, 18], // 1-indexed
} as const;

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
  status: text("status").notNull().default("setup"), // setup | active | finished
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
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// Scores table - one row per player per hole
export const scores = sqliteTable("scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  playerId: integer("player_id").notNull(),
  hole: integer("hole").notNull(), // 1-18
  grossScore: integer("gross_score"), // null means not yet entered
  longestDrive: real("longest_drive"), // meters, only holes 9 & 18
  closestPin: real("closest_pin"), // cm, only par 3 holes
});

export const insertScoreSchema = createInsertSchema(scores).omit({ id: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

// Helper types for the frontend
export type PlayerWithScores = Player & {
  scores: Score[];
};

export type GameWithPlayers = Game & {
  players: PlayerWithScores[];
};

// Handicap stroke calculation
export function getStrokesForHole(handicap: number, holeHcpIndex: number): number {
  if (handicap <= 0) return 0;
  let strokes = 0;
  if (holeHcpIndex <= handicap) strokes = 1;
  if (handicap > 18 && holeHcpIndex <= (handicap - 18)) strokes = 2;
  return strokes;
}

// Get net score for a hole
export function getNetScore(grossScore: number | null, handicap: number, holeIndex: number): number | null {
  if (grossScore === null) return null;
  const hcpIndex = COURSE.holeHcp[holeIndex]; // 0-indexed
  const strokes = getStrokesForHole(handicap, hcpIndex);
  return grossScore - strokes;
}
