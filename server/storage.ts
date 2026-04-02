import {
  type Game, type InsertGame, games,
  type Player, type InsertPlayer, players,
  type Score, type InsertScore, scores,
  type RosterPlayer, roster,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc } from "drizzle-orm";

import { existsSync, mkdirSync } from "fs";
import path from "path";

const dbPath = process.env.DATABASE_PATH || "data.db";

// Ensure the database directory exists (prevents crash if disk not mounted)
const dbDir = path.dirname(dbPath);
if (dbDir !== "." && !existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

const isNewDb = !existsSync(dbPath);
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Startup diagnostic: detect fresh database (possible data loss)
if (isNewDb) {
  console.warn(`[STORAGE] WARNING: Created new database at ${dbPath} — no existing data found`);
} else {
  const gameCount = sqlite.prepare("SELECT COUNT(*) as count FROM games").get() as any;
  console.log(`[STORAGE] Database loaded: ${dbPath} (${gameCount?.count ?? 0} games)`);
}

// Auto-create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    course_id TEXT NOT NULL DEFAULT 'st-sofia',
    status TEXT NOT NULL DEFAULT 'setup',
    first9_bet REAL NOT NULL DEFAULT 5,
    second9_bet REAL NOT NULL DEFAULT 5,
    whole_game_bet REAL NOT NULL DEFAULT 15,
    birdie_pot REAL NOT NULL DEFAULT 3,
    eagle_pot REAL NOT NULL DEFAULT 30,
    longest_drive_bet REAL NOT NULL DEFAULT 3,
    closest_pin_bet REAL NOT NULL DEFAULT 3
  );
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    handicap INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    hole INTEGER NOT NULL,
    gross_score INTEGER,
    longest_drive REAL,
    closest_pin REAL
  );
  CREATE TABLE IF NOT EXISTS roster (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    handicap INTEGER NOT NULL DEFAULT 18,
    pin TEXT DEFAULT NULL,
    stats_public INTEGER NOT NULL DEFAULT 0
  );
