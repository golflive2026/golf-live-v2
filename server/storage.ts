import {
  type Game, type InsertGame, games,
  type Player, type InsertPlayer, players,
  type Score, type InsertScore, scores,
  type RosterPlayer, roster,
  type Achievement, achievements,
  type GamePhoto, gamePhotos,
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

  // Create tables individually (executeMultiple can fail on some Turso plans)
  const tables = [
    `CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL, code TEXT NOT NULL UNIQUE, course_id TEXT NOT NULL DEFAULT 'st-sofia', status TEXT NOT NULL DEFAULT 'setup', first9_bet REAL NOT NULL DEFAULT 5, second9_bet REAL NOT NULL DEFAULT 5, whole_game_bet REAL NOT NULL DEFAULT 15, birdie_pot REAL NOT NULL DEFAULT 3, eagle_pot REAL NOT NULL DEFAULT 30, longest_drive_bet REAL NOT NULL DEFAULT 3, closest_pin_bet REAL NOT NULL DEFAULT 3)`,
    `CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, name TEXT NOT NULL, handicap INTEGER NOT NULL DEFAULT 0, roster_id INTEGER DEFAULT NULL)`,
    `CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, player_id INTEGER NOT NULL, hole INTEGER NOT NULL, gross_score INTEGER, longest_drive REAL, closest_pin REAL)`,
    `CREATE TABLE IF NOT EXISTS roster (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, handicap INTEGER NOT NULL DEFAULT 18, pin TEXT DEFAULT NULL, stats_public INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, player_id INTEGER NOT NULL, hole INTEGER NOT NULL, sandy INTEGER NOT NULL DEFAULT 0, chip_in INTEGER NOT NULL DEFAULT 0, greenie INTEGER NOT NULL DEFAULT 0, longest_drive_won INTEGER NOT NULL DEFAULT 0, closest_pin_won INTEGER NOT NULL DEFAULT 0, three_putt INTEGER NOT NULL DEFAULT 0, water INTEGER NOT NULL DEFAULT 0, ob INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS game_photos (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id INTEGER NOT NULL, photo_data BLOB NOT NULL, mime_type TEXT NOT NULL DEFAULT 'image/jpeg', caption TEXT, uploaded_by TEXT, created_at TEXT NOT NULL)`,
  ];
  for (const sql of tables) {
    await client.execute(sql);
  }

  // Additive migrations (safe to run multiple times)
  const migrations = [
    "ALTER TABLE games ADD COLUMN course_id TEXT NOT NULL DEFAULT 'st-sofia'",
    "ALTER TABLE players ADD COLUMN roster_id INTEGER DEFAULT NULL",
    "ALTER TABLE roster ADD COLUMN pin TEXT DEFAULT NULL",
    "ALTER TABLE roster ADD COLUMN stats_public INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE roster ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE roster ADD COLUMN email TEXT DEFAULT NULL",
    "ALTER TABLE roster ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 0",
    // Game modes + Action/Dots config
    "ALTER TABLE games ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'stroke'",
    "ALTER TABLE games ADD COLUMN dot_value REAL DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_birdie INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_eagle INTEGER DEFAULT 2",
    "ALTER TABLE games ADD COLUMN dot_albatross INTEGER DEFAULT 5",
    "ALTER TABLE games ADD COLUMN dot_double_bogey INTEGER DEFAULT -1",
    "ALTER TABLE games ADD COLUMN dot_sandy INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_chip_in INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_greenie INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_longest_drive INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_closest_pin INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_three_putt INTEGER DEFAULT -1",
    "ALTER TABLE games ADD COLUMN dot_water INTEGER DEFAULT -1",
    "ALTER TABLE games ADD COLUMN dot_ob INTEGER DEFAULT -1",
    // New dot categories
    "ALTER TABLE games ADD COLUMN dot_polie INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_barkie INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_golden_ferret INTEGER DEFAULT 2",
    "ALTER TABLE games ADD COLUMN dot_arnie INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_hogan INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_sharkie INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_four_putt INTEGER DEFAULT -2",
    "ALTER TABLE games ADD COLUMN dot_tiger_ld INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_mole INTEGER DEFAULT -1",
    "ALTER TABLE games ADD COLUMN dot_foozle INTEGER DEFAULT -1",
    "ALTER TABLE games ADD COLUMN dot_bounce_back INTEGER DEFAULT 1",
    "ALTER TABLE games ADD COLUMN dot_snowman INTEGER DEFAULT -2",
    "ALTER TABLE games ADD COLUMN dot_hole_in_one INTEGER DEFAULT 5",
    "ALTER TABLE games ADD COLUMN carryover_enabled INTEGER DEFAULT 0",
    "ALTER TABLE games ADD COLUMN ld_ctp_mode TEXT NOT NULL DEFAULT 'simple'",
    // New achievement columns
    "ALTER TABLE achievements ADD COLUMN polie INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN barkie INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN golden_ferret INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN arnie INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN hogan INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN sharkie INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN four_putt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN tiger_ld INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE achievements ADD COLUMN mole INTEGER NOT NULL DEFAULT 0",
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
    await db.delete(achievements).where(eq(achievements.gameId, id));
    await db.delete(scores).where(eq(scores.gameId, id));
    await db.delete(players).where(eq(players.gameId, id));
    await db.delete(gamePhotos).where(eq(gamePhotos.gameId, id));
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
    await db.delete(achievements).where(eq(achievements.playerId, id));
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
    // Only return active players
    return await db.select().from(roster).where(eq(roster.active, 1));
  }
  async getRosterPlayer(id: number): Promise<RosterPlayer | undefined> {
    return await db.select().from(roster).where(eq(roster.id, id)).get();
  }
  async addToRoster(name: string, handicap: number): Promise<RosterPlayer> {
    return await this.upsertRoster(name, handicap);
  }
  async updateRosterPlayer(id: number, data: { name?: string; handicap?: number; pin?: string; statsPublic?: number; email?: string | null; notificationsEnabled?: number }): Promise<RosterPlayer | undefined> {
    const rows = await db.update(roster).set(data).where(eq(roster.id, id)).returning();
    return rows[0];
  }
  async deleteRosterPlayer(id: number): Promise<void> {
    // Soft delete — set active=0, preserve data for restore
    await db.update(roster).set({ active: 0 }).where(eq(roster.id, id));
  }
  async upsertRoster(name: string, handicap: number): Promise<RosterPlayer> {
    // Check ALL entries including inactive — auto-restore if same name
    const existing = await db.select().from(roster).where(eq(roster.name, name)).get();
    if (existing) {
      // Reactivate if inactive, update handicap
      const updates: any = { handicap };
      if (!existing.active) updates.active = 1;
      return (await db.update(roster).set(updates).where(eq(roster.id, existing.id)).returning())[0];
    }
    return (await db.insert(roster).values({ name, handicap }).returning())[0];
  }

  // === ACHIEVEMENTS (Action/Dots mode) ===
  async upsertAchievement(gameId: number, playerId: number, hole: number, data: Partial<{
    sandy: number; chipIn: number; greenie: number; longestDriveWon: number;
    closestPinWon: number; threePutt: number; water: number; ob: number;
    polie: number; barkie: number; goldenFerret: number; arnie: number;
    hogan: number; sharkie: number; fourPutt: number; tigerLd: number; mole: number;
  }>): Promise<Achievement> {
    const existing = await db.select().from(achievements)
      .where(and(eq(achievements.gameId, gameId), eq(achievements.playerId, playerId), eq(achievements.hole, hole)))
      .get();
    if (existing) {
      const updateData: any = {};
      for (const [k, v] of Object.entries(data)) {
        if (v !== undefined) updateData[k] = v;
      }
      return (await db.update(achievements).set(updateData).where(eq(achievements.id, existing.id)).returning())[0];
    }
    return (await db.insert(achievements).values({
      gameId, playerId, hole,
      sandy: data.sandy ?? 0, chipIn: data.chipIn ?? 0, greenie: data.greenie ?? 0,
      longestDriveWon: data.longestDriveWon ?? 0, closestPinWon: data.closestPinWon ?? 0,
      threePutt: data.threePutt ?? 0, water: data.water ?? 0, ob: data.ob ?? 0,
      polie: data.polie ?? 0, barkie: data.barkie ?? 0, goldenFerret: data.goldenFerret ?? 0,
      arnie: data.arnie ?? 0, hogan: data.hogan ?? 0, sharkie: data.sharkie ?? 0,
      fourPutt: data.fourPutt ?? 0, tigerLd: data.tigerLd ?? 0, mole: data.mole ?? 0,
    }).returning())[0];
  }
  async getAchievementsByGame(gameId: number): Promise<Achievement[]> {
    return await db.select().from(achievements).where(eq(achievements.gameId, gameId));
  }

  // === PHOTOS ===
  async createPhoto(gameId: number, photoData: Buffer, mimeType: string, caption?: string, uploadedBy?: string): Promise<GamePhoto> {
    // Use raw SQL for BLOB insert since Drizzle has issues with Turso BLOBs
    const result = await client.execute({
      sql: `INSERT INTO game_photos (game_id, photo_data, mime_type, caption, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, game_id, mime_type, caption, uploaded_by, created_at`,
      args: [gameId, photoData, mimeType, caption ?? null, uploadedBy ?? null, new Date().toISOString()],
    });
    const row = result.rows[0] as any;
    return { id: row.id, gameId: row.game_id, mimeType: row.mime_type, caption: row.caption, uploadedBy: row.uploaded_by, createdAt: row.created_at };
  }
  async getPhotosByGame(gameId: number): Promise<GamePhoto[]> {
    // Return metadata only (no BLOB)
    const result = await client.execute({
      sql: `SELECT id, game_id, mime_type, caption, uploaded_by, created_at FROM game_photos WHERE game_id = ? ORDER BY id`,
      args: [gameId],
    });
    return result.rows.map((r: any) => ({
      id: r.id, gameId: r.game_id, mimeType: r.mime_type,
      caption: r.caption, uploadedBy: r.uploaded_by, createdAt: r.created_at,
    }));
  }
  async getPhotoData(photoId: number): Promise<{ data: Buffer; mimeType: string } | undefined> {
    const result = await client.execute({
      sql: `SELECT photo_data, mime_type FROM game_photos WHERE id = ?`,
      args: [photoId],
    });
    if (result.rows.length === 0) return undefined;
    const row = result.rows[0] as any;
    return { data: Buffer.from(row.photo_data), mimeType: row.mime_type };
  }
  async getPhotoCountByGame(gameId: number): Promise<number> {
    const result = await client.execute({
      sql: `SELECT COUNT(*) as count FROM game_photos WHERE game_id = ?`,
      args: [gameId],
    });
    return (result.rows[0] as any)?.count ?? 0;
  }
  async deletePhoto(photoId: number): Promise<void> {
    await db.delete(gamePhotos).where(eq(gamePhotos.id, photoId));
  }
}

export const storage = new DatabaseStorage();

// === DATA EXPORT/IMPORT (for manual backup) ===
export async function exportAllData() {
  const [allGames, allPlayers, allScores, allRoster, allAchievements] = await Promise.all([
    db.select().from(games),
    db.select().from(players),
    db.select().from(scores),
    db.select().from(roster),
    db.select().from(achievements),
  ]);
  return { exportedAt: new Date().toISOString(), games: allGames, players: allPlayers, scores: allScores, roster: allRoster, achievements: allAchievements };
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
