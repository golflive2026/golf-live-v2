import {
  type Game, type InsertGame, games,
  type Player, type InsertPlayer, players,
  type Score, type InsertScore, scores,
  type RosterPlayer, roster,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and, desc } from "drizzle-orm";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { pushToCloud, pullFromCloud, isCloudBackupEnabled } from "./cloud-backup";

const dbPath = process.env.DATABASE_PATH || "data.db";
const backupPath = dbPath.replace(/\.db$/, "-backup.json");

// === STARTUP DIAGNOSTICS ===
console.log(`[STORAGE] ===== DATABASE STARTUP =====`);
console.log(`[STORAGE] DATABASE_PATH env: ${process.env.DATABASE_PATH || "(not set, using default 'data.db')"}`);
console.log(`[STORAGE] Resolved path: ${path.resolve(dbPath)}`);

if (!process.env.DATABASE_PATH) {
  console.warn(`[STORAGE] WARNING: DATABASE_PATH not set! Using ephemeral 'data.db' — DATA WILL BE LOST ON REDEPLOY`);
}

// Ensure the database directory exists
const dbDir = path.dirname(path.resolve(dbPath));
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
  console.log(`[STORAGE] Created directory: ${dbDir}`);
}

// Check if the directory appears to be a persistent mount
try {
  // On Linux, check if /proc/mounts contains our data directory
  if (existsSync("/proc/mounts")) {
    const mounts = readFileSync("/proc/mounts", "utf-8");
    const isMounted = mounts.split("\n").some(line => {
      const parts = line.split(" ");
      return parts[1] && dbDir.startsWith(parts[1]) && parts[1] !== "/";
    });
    if (isMounted) {
      console.log(`[STORAGE] Persistent disk DETECTED at ${dbDir}`);
    } else {
      console.warn(`[STORAGE] WARNING: No persistent disk mount found at ${dbDir}`);
      console.warn(`[STORAGE] Data is on EPHEMERAL filesystem — will be lost on redeploy!`);
      console.warn(`[STORAGE] Go to Render Dashboard → your service → Disks → create a disk mounted at ${dbDir}`);
    }
  }
} catch (e) {}

const isNewDb = !existsSync(dbPath);
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

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

// Migrations (additive only, try/catch wrapped)
try { sqlite.exec("ALTER TABLE games ADD COLUMN course_id TEXT NOT NULL DEFAULT 'st-sofia'"); } catch (e) {}
try { sqlite.exec("ALTER TABLE players ADD COLUMN roster_id INTEGER DEFAULT NULL"); } catch (e) {}
try { sqlite.exec("ALTER TABLE roster ADD COLUMN pin TEXT DEFAULT NULL"); } catch (e) {}
try { sqlite.exec("ALTER TABLE roster ADD COLUMN stats_public INTEGER NOT NULL DEFAULT 0"); } catch (e) {}

export const db = drizzle(sqlite);

// === RESTORE CHAIN: local SQLite → local JSON → cloud Gist ===
const gameCount = (sqlite.prepare("SELECT COUNT(*) as count FROM games").get() as any)?.count ?? 0;

