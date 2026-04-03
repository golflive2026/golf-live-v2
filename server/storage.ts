import {
  type Game, type InsertGame, games,
  type Player, type InsertPlayer, players,
  type Score, type InsertScore, scores,
  type RosterPlayer, roster,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, and, desc, sql } from "drizzle-orm";

// === DATABASE CONNECTION ===
const dbUrl = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

console.log(`[STORAGE] === DATABASE STARTUP ===`);
console.log(`[STORAGE] TURSO_DATABASE_URL: ${dbUrl ? (dbUrl.startsWith("libsql://") ? dbUrl : "(local file)") : "NOT SET"}`);
console.log(`[STORAGE] TURSO_AUTH_TOKEN: ${authToken ? "set (" + authToken.length + " chars)" : "NOT SET"}`);

let client: ReturnType<typeof createClient>;
try {
  client = createClient({ url: dbUrl, authToken });
} catch (e) {
  console.error(`[STORAGE] FATAL: Failed to create database client:`, e);
  throw e;
}
export const db = drizzle(client);

// === INITIALIZATION (runs before server starts) ===
async function initDatabase(): Promise<void> {
  console.log("[STORAGE] Initializing tables...");

  await client.executeMultiple(`
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
      handicap INTEGER NOT NULL DEFAULT 0,
      roster_id INTEGER DEFAULT NULL
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
      name TEXT NOT NULL UNIQUE,
      handicap INTEGER NOT NULL DEFAULT 18,
      pin TEXT DEFAULT NULL,
      stats_public INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Additive migrations (safe to run multiple times)
  const migrations = [
    "ALTER TABLE games ADD COLUMN course_id TEXT NOT NULL DEFAULT 'st-sofia'",
    "ALTER TABLE players ADD COLUMN roster_id INTEGER DEFAULT NULL",
    "ALTER TABLE roster ADD COLUMN pin TEXT DEFAULT NULL",
    "ALTER TABLE roster ADD COLUMN stats_public INTEGER NOT NULL DEFAULT 0",
  ];
  for (const m of migrations) {
    try { await client.execute(m); } catch {}
  }

  const result = await client.execute("SELECT COUNT(*) as count FROM games");
  const gameCount = (result.rows[0] as any)?.count ?? 0;
  console.log(`[STORAGE] Database ready — ${gameCount} games`);
}

// Export promise for index.ts to await before serving traffic
// If this fails, server still starts but /api/health will show the error
export const storageReady: Promise<void> = initDatabase();

// === STORAGE CLASS (all methods async) ===

export class DatabaseStorage {
  async createGame(game: InsertGame): Promise<Game> {
    return (await db.insert(games).values(game).returning())[0];
  }
  async getGame(id: number): Promise<Game | undefined> {
    return await db.select().from(games).where(eq(games.id, id)).get();
  }
  async getGameByCode(code: string): Promise<Game | undefined> {
    return await db.select().from(games).where(eq(games.code, code)).get();
  }
  async updateGame(id: number, data: Partial<InsertGame>): Promise<Game | undefined> {
    const rows = await db.update(games).set(data).where(eq(games.id, id)).returning();
    return rows[0];
  }
  async listGames(): Promise<Game[]> {
    return await db.select().from(games).orderBy(desc(games.id));
  }
  async deleteGame(id: number): Promise<void> {
    await db.delete(scores).where(eq(scores.gameId, id));
    await db.delete(players).where(eq(players.gameId, id));
    await db.delete(games).where(eq(games.id, id));
  }
  async createPlayer(player: InsertPlayer & { rosterId?: number | null }): Promise<Player> {
    return (await db.insert(players).values(player).returning())[0];
  }
  async getPlayersByGame(gameId: number): Promise<Player[]> {
    return await db.select().from(players).where(eq(players.gameId, gameId));
  }
  async getPlayer(id: number): Promise<Player | undefined> {
    return await db.select().from(players).where(eq(players.id, id)).get();
  }
  async updatePlayer(id: number, data: { rosterId?: number | null }): Promise<Player | undefined> {
    const rows = await db.update(players).set(data).where(eq(players.id, id)).returning();
    return rows[0];
  }
  async deletePlayer(id: number): Promise<void> {
    await db.delete(scores).where(eq(scores.playerId, id));
    await db.delete(players).where(eq(players.id, id));
  }
  async getPlayersByRosterId(rosterId: number): Promise<Player[]> {
    return await db.select().from(players).where(eq(players.rosterId, rosterId));
  }
  async upsertScore(gameId: number, playerId: number, hole: number, data: { grossScore?: number | null; longestDrive?: number | null; closestPin?: number | null }): Promise<Score> {
    const existing = await db.select().from(scores)
      .where(and(eq(scores.gameId, gameId), eq(scores.playerId, playerId), eq(scores.hole, hole)))
      .get();
    if (existing) {
      const updateData: any = {};
      if (data.grossScore !== undefined) updateData.grossScore = data.grossScore;
      if (data.longestDrive !== undefined) updateData.longestDrive = data.longestDrive;
      if (data.closestPin !== undefined) updateData.closestPin = data.closestPin;
      return (await db.update(scores).set(updateData).where(eq(scores.id, existing.id)).returning())[0];
    }
    return (await db.insert(scores).values({
      gameId, playerId, hole,
      grossScore: data.grossScore ?? null,
      longestDrive: data.longestDrive ?? null,
      closestPin: data.closestPin ?? null,
    }).returning())[0];
  }
  async getScoresByGame(gameId: number): Promise<Score[]> {
    return await db.select().from(scores).where(eq(scores.gameId, gameId));
  }
  async getScoresByPlayer(playerId: number): Promise<Score[]> {
    return await db.select().from(scores).where(eq(scores.playerId, playerId));
  }
  async listRoster(): Promise<RosterPlayer[]> {
    return await db.select().from(roster);
  }
  async getRosterPlayer(id: number): Promise<RosterPlayer | undefined> {
    return await db.select().from(roster).where(eq(roster.id, id)).get();
  }
  async addToRoster(name: string, handicap: number): Promise<RosterPlayer> {
    // Use upsert to prevent duplicates
    return await this.upsertRoster(name, handicap);
  }
  async updateRosterPlayer(id: number, data: { name?: string; handicap?: number; pin?: string; statsPublic?: number }): Promise<RosterPlayer | undefined> {
    const rows = await db.update(roster).set(data).where(eq(roster.id, id)).returning();
    return rows[0];
  }
  async deleteRosterPlayer(id: number): Promise<void> {
    await db.delete(roster).where(eq(roster.id, id));
  }
  async upsertRoster(name: string, handicap: number): Promise<RosterPlayer> {
    const existing = await db.select().from(roster).where(eq(roster.name, name)).get();
    if (existing) {
      return (await db.update(roster).set({ handicap }).where(eq(roster.id, existing.id)).returning())[0];
    }
    return (await db.insert(roster).values({ name, handicap }).returning())[0];
  }
}

export const storage = new DatabaseStorage();

// === DATA EXPORT/IMPORT (for manual backup) ===
export async function exportAllData() {
  const [allGames, allPlayers, allScores, allRoster] = await Promise.all([
    db.select().from(games),
    db.select().from(players),
    db.select().from(scores),
    db.select().from(roster),
  ]);
  return { exportedAt: new Date().toISOString(), games: allGames, players: allPlayers, scores: allScores, roster: allRoster };
}

export async function importAllData(data: any) {
  // Clear and re-insert all data
  await db.delete(scores);
  await db.delete(players);
  await db.delete(games);
  await db.delete(roster);
  for (const g of data.games || []) {
    await client.execute({
      sql: `INSERT INTO games (id, name, date, code, course_id, status, first9_bet, second9_bet, whole_game_bet, birdie_pot, eagle_pot, longest_drive_bet, closest_pin_bet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [g.id, g.name, g.date, g.code, g.courseId || g.course_id || "st-sofia", g.status, g.first9Bet ?? g.first9_bet ?? 5, g.second9Bet ?? g.second9_bet ?? 5, g.wholeGameBet ?? g.whole_game_bet ?? 15, g.birdiePot ?? g.birdie_pot ?? 3, g.eaglePot ?? g.eagle_pot ?? 30, g.longestDriveBet ?? g.longest_drive_bet ?? 3, g.closestPinBet ?? g.closest_pin_bet ?? 3],
    });
  }
  for (const p of data.players || []) {
    await client.execute({
      sql: `INSERT INTO players (id, game_id, name, handicap, roster_id) VALUES (?, ?, ?, ?, ?)`,
      args: [p.id, p.gameId ?? p.game_id, p.name, p.handicap, p.rosterId ?? p.roster_id ?? null],
    });
  }
  for (const s of data.scores || []) {
    await client.execute({
      sql: `INSERT INTO scores (id, game_id, player_id, hole, gross_score, longest_drive, closest_pin) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [s.id, s.gameId ?? s.game_id, s.playerId ?? s.player_id, s.hole, s.grossScore ?? s.gross_score ?? null, s.longestDrive ?? s.longest_drive ?? null, s.closestPin ?? s.closest_pin ?? null],
    });
  }
  for (const r of data.roster || []) {
    await client.execute({
      sql: `INSERT INTO roster (id, name, handicap, pin, stats_public) VALUES (?, ?, ?, ?, ?)`,
      args: [r.id, r.name, r.handicap, r.pin ?? null, r.statsPublic ?? r.stats_public ?? 0],
    });
  }
  return { games: (data.games || []).length, players: (data.players || []).length, scores: (data.scores || []).length, roster: (data.roster || []).length };
}

export async function getStorageStatus() {
  const result = await client.execute("SELECT COUNT(*) as count FROM games");
  const gameCount = (result.rows[0] as any)?.count ?? 0;
  const pResult = await client.execute("SELECT COUNT(*) as count FROM players");
  const rResult = await client.execute("SELECT COUNT(*) as count FROM roster");
  return {
    database: dbUrl.startsWith("libsql://") ? "turso (cloud)" : "local file",
    games: gameCount,
    players: (pResult.rows[0] as any)?.count ?? 0,
    roster: (rResult.rows[0] as any)?.count ?? 0,
  };
}
