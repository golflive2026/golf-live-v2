import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, exportAllData, importAllData, getStorageStatus } from "./storage";
import { COURSE_LIST, getCourse } from "@shared/schema";
import { computeLeaderboard, computeSettlement } from "@shared/golf";
import { computeBadges } from "./badges";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  app.get("/api/courses", (_req, res) => {
    res.json(COURSE_LIST.map(c => ({ id: c.id, name: c.name, location: c.location, totalPar: c.totalPar })));
  });

  app.get("/api/games", async (_req, res) => {
    res.json(await storage.listGames());
  });

  app.post("/api/games", async (req, res) => {
    try {
      const { name, date, courseId, first9Bet, second9Bet, wholeGameBet, birdiePot, eaglePot, longestDriveBet, closestPinBet } = req.body;
      if (!name || !date) return res.status(400).json({ error: "Name and date are required" });
      let code = generateCode();
      while (await storage.getGameByCode(code)) { code = generateCode(); }
      const game = await storage.createGame({
        name, date, code,
        courseId: courseId || "st-sofia",
        status: "setup",
        first9Bet: first9Bet ?? 5, second9Bet: second9Bet ?? 5, wholeGameBet: wholeGameBet ?? 15,
        birdiePot: birdiePot ?? 3, eaglePot: eaglePot ?? 30,
        longestDriveBet: longestDriveBet ?? 3, closestPinBet: closestPinBet ?? 3,
      });
      res.json(game);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/games/:id", async (req, res) => {
    const game = await storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.get("/api/games/code/:code", async (req, res) => {
    const game = await storage.getGameByCode(req.params.code.toUpperCase());
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.patch("/api/games/:id", async (req, res) => {
    const game = await storage.updateGame(Number(req.params.id), req.body);
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.post("/api/games/:id/start", async (req, res) => {
    const game = await storage.updateGame(Number(req.params.id), { status: "active" });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.post("/api/games/:id/finish", async (req, res) => {
    const game = await storage.updateGame(Number(req.params.id), { status: "finished" });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.delete("/api/games/:id", async (req, res) => {
    const game = await storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    // If any player in this game has a claimed profile (PIN set), require their PIN to delete
    const gamePlayers = await storage.getPlayersByGame(game.id);
    const claimedRosterIds = gamePlayers.filter(p => p.rosterId).map(p => p.rosterId!);
    let needsPin = false;
    for (const rid of claimedRosterIds) {
      const rp = await storage.getRosterPlayer(rid);
      if (rp?.pin) { needsPin = true; break; }
    }
    if (needsPin) {
      const { pin } = req.body || {};
      if (!pin) return res.status(403).json({ error: "This game has claimed players. A player PIN is required to delete.", requiresPin: true });
      // Verify PIN belongs to any claimed player in this game
      let pinValid = false;
      for (const rid of claimedRosterIds) {
        const rp = await storage.getRosterPlayer(rid);
        if (rp?.pin === pin) { pinValid = true; break; }
      }
      if (!pinValid) return res.status(403).json({ error: "Invalid PIN" });
    }
    await storage.deleteGame(game.id);
    res.json({ ok: true });
  });

  app.post("/api/games/:id/players", async (req, res) => {
    try {
      const gameId = Number(req.params.id);
      const game = await storage.getGame(gameId);
      if (!game) return res.status(404).json({ error: "Game not found" });
      const existingPlayers = await storage.getPlayersByGame(gameId);
      if (existingPlayers.length >= 50) return res.status(400).json({ error: "Maximum 50 players" });
      const { name, handicap, rosterId } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      // Check for duplicate player name in this game
      if (existingPlayers.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
        return res.status(400).json({ error: "Player already in this game" });
      }
      // Auto-save to roster and link
      let linkedRosterId = rosterId ?? null;
      try {
        const rosterEntry = await storage.upsertRoster(name.trim(), handicap ?? 0);
        if (!linkedRosterId) linkedRosterId = rosterEntry.id;
      } catch (e) {}
      const player = await storage.createPlayer({ gameId, name: name.trim(), handicap: handicap ?? 0, rosterId: linkedRosterId });
      res.json(player);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/games/:id/players", async (req, res) => {
    res.json(await storage.getPlayersByGame(Number(req.params.id)));
  });

  app.delete("/api/players/:id", async (req, res) => {
    await storage.deletePlayer(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/scores", async (req, res) => {
    try {
      const { gameId, playerId, hole, grossScore, longestDrive, closestPin } = req.body;
      if (!gameId || !playerId || !hole) return res.status(400).json({ error: "gameId, playerId, and hole are required" });
      // Block score edits on finished games
      const game = await storage.getGame(gameId);
      if (game?.status === "finished") return res.status(403).json({ error: "Game is finished — scores are locked" });
      const score = await storage.upsertScore(gameId, playerId, hole, {
        grossScore: grossScore !== undefined ? grossScore : undefined,
        longestDrive: longestDrive !== undefined ? longestDrive : undefined,
        closestPin: closestPin !== undefined ? closestPin : undefined,
      });
      res.json(score);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/games/:id/scores", async (req, res) => {
    res.json(await storage.getScoresByGame(Number(req.params.id)));
  });

  app.get("/api/games/:id/full", async (req, res) => {
    const game = await storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    const [gamePlayers, gameScores] = await Promise.all([
      storage.getPlayersByGame(game.id),
      storage.getScoresByGame(game.id),
    ]);
    res.json({ game, players: gamePlayers, scores: gameScores });
  });

  // Roster endpoints
  app.get("/api/roster", async (_req, res) => {
    const list = await storage.listRoster();
    // Strip PINs — never expose to clients
    res.json(list.map(({ pin, ...rest }) => ({ ...rest, hasPin: !!pin })));
  });

  app.post("/api/roster", async (req, res) => {
    try {
      const { name, handicap } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const player = await storage.addToRoster(name.trim(), handicap ?? 18);
      res.json(player);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/roster/:id", async (req, res) => {
    const updated = await storage.updateRosterPlayer(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Player not found" });
    res.json(updated);
  });

  app.delete("/api/roster/:id", async (req, res) => {
    const rp = await storage.getRosterPlayer(Number(req.params.id));
    if (!rp) return res.status(404).json({ error: "Player not found" });
    // Claimed accounts require PIN to delete
    if (rp.pin) {
      const { pin } = req.body || {};
      if (!pin) return res.status(403).json({ error: "This account is claimed. PIN required to delete.", requiresPin: true });
      if (pin !== rp.pin) return res.status(403).json({ error: "Wrong PIN" });
    }
    await storage.deleteRosterPlayer(rp.id);
    res.json({ ok: true, restored: false });
  });

  // Get single roster player (public info — no pin)
  app.get("/api/roster/:id", async (req, res) => {
    const rp = await storage.getRosterPlayer(Number(req.params.id));
    if (!rp) return res.status(404).json({ error: "Player not found" });
    const { pin, ...safe } = rp;
    res.json({ ...safe, hasPin: !!pin });
  });

  // Claim profile: link a game-player to a roster entry, optionally set PIN
  app.post("/api/roster/:id/claim", async (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = await storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const { pin, playerId } = req.body;
      if (rp.pin) return res.status(409).json({ error: "Profile already claimed. Use PIN to verify." });
      if (pin && typeof pin === "string" && /^\d{4}$/.test(pin)) {
        await storage.updateRosterPlayer(rosterId, { pin });
      }
      if (playerId) {
        await storage.updatePlayer(Number(playerId), { rosterId });
      }
      res.json({ ok: true, rosterId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Verify PIN and optionally link a game-player
  app.post("/api/roster/:id/verify-pin", async (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = await storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const { pin, playerId } = req.body;
      if (!rp.pin) return res.status(400).json({ error: "No PIN set" });
      const valid = rp.pin === pin;
      if (valid && playerId) {
        await storage.updatePlayer(Number(playerId), { rosterId });
      }
      res.json({ valid });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Set PIN for the first time
  app.post("/api/roster/:id/set-pin", async (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = await storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Player not found" });
      if (rp.pin) return res.status(409).json({ error: "PIN already set" });
      const { pin } = req.body;
      if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }
      await storage.updateRosterPlayer(rosterId, { pin });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Toggle stats public/private (requires PIN)
  app.post("/api/roster/:id/toggle-public", async (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = await storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const { pin } = req.body;
      if (!rp.pin || rp.pin !== pin) return res.status(403).json({ error: "Invalid PIN" });
      const newValue = rp.statsPublic ? 0 : 1;
      await storage.updateRosterPlayer(rosterId, { statsPublic: newValue });
      res.json({ statsPublic: newValue });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Get player stats across all games
  app.get("/api/roster/:id/stats", async (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = await storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const pin = req.query.pin as string | undefined;
      const hasPin = !!rp.pin;
      if (hasPin && !rp.statsPublic && (!pin || pin !== rp.pin)) {
        return res.status(403).json({ error: "Stats are private. PIN required.", hasPin: true });
      }
      const linkedPlayers = await storage.getPlayersByRosterId(rosterId);
      const gameHistory = await Promise.all(linkedPlayers.map(async (p) => {
        const game = await storage.getGame(p.gameId);
        if (!game) return null;
        const course = getCourse(game.courseId);
        const [allPlayers, allScores] = await Promise.all([
          storage.getPlayersByGame(game.id),
          storage.getScoresByGame(game.id),
        ]);
        const playerScores = allScores.filter(s => s.playerId === p.id);
        const entries = computeLeaderboard(allPlayers, allScores, course);
        const settlement = computeSettlement(entries, allScores, allPlayers, game, course);
        const mySettlement = settlement.find(s => s.playerId === p.id);
        const myEntry = entries.find(e => e.player.id === p.id);
        let grossTotal = 0, holesPlayed = 0, birdies = 0, eagles = 0;
        for (const s of playerScores) {
          if (s.grossScore != null) {
            grossTotal += s.grossScore;
            holesPlayed++;
            const par = course.holePars[s.hole - 1];
            if (s.grossScore <= par - 2) eagles++;
            else if (s.grossScore === par - 1) birdies++;
          }
        }
        return {
          gameId: game.id, gameName: game.name, gameDate: game.date,
          courseId: game.courseId, courseName: course.name, gameStatus: game.status,
          handicap: p.handicap, holesPlayed, grossTotal,
          netTotal: myEntry?.netTotal ?? 0, birdies, eagles,
          moneyWon: mySettlement?.grandTotal ?? 0,
          matchPlay: mySettlement?.matchPlay ?? 0,
          birdieWinnings: mySettlement?.birdies ?? 0,
          eagleWinnings: mySettlement?.eagles ?? 0,
          specialBets: mySettlement?.specialBets ?? 0,
          totalPlayers: allPlayers.length,
          position: myEntry ? entries.indexOf(myEntry) + 1 : 0,
        };
      }));
      const validHistory = gameHistory.filter(Boolean) as any[];
      const finished = validHistory.filter(g => g.gameStatus === "finished");
      const full18 = finished.filter(g => g.holesPlayed === 18);
      const totalMoney = finished.reduce((sum: number, g: any) => sum + g.moneyWon, 0);
      const avgGross = full18.length > 0 ? full18.reduce((s: number, g: any) => s + g.grossTotal, 0) / full18.length : 0;
      const avgNet = full18.length > 0 ? full18.reduce((s: number, g: any) => s + g.netTotal, 0) / full18.length : 0;
      res.json({
        rosterId, name: rp.name, handicap: rp.handicap,
        statsPublic: !!rp.statsPublic,
        gamesPlayed: validHistory.length,
        gamesFinished: finished.length,
        totalMoney,
        avgGross: Math.round(avgGross * 10) / 10,
        avgNet: Math.round(avgNet * 10) / 10,
        totalBirdies: validHistory.reduce((s: number, g: any) => s + g.birdies, 0),
        totalEagles: validHistory.reduce((s: number, g: any) => s + g.eagles, 0),
        wins: finished.filter((g: any) => g.position === 1).length,
        gameHistory: validHistory,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // === DATA MANAGEMENT & HEALTH ===
  // Badges — fun achievements computed from game history
  app.get("/api/badges", async (_req, res) => {
    try {
      const allGames = await storage.listGames();
      const allRoster = await storage.listRoster();
      // Fetch all players and scores in parallel
      const [playersArrays, scoresArrays] = await Promise.all([
        Promise.all(allGames.map(g => storage.getPlayersByGame(g.id))),
        Promise.all(allGames.map(g => storage.getScoresByGame(g.id))),
      ]);
      const allPlayers = playersArrays.flat();
      const allScores = scoresArrays.flat();
      const badgeMap = await computeBadges(allGames, allPlayers, allScores, allRoster);
      const result: Record<number, any[]> = {};
      badgeMap.forEach((badges, rosterId) => { result[rosterId] = badges; });
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/health", async (_req, res) => {
    res.json(await getStorageStatus());
  });

  app.get("/api/export", async (_req, res) => {
    try {
      const data = await exportAllData();
      res.setHeader("Content-Disposition", `attachment; filename=golf-live-backup-${new Date().toISOString().split("T")[0]}.json`);
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/import", async (req, res) => {
    try {
      const data = req.body;
      if (!data || !data.games) return res.status(400).json({ error: "Invalid backup format" });
      const counts = await importAllData(data);
      res.json({ ok: true, restored: counts });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return httpServer;
}