function restoreFromBackup(backup: any, source: string): number {
  const tx = sqlite.transaction(() => {
    for (const g of backup.games || []) {
      sqlite.prepare(`INSERT OR REPLACE INTO games (id, name, date, code, course_id, status, first9_bet, second9_bet, whole_game_bet, birdie_pot, eagle_pot, longest_drive_bet, closest_pin_bet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        g.id, g.name, g.date, g.code, g.courseId || g.course_id || "st-sofia", g.status,
        g.first9Bet ?? g.first9_bet ?? 5, g.second9Bet ?? g.second9_bet ?? 5,
        g.wholeGameBet ?? g.whole_game_bet ?? 15, g.birdiePot ?? g.birdie_pot ?? 3,
        g.eaglePot ?? g.eagle_pot ?? 30, g.longestDriveBet ?? g.longest_drive_bet ?? 3,
        g.closestPinBet ?? g.closest_pin_bet ?? 3
      );
    }
    for (const p of backup.players || []) {
      sqlite.prepare(`INSERT OR REPLACE INTO players (id, game_id, name, handicap, roster_id) VALUES (?, ?, ?, ?, ?)`).run(
        p.id, p.gameId ?? p.game_id, p.name, p.handicap, p.rosterId ?? p.roster_id ?? null
      );
    }
    for (const s of backup.scores || []) {
      sqlite.prepare(`INSERT OR REPLACE INTO scores (id, game_id, player_id, hole, gross_score, longest_drive, closest_pin) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        s.id, s.gameId ?? s.game_id, s.playerId ?? s.player_id, s.hole,
        s.grossScore ?? s.gross_score ?? null, s.longestDrive ?? s.longest_drive ?? null,
        s.closestPin ?? s.closest_pin ?? null
      );
    }
    for (const r of backup.roster || []) {
      sqlite.prepare(`INSERT OR REPLACE INTO roster (id, name, handicap, pin, stats_public) VALUES (?, ?, ?, ?, ?)`).run(
        r.id, r.name, r.handicap, r.pin ?? null, r.statsPublic ?? r.stats_public ?? 0
      );
    }
  });
  tx();
  const count = (sqlite.prepare("SELECT COUNT(*) as count FROM games").get() as any)?.count ?? 0;
  console.log(`[STORAGE] Restored ${count} games from ${source}`);
  return count;
}

if (gameCount > 0) {
  console.log(`[STORAGE] Database has ${gameCount} games — no restore needed`);
} else {
  console.warn(`[STORAGE] Database is empty — starting restore chain...`);
  let restored = false;

  // Step 1: Try local JSON backup
  if (!restored && existsSync(backupPath)) {
    console.log(`[STORAGE] Trying local backup: ${backupPath}`);
    try {
      const backup = JSON.parse(readFileSync(backupPath, "utf-8"));
      if (backup.games?.length > 0) {
        restoreFromBackup(backup, "local JSON backup");
        restored = true;
      }
    } catch (e) {
      console.error(`[STORAGE] Local backup restore failed:`, e);
    }
  }

  // Step 2: Try cloud backup (GitHub Gist) — async, run at startup
  if (!restored && isCloudBackupEnabled()) {
    console.log(`[STORAGE] Trying cloud backup (GitHub Gist)...`);
    // We need to do this synchronously at startup — use a flag and restore when ready
    pullFromCloud().then((backup) => {
      if (backup && backup.games?.length > 0) {
        const currentCount = (sqlite.prepare("SELECT COUNT(*) as count FROM games").get() as any)?.count ?? 0;
        if (currentCount === 0) {
          restoreFromBackup(backup, "GitHub Gist cloud backup");
        }
      } else {
        console.log(`[STORAGE] No cloud backup available`);
      }
    }).catch(e => {
      console.error(`[STORAGE] Cloud restore failed:`, e);
    });
  }

  if (!restored) {
    console.warn(`[STORAGE] No backup found — starting fresh`);
    if (!isCloudBackupEnabled()) {
      console.warn(`[STORAGE] TIP: Set GITHUB_BACKUP_TOKEN env var to enable cloud backup`);
    }
  }
}

console.log(`[STORAGE] Cloud backup: ${isCloudBackupEnabled() ? "ENABLED" : "DISABLED (set GITHUB_BACKUP_TOKEN)"}`);
console.log(`[STORAGE] ===== STARTUP COMPLETE =====`);

// === STATUS tracking ===
let lastBackupTime: string | null = null;
let lastCloudBackupTime: string | null = null;
let lastCloudBackupOk: boolean | null = null;

export function getStorageStatus() {
  const count = (sqlite.prepare("SELECT COUNT(*) as count FROM games").get() as any)?.count ?? 0;
  const playerCount = (sqlite.prepare("SELECT COUNT(*) as count FROM players").get() as any)?.count ?? 0;
  const rosterCount = (sqlite.prepare("SELECT COUNT(*) as count FROM roster").get() as any)?.count ?? 0;
  return {
    dbPath: path.resolve(dbPath),
    databasePathEnv: process.env.DATABASE_PATH || "(not set — using default)",
    cloudBackup: isCloudBackupEnabled() ? "enabled" : "disabled",
    games: count,
    players: playerCount,
    roster: rosterCount,
    lastLocalBackup: lastBackupTime,
    lastCloudBackup: lastCloudBackupTime,
    lastCloudBackupOk,
  };
}

