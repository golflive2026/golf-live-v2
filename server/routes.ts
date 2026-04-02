import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { COURSE_LIST } from "@shared/schema";

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

  app.post("/api/games/:id/players", (req, res) => {
    try {
      const gameId = Number(req.params.id);
      const game = storage.getGame(gameId);
      if (!game) return res.status(404).json({ error: "Game not found" });
      const existingPlayers = storage.getPlayersByGame(gameId);
      if (existingPlayers.length >= 20) return res.status(400).json({ error: "Maximum 20 players" });
      const { name, handicap } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const player = storage.createPlayer({ gameId, name, handicap: handicap ?? 0 });
      // Auto-save to roster
      try { storage.upsertRoster(name, handicap ?? 0); } catch (e) {}
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

  return httpServer;
}
