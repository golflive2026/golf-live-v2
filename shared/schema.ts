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

export const DEFAULT_DOTS = {
  dotValue: 1,
  dotBirdie: 1,
  dotEagle: 2,
  dotAlbatross: 5,
  dotDoubleBogey: -1,
  dotSandy: 1,
  dotChipIn: 1,
  dotGreenie: 1,
  dotLongestDrive: 1,
  dotClosestPin: 1,
  dotThreePutt: -1,
  dotWater: -1,
  dotOb: -1,
  // New categories
  dotPolie: 1,
  dotBarkie: 1,
  dotGoldenFerret: 2,
  dotArnie: 1,
  dotHogan: 1,
  dotSharkie: 1,
  dotFourPutt: -2,
  dotTigerLd: 1,
  dotMole: -1,
  dotFoozle: -1,
  dotBounceBack: 1,
  dotSnowman: -2,
  dotHoleInOne: 5,
  carryoverEnabled: 0,
} as const;

export type GameMode = "stroke" | "stableford" | "action";

// Stableford point calculation based on NET score vs par
export function getStablefordPoints(netScore: number, par: number): number {
  const diff = netScore - par;
  if (diff >= 2) return 0;   // net double bogey or worse
  if (diff === 1) return 1;  // net bogey
  if (diff === 0) return 2;  // net par
  if (diff === -1) return 3; // net birdie
  if (diff === -2) return 4; // net eagle
  return 5;                   // net albatross or better
}

// Games table
export const games = sqliteTable("games", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  date: text("date").notNull(),
  code: text("code").notNull().unique(),
  courseId: text("course_id").notNull().default("st-sofia"),
  gameMode: text("game_mode").notNull().default("stroke"),
  status: text("status").notNull().default("setup"),
  first9Bet: real("first9_bet").notNull().default(5),
  second9Bet: real("second9_bet").notNull().default(5),
  wholeGameBet: real("whole_game_bet").notNull().default(15),
  birdiePot: real("birdie_pot").notNull().default(3),
  eaglePot: real("eagle_pot").notNull().default(30),
  longestDriveBet: real("longest_drive_bet").notNull().default(3),
  closestPinBet: real("closest_pin_bet").notNull().default(3),
  // Action/Dots mode config
  dotValue: real("dot_value").default(1),
  dotBirdie: integer("dot_birdie").default(1),
  dotEagle: integer("dot_eagle").default(2),
  dotAlbatross: integer("dot_albatross").default(5),
  dotDoubleBogey: integer("dot_double_bogey").default(-1),
  dotSandy: integer("dot_sandy").default(1),
  dotChipIn: integer("dot_chip_in").default(1),
  dotGreenie: integer("dot_greenie").default(1),
  dotLongestDrive: integer("dot_longest_drive").default(1),
  dotClosestPin: integer("dot_closest_pin").default(1),
  dotThreePutt: integer("dot_three_putt").default(-1),
  dotWater: integer("dot_water").default(-1),
  dotOb: integer("dot_ob").default(-1),
  // New dot categories
  dotPolie: integer("dot_polie").default(1),
  dotBarkie: integer("dot_barkie").default(1),
  dotGoldenFerret: integer("dot_golden_ferret").default(2),
  dotArnie: integer("dot_arnie").default(1),
  dotHogan: integer("dot_hogan").default(1),
  dotSharkie: integer("dot_sharkie").default(1),
  dotFourPutt: integer("dot_four_putt").default(-2),
  dotTigerLd: integer("dot_tiger_ld").default(1),
  dotMole: integer("dot_mole").default(-1),
  dotFoozle: integer("dot_foozle").default(-1),
  dotBounceBack: integer("dot_bounce_back").default(1),
  dotSnowman: integer("dot_snowman").default(-2),
  dotHoleInOne: integer("dot_hole_in_one").default(5),
  carryoverEnabled: integer("carryover_enabled").default(0),
  // LD/CTP mode
  ldCtpMode: text("ld_ctp_mode").notNull().default("simple"),
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
  flight: integer("flight").default(0),
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

// Achievements table (Action/Dots mode)
export const achievements = sqliteTable("achievements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  playerId: integer("player_id").notNull(),
  hole: integer("hole").notNull(),
  sandy: integer("sandy").notNull().default(0),
  chipIn: integer("chip_in").notNull().default(0),
  greenie: integer("greenie").notNull().default(0),
  longestDriveWon: integer("longest_drive_won").notNull().default(0),
  closestPinWon: integer("closest_pin_won").notNull().default(0),
  threePutt: integer("three_putt").notNull().default(0),
  water: integer("water").notNull().default(0),
  ob: integer("ob").notNull().default(0),
  // New achievement fields
  polie: integer("polie").notNull().default(0),
  barkie: integer("barkie").notNull().default(0),
  goldenFerret: integer("golden_ferret").notNull().default(0),
  arnie: integer("arnie").notNull().default(0),
  hogan: integer("hogan").notNull().default(0),
  sharkie: integer("sharkie").notNull().default(0),
  fourPutt: integer("four_putt").notNull().default(0),
  tigerLd: integer("tiger_ld").notNull().default(0),
  mole: integer("mole").notNull().default(0),
});

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = typeof achievements.$inferInsert;

// Game photos table
export const gamePhotos = sqliteTable("game_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gameId: integer("game_id").notNull(),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  caption: text("caption"),
  uploadedBy: text("uploaded_by"),
  createdAt: text("created_at").notNull(),
});

export type GamePhoto = typeof gamePhotos.$inferSelect;

// Roster table - remembered players
export const roster = sqliteTable("roster", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  handicap: integer("handicap").notNull().default(18),
  pin: text("pin"),
  statsPublic: integer("stats_public").notNull().default(0),
  active: integer("active").notNull().default(1),
  email: text("email"),
  notificationsEnabled: integer("notifications_enabled").notNull().default(0),
});

export type RosterPlayer = typeof roster.$inferSelect;

// Helper types
export type PlayerWithScores = Player & { scores: Score[] };
export type GameWithPlayers = Game & { players: PlayerWithScores[] };

// Handicap stroke calculation (supports HCP 0-54)
export function getStrokesForHole(handicap: number, holeHcpIndex: number): number {
  if (handicap <= 0) return 0;
  let strokes = 0;
  if (holeHcpIndex <= handicap) strokes++;
  if (handicap > 18 && holeHcpIndex <= (handicap - 18)) strokes++;
  if (handicap > 36 && holeHcpIndex <= (handicap - 36)) strokes++;
  return strokes;
}