// === AUTO-BACKUP: local JSON + cloud Gist after mutations ===
let backupTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleBackup() {
  // Debounce: backup at most once per 10 seconds
  if (backupTimer) clearTimeout(backupTimer);
  backupTimer = setTimeout(() => {
    try {
      const data = exportAllData();

      // 1. Local JSON backup (sync, instant)
      writeFileSync(backupPath, JSON.stringify(data), "utf-8");
      lastBackupTime = new Date().toISOString();

      // 2. Cloud backup (async, non-blocking)
      if (isCloudBackupEnabled()) {
        pushToCloud(data).then(ok => {
          lastCloudBackupTime = new Date().toISOString();
          lastCloudBackupOk = ok;
        }).catch(() => {
          lastCloudBackupOk = false;
        });
      }
    } catch (e) {
      console.error("[STORAGE] Backup failed:", e);
    }
  }, 10000);
}

export function exportAllData() {
  const allGames = db.select().from(games).all();
  const allPlayers = db.select().from(players).all();
  const allScores = db.select().from(scores).all();
  const allRoster = db.select().from(roster).all();
  return {
    exportedAt: new Date().toISOString(),
    games: allGames,
    players: allPlayers,
    scores: allScores,
    roster: allRoster,
  };
}

export function importAllData(data: any) {
  const tx = sqlite.transaction(() => {
    // Clear existing data
    sqlite.exec("DELETE FROM scores; DELETE FROM players; DELETE FROM games; DELETE FROM roster;");
    for (const g of data.games || []) {
      sqlite.prepare(`INSERT INTO games (id, name, date, code, course_id, status, first9_bet, second9_bet, whole_game_bet, birdie_pot, eagle_pot, longest_drive_bet, closest_pin_bet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        g.id, g.name, g.date, g.code, g.courseId || "st-sofia", g.status, g.first9Bet ?? g.first9_bet, g.second9Bet ?? g.second9_bet, g.wholeGameBet ?? g.whole_game_bet, g.birdiePot ?? g.birdie_pot, g.eaglePot ?? g.eagle_pot, g.longestDriveBet ?? g.longest_drive_bet, g.closestPinBet ?? g.closest_pin_bet
      );
    }
    for (const p of data.players || []) {
      sqlite.prepare(`INSERT INTO players (id, game_id, name, handicap, roster_id) VALUES (?, ?, ?, ?, ?)`).run(
        p.id, p.gameId ?? p.game_id, p.name, p.handicap, p.rosterId ?? p.roster_id ?? null
      );
    }
    for (const s of data.scores || []) {
      sqlite.prepare(`INSERT INTO scores (id, game_id, player_id, hole, gross_score, longest_drive, closest_pin) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        s.id, s.gameId ?? s.game_id, s.playerId ?? s.player_id, s.hole, s.grossScore ?? s.gross_score ?? null, s.longestDrive ?? s.longest_drive ?? null, s.closestPin ?? s.closest_pin ?? null
      );
    }
    for (const r of data.roster || []) {
      sqlite.prepare(`INSERT INTO roster (id, name, handicap, pin, stats_public) VALUES (?, ?, ?, ?, ?)`).run(
        r.id, r.name, r.handicap, r.pin ?? null, r.statsPublic ?? r.stats_public ?? 0
      );
    }
  });
  tx();
  scheduleBackup();
  return { games: (data.games || []).length, players: (data.players || []).length, scores: (data.scores || []).length, roster: (data.roster || []).length };
}