`);

// Migration: add course_id to existing games tables
try { sqlite.exec("ALTER TABLE games ADD COLUMN course_id TEXT NOT NULL DEFAULT 'st-sofia'"); } catch (e) {}
// Migration: add roster_id to players for identity linking
try { sqlite.exec("ALTER TABLE players ADD COLUMN roster_id INTEGER DEFAULT NULL"); } catch (e) {}
// Migration: add pin and stats_public to roster for privacy
try { sqlite.exec("ALTER TABLE roster ADD COLUMN pin TEXT DEFAULT NULL"); } catch (e) {}
try { sqlite.exec("ALTER TABLE roster ADD COLUMN stats_public INTEGER NOT NULL DEFAULT 0"); } catch (e) {}

export const db = drizzle(sqlite);

export interface IStorage {
  createGame(game: InsertGame): Game;
  getGame(id: number): Game | undefined;
  getGameByCode(code: string): Game | undefined;
  updateGame(id: number, data: Partial<InsertGame>): Game | undefined;
  listGames(): Game[];
  deleteGame(id: number): void;
  createPlayer(player: InsertPlayer & { rosterId?: number | null }): Player;
  getPlayersByGame(gameId: number): Player[];
  getPlayer(id: number): Player | undefined;
  updatePlayer(id: number, data: { rosterId?: number | null }): Player | undefined;
  deletePlayer(id: number): void;
  getPlayersByRosterId(rosterId: number): Player[];
  upsertScore(gameId: number, playerId: number, hole: number, data: { grossScore?: number | null; longestDrive?: number | null; closestPin?: number | null }): Score;
  getScoresByGame(gameId: number): Score[];
  getScoresByPlayer(playerId: number): Score[];
  listRoster(): RosterPlayer[];
  getRosterPlayer(id: number): RosterPlayer | undefined;
  addToRoster(name: string, handicap: number): RosterPlayer;
  updateRosterPlayer(id: number, data: { name?: string; handicap?: number; pin?: string; statsPublic?: number }): RosterPlayer | undefined;
  deleteRosterPlayer(id: number): void;
  upsertRoster(name: string, handicap: number): RosterPlayer;
}

export class DatabaseStorage implements IStorage {
  createGame(game: InsertGame): Game {
    return db.insert(games).values(game).returning().get();
  }
  getGame(id: number): Game | undefined {
    return db.select().from(games).where(eq(games.id, id)).get();
  }
  getGameByCode(code: string): Game | undefined {
    return db.select().from(games).where(eq(games.code, code)).get();
  }
  updateGame(id: number, data: Partial<InsertGame>): Game | undefined {
    return db.update(games).set(data).where(eq(games.id, id)).returning().get();
  }
  listGames(): Game[] {
    return db.select().from(games).orderBy(desc(games.id)).all();
  }
  deleteGame(id: number): void {
    db.delete(scores).where(eq(scores.gameId, id)).run();
    db.delete(players).where(eq(players.gameId, id)).run();
    db.delete(games).where(eq(games.id, id)).run();
  }
  createPlayer(player: InsertPlayer & { rosterId?: number | null }): Player {
    return db.insert(players).values(player).returning().get();
  }
  getPlayersByGame(gameId: number): Player[] {
    return db.select().from(players).where(eq(players.gameId, gameId)).all();
  }
  getPlayer(id: number): Player | undefined {
    return db.select().from(players).where(eq(players.id, id)).get();
  }
  updatePlayer(id: number, data: { rosterId?: number | null }): Player | undefined {
    return db.update(players).set(data).where(eq(players.id, id)).returning().get();
  }
  deletePlayer(id: number): void {
    db.delete(scores).where(eq(scores.playerId, id)).run();
    db.delete(players).where(eq(players.id, id)).run();
  }
  getPlayersByRosterId(rosterId: number): Player[] {
    return db.select().from(players).where(eq(players.rosterId, rosterId)).all();
  }
  upsertScore(gameId: number, playerId: number, hole: number, data: { grossScore?: number | null; longestDrive?: number | null; closestPin?: number | null }): Score {
    const existing = db.select().from(scores)
      .where(and(eq(scores.gameId, gameId), eq(scores.playerId, playerId), eq(scores.hole, hole)))
      .get();
    if (existing) {
      const updateData: any = {};
      if (data.grossScore !== undefined) updateData.grossScore = data.grossScore;
      if (data.longestDrive !== undefined) updateData.longestDrive = data.longestDrive;
      if (data.closestPin !== undefined) updateData.closestPin = data.closestPin;
      return db.update(scores).set(updateData).where(eq(scores.id, existing.id)).returning().get();
    } else {
      return db.insert(scores).values({
        gameId, playerId, hole,
        grossScore: data.grossScore ?? null,
        longestDrive: data.longestDrive ?? null,
        closestPin: data.closestPin ?? null,
      }).returning().get();
    }
  }
  getScoresByGame(gameId: number): Score[] {
    return db.select().from(scores).where(eq(scores.gameId, gameId)).all();
  }
  getScoresByPlayer(playerId: number): Score[] {
    return db.select().from(scores).where(eq(scores.playerId, playerId)).all();
  }
  listRoster(): RosterPlayer[] {
    return db.select().from(roster).all();
  }
  getRosterPlayer(id: number): RosterPlayer | undefined {
    return db.select().from(roster).where(eq(roster.id, id)).get();
  }
  addToRoster(name: string, handicap: number): RosterPlayer {
    return db.insert(roster).values({ name, handicap }).returning().get();
  }
  updateRosterPlayer(id: number, data: { name?: string; handicap?: number; pin?: string; statsPublic?: number }): RosterPlayer | undefined {
    return db.update(roster).set(data).where(eq(roster.id, id)).returning().get();
  }
  deleteRosterPlayer(id: number): void {
    db.delete(roster).where(eq(roster.id, id)).run();
  }
  upsertRoster(name: string, handicap: number): RosterPlayer {
    const existing = db.select().from(roster).where(eq(roster.name, name)).get();
    if (existing) {
      return db.update(roster).set({ handicap }).where(eq(roster.id, existing.id)).returning().get();
    }
    return db.insert(roster).values({ name, handicap }).returning().get();
  }
}

export const storage = new DatabaseStorage();

// Graceful shutdown: close SQLite to flush WAL and prevent corruption
function closeDb() {
  try { sqlite.close(); console.log("[STORAGE] Database closed cleanly"); } catch (e) {}
}
process.on("SIGTERM", closeDb);
process.on("SIGINT", closeDb);
