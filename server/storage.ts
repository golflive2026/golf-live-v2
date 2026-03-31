import {
  type Game, type InsertGame, games,
  type Player, type InsertPlayer, players,
  type Score, type InsertScore, scores,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";

const dbPath = process.env.DATABASE_PATH || "data.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Auto-create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
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
`);

export const db = drizzle(sqlite);

export interface IStorage {
  // Games
  createGame(game: InsertGame): Game;
  getGame(id: number): Game | undefined;
  getGameByCode(code: string): Game | undefined;
  updateGame(id: number, data: Partial<InsertGame>): Game | undefined;

  // Players
  createPlayer(player: InsertPlayer): Player;
  getPlayersByGame(gameId: number): Player[];
  getPlayer(id: number): Player | undefined;
  deletePlayer(id: number): void;

  // Scores
  upsertScore(gameId: number, playerId: number, hole: number, data: { grossScore?: number | null; longestDrive?: number | null; closestPin?: number | null }): Score;
  getScoresByGame(gameId: number): Score[];
  getScoresByPlayer(playerId: number): Score[];
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

  createPlayer(player: InsertPlayer): Player {
    return db.insert(players).values(player).returning().get();
  }

  getPlayersByGame(gameId: number): Player[] {
    return db.select().from(players).where(eq(players.gameId, gameId)).all();
  }

  getPlayer(id: number): Player | undefined {
    return db.select().from(players).where(eq(players.id, id)).get();
  }

  deletePlayer(id: number): void {
    db.delete(scores).where(eq(scores.playerId, id)).run();
    db.delete(players).where(eq(players.id, id)).run();
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
      return db.update(scores).set(updateData)
        .where(eq(scores.id, existing.id))
        .returning().get();
    } else {
      return db.insert(scores).values({
        gameId,
        playerId,
        hole,
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
}

export const storage = new DatabaseStorage();