// === STORAGE CLASS ===

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
    const result = db.insert(games).values(game).returning().get();
    scheduleBackup();
    return result;
  }
  getGame(id: number): Game | undefined {
    return db.select().from(games).where(eq(games.id, id)).get();
  }
  getGameByCode(code: string): Game | undefined {
    return db.select().from(games).where(eq(games.code, code)).get();
  }
  updateGame(id: number, data: Partial<InsertGame>): Game | undefined {
    const result = db.update(games).set(data).where(eq(games.id, id)).returning().get();
    scheduleBackup();
    return result;
  }
  listGames(): Game[] {
    return db.select().from(games).orderBy(desc(games.id)).all();
  }
  deleteGame(id: number): void {
    db.delete(scores).where(eq(scores.gameId, id)).run();
    db.delete(players).where(eq(players.gameId, id)).run();
    db.delete(games).where(eq(games.id, id)).run();
    scheduleBackup();
  }
  createPlayer(player: InsertPlayer & { rosterId?: number | null }): Player {
    const result = db.insert(players).values(player).returning().get();
    scheduleBackup();
    return result;
  }
  getPlayersByGame(gameId: number): Player[] {
    return db.select().from(players).where(eq(players.gameId, gameId)).all();
  }
  getPlayer(id: number): Player | undefined {
    return db.select().from(players).where(eq(players.id, id)).get();
  }
  updatePlayer(id: number, data: { rosterId?: number | null }): Player | undefined {
    const result = db.update(players).set(data).where(eq(players.id, id)).returning().get();
    scheduleBackup();
    return result;
  }
  deletePlayer(id: number): void {
    db.delete(scores).where(eq(scores.playerId, id)).run();
    db.delete(players).where(eq(players.id, id)).run();
    scheduleBackup();
  }
  getPlayersByRosterId(rosterId: number): Player[] {
    return db.select().from(players).where(eq(players.rosterId, rosterId)).all();
  }
  upsertScore(gameId: number, playerId: number, hole: number, data: { grossScore?: number | null; longestDrive?: number | null; closestPin?: number | null }): Score {
    const existing = db.select().from(scores)
      .where(and(eq(scores.gameId, gameId), eq(scores.playerId, playerId), eq(scores.hole, hole)))
      .get();
    let result: Score;
    if (existing) {
      const updateData: any = {};
      if (data.grossScore !== undefined) updateData.grossScore = data.grossScore;
      if (data.longestDrive !== undefined) updateData.longestDrive = data.longestDrive;
      if (data.closestPin !== undefined) updateData.closestPin = data.closestPin;
      result = db.update(scores).set(updateData).where(eq(scores.id, existing.id)).returning().get();
    } else {
      result = db.insert(scores).values({
        gameId, playerId, hole,
        grossScore: data.grossScore ?? null,
        longestDrive: data.longestDrive ?? null,
        closestPin: data.closestPin ?? null,
      }).returning().get();
    }
    scheduleBackup();
    return result;
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
    const result = db.insert(roster).values({ name, handicap }).returning().get();
    scheduleBackup();
    return result;
  }
  updateRosterPlayer(id: number, data: { name?: string; handicap?: number; pin?: string; statsPublic?: number }): RosterPlayer | undefined {
    const result = db.update(roster).set(data).where(eq(roster.id, id)).returning().get();
    scheduleBackup();
    return result;
  }
  deleteRosterPlayer(id: number): void {
    db.delete(roster).where(eq(roster.id, id)).run();
    scheduleBackup();
  }
  upsertRoster(name: string, handicap: number): RosterPlayer {
    const existing = db.select().from(roster).where(eq(roster.name, name)).get();
    if (existing) {
      return db.update(roster).set({ handicap }).where(eq(roster.id, existing.id)).returning().get();
    }
    const result = db.insert(roster).values({ name, handicap }).returning().get();
    scheduleBackup();
    return result;
  }
}

export const storage = new DatabaseStorage();

// Graceful shutdown: flush local + cloud backup, then close SQLite
async function closeDb() {
  try {
    if (backupTimer) clearTimeout(backupTimer);
    const data = exportAllData();

    // 1. Local backup (sync)
    writeFileSync(backupPath, JSON.stringify(data), "utf-8");
    console.log("[STORAGE] Final local backup saved");

    // 2. Cloud backup (await — this is our last chance before container dies)
    if (isCloudBackupEnabled()) {
      console.log("[STORAGE] Pushing final cloud backup...");
      const ok = await pushToCloud(data);
      console.log(`[STORAGE] Cloud backup: ${ok ? "SUCCESS" : "FAILED"}`);
    }

    sqlite.close();
    console.log("[STORAGE] Database closed cleanly");
  } catch (e) {
    console.error("[STORAGE] Shutdown error:", e);
  }
  process.exit(0);
}
process.on("SIGTERM", () => { closeDb(); });
process.on("SIGINT", () => { closeDb(); });
