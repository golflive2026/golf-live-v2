import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, exportAllData, importAllData } from "./storage";
import { COURSE_LIST, getCourse } from "@shared/schema";
import { computeLeaderboard, computeSettlement } from "@shared/golf";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // List courses
  app.get("/api/courses", (_req, res) => {
    res.json(COURSE_LIST.map(c => ({ id: c.id, name: c.name, location: c.location, totalPar: c.totalPar })));
  });

  // List games (history)
  app.get("/api/games", (_req, res) => {
    const allGames = storage.listGames();
    res.json(allGames);
  });

  // Create game
  app.post("/api/games", (req, res) => {
    try {
      const { name, date, courseId, first9Bet, second9Bet, wholeGameBet, birdiePot, eaglePot, longestDriveBet, closestPinBet } = req.body;
      if (!name || !date) return res.status(400).json({ error: "Name and date are required" });
      let code = generateCode();
      while (storage.getGameByCode(code)) { code = generateCode(); }
      const game = storage.createGame({
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

  app.get("/api/games/:id", (req, res) => {
    const game = storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.get("/api/games/code/:code", (req, res) => {
    const game = storage.getGameByCode(req.params.code.toUpperCase());
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.patch("/api/games/:id", (req, res) => {
    const game = storage.updateGame(Number(req.params.id), req.body);
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.post("/api/games/:id/start", (req, res) => {
    const game = storage.updateGame(Number(req.params.id), { status: "active" });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.post("/api/games/:id/finish", (req, res) => {
    const game = storage.updateGame(Number(req.params.id), { status: "finished" });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  app.delete("/api/games/:id", (req, res) => {
    const game = storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    storage.deleteGame(game.id);
    res.json({ ok: true });
  });

  app.post("/api/games/:id/players", (req, res) => {
    try {
      const gameId = Number(req.params.id);
      const game = storage.getGame(gameId);
      if (!game) return res.status(404).json({ error: "Game not found" });
      const existingPlayers = storage.getPlayersByGame(gameId);
      if (existingPlayers.length >= 50) return res.status(400).json({ error: "Maximum 50 players" });
      const { name, handicap, rosterId } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      // Auto-save to roster and capture rosterId if not provided
      let linkedRosterId = rosterId ?? null;
      try {
        const rosterEntry = storage.upsertRoster(name, handicap ?? 0);
        if (!linkedRosterId) linkedRosterId = rosterEntry.id;
      } catch (e) {}
      const player = storage.createPlayer({ gameId, name, handicap: handicap ?? 0, rosterId: linkedRosterId });
      res.json(player);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/games/:id/players", (req, res) => {
    res.json(storage.getPlayersByGame(Number(req.params.id)));
  });

  app.delete("/api/players/:id", (req, res) => {
    storage.deletePlayer(Number(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/scores", (req, res) => {
    try {
      const { gameId, playerId, hole, grossScore, longestDrive, closestPin } = req.body;
      if (!gameId || !playerId || !hole) return res.status(400).json({ error: "gameId, playerId, and hole are required" });
      const score = storage.upsertScore(gameId, playerId, hole, {
        grossScore: grossScore !== undefined ? grossScore : undefined,
        longestDrive: longestDrive !== undefined ? longestDrive : undefined,
        closestPin: closestPin !== undefined ? closestPin : undefined,
      });
      res.json(score);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/games/:id/scores", (req, res) => {
    res.json(storage.getScoresByGame(Number(req.params.id)));
  });

  app.get("/api/games/:id/full", (req, res) => {
    const game = storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    const gamePlayers = storage.getPlayersByGame(game.id);
    const gameScores = storage.getScoresByGame(game.id);
    res.json({ game, players: gamePlayers, scores: gameScores });
  });

  // Roster endpoints
  app.get("/api/roster", (_req, res) => {
    res.json(storage.listRoster());
  });

  app.post("/api/roster", (req, res) => {
    try {
      const { name, handicap } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const player = storage.addToRoster(name, handicap ?? 18);
      res.json(player);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.patch("/api/roster/:id", (req, res) => {
    const updated = storage.updateRosterPlayer(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Player not found" });
    res.json(updated);
  });

  app.delete("/api/roster/:id", (req, res) => {
    storage.deleteRosterPlayer(Number(req.params.id));
    res.json({ ok: true });
  });

  // Get single roster player (public info only — no pin)
  app.get("/api/roster/:id", (req, res) => {
    const rp = storage.getRosterPlayer(Number(req.params.id));
    if (!rp) return res.status(404).json({ error: "Player not found" });
    const { pin, ...safe } = rp;
    res.json({ ...safe, hasPin: !!pin });
  });

  // Claim profile: link a game-player to a roster entry and set PIN
  app.post("/api/roster/:id/claim", (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const { pin, playerId } = req.body;
      if (!pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be exactly 4 digits" });
      }
      // If already has a PIN, reject — use verify-pin first
      if (rp.pin) {
        return res.status(409).json({ error: "Profile already claimed. Use PIN to verify." });
      }
      // Set the PIN
      storage.updateRosterPlayer(rosterId, { pin });
      // Link the game-player if provided
      if (playerId) {
        storage.updatePlayer(Number(playerId), { rosterId });
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Verify PIN and optionally link a game-player
  app.post("/api/roster/:id/verify-pin", (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const { pin, playerId } = req.body;
      if (!rp.pin) return res.status(400).json({ error: "No PIN set for this player" });
      const valid = rp.pin === pin;
      if (valid && playerId) {
        storage.updatePlayer(Number(playerId), { rosterId });
      }
      res.json({ valid });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Toggle stats public/private (requires PIN)
  app.post("/api/roster/:id/toggle-public", (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      const { pin } = req.body;
      if (!rp.pin || rp.pin !== pin) return res.status(403).json({ error: "Invalid PIN" });
      const newValue = rp.statsPublic ? 0 : 1;
      storage.updateRosterPlayer(rosterId, { statsPublic: newValue });
      res.json({ statsPublic: newValue });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Get player stats across all games (requires PIN or public)
  app.get("/api/roster/:id/stats", (req, res) => {
    try {
      const rosterId = Number(req.params.id);
      const rp = storage.getRosterPlayer(rosterId);
      if (!rp) return res.status(404).json({ error: "Roster player not found" });
      // Privacy check — PIN in query param or stats must be public
      const pin = req.query.pin as string | undefined;
      if (!rp.statsPublic && (!pin || pin !== rp.pin)) {
        return res.status(403).json({ error: "Stats are private. PIN required.", hasPin: !!rp.pin });
      }
      // Gather all game-player records linked to this roster ID
      const linkedPlayers = storage.getPlayersByRosterId(rosterId);
      const gameHistory = linkedPlayers.map(p => {
        const game = storage.getGame(p.gameId);
        if (!game) return null;
        const course = getCourse(game.courseId);
        const allPlayers = storage.getPlayersByGame(game.id);
        const allScores = storage.getScoresByGame(game.id);
        const playerScores = allScores.filter(s => s.playerId === p.id);
        // Compute this player's settlement
        const entries = computeLeaderboard(allPlayers, allScores, course);
        const settlement = computeSettlement(entries, allScores, allPlayers, game, course);
        const mySettlement = settlement.find(s => s.playerId === p.id);
        const myEntry = entries.find(e => e.player.id === p.id);
        // Score stats
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
          gameId: game.id,
          gameName: game.name,
          gameDate: game.date,
          courseId: game.courseId,
          courseName: course.name,
          gameStatus: game.status,
          handicap: p.handicap,
          holesPlayed,
          grossTotal,
          netTotal: myEntry?.netTotal ?? 0,
          birdies,
          eagles,
          moneyWon: mySettlement?.grandTotal ?? 0,
          matchPlay: mySettlement?.matchPlay ?? 0,
          birdieWinnings: mySettlement?.birdies ?? 0,
          eagleWinnings: mySettlement?.eagles ?? 0,
          specialBets: mySettlement?.specialBets ?? 0,
          totalPlayers: allPlayers.length,
          position: myEntry ? entries.indexOf(myEntry) + 1 : 0,
        };
      }).filter(Boolean);
      // Aggregate stats
      const finished = gameHistory.filter(g => g!.gameStatus === "finished");
      const totalMoney = finished.reduce((sum, g) => sum + g!.moneyWon, 0);
      const avgGross = finished.length > 0
        ? finished.filter(g => g!.holesPlayed === 18).reduce((sum, g) => sum + g!.grossTotal, 0) / (finished.filter(g => g!.holesPlayed === 18).length || 1)
        : 0;
      const avgNet = finished.length > 0
        ? finished.filter(g => g!.holesPlayed === 18).reduce((sum, g) => sum + g!.netTotal, 0) / (finished.filter(g => g!.holesPlayed === 18).length || 1)
        : 0;
      const totalBirdies = gameHistory.reduce((sum, g) => sum + g!.birdies, 0);
      const totalEagles = gameHistory.reduce((sum, g) => sum + g!.eagles, 0);
      const wins = finished.filter(g => g!.position === 1).length;
      res.json({
        rosterId,
        name: rp.name,
        handicap: rp.handicap,
        statsPublic: !!rp.statsPublic,
        gamesPlayed: gameHistory.length,
        gamesFinished: finished.length,
        totalMoney,
        avgGross: Math.round(avgGross * 10) / 10,
        avgNet: Math.round(avgNet * 10) / 10,
        totalBirdies,
        totalEagles,
        wins,
        gameHistory,
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // === DATA MANAGEMENT ===

  // Export full database as JSON (for manual backup)
  app.get("/api/export", (_req, res) => {
    try {
      const data = exportAllData();
      res.setHeader("Content-Disposition", `attachment; filename=golf-live-backup-${new Date().toISOString().split("T")[0]}.json`);
      res.json(data);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Import full database from JSON (for restore)
  app.post("/api/import", (req, res) => {
    try {
      const data = req.body;
      if (!data || !data.games) return res.status(400).json({ error: "Invalid backup format" });
      const counts = importAllData(data);
      res.json({ ok: true, restored: counts });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  return httpServer;
}
