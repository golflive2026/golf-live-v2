import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Create game
  app.post("/api/games", (req, res) => {
    try {
      const { name, date, first9Bet, second9Bet, wholeGameBet, birdiePot, eaglePot, longestDriveBet, closestPinBet } = req.body;
      if (!name || !date) {
        return res.status(400).json({ error: "Name and date are required" });
      }
      let code = generateCode();
      // Ensure unique
      while (storage.getGameByCode(code)) {
        code = generateCode();
      }
      const game = storage.createGame({
        name,
        date,
        code,
        status: "setup",
        first9Bet: first9Bet ?? 5,
        second9Bet: second9Bet ?? 5,
        wholeGameBet: wholeGameBet ?? 15,
        birdiePot: birdiePot ?? 3,
        eaglePot: eaglePot ?? 30,
        longestDriveBet: longestDriveBet ?? 3,
        closestPinBet: closestPinBet ?? 3,
      });
      res.json(game);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get game by ID
  app.get("/api/games/:id", (req, res) => {
    const game = storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  // Join game by code
  app.get("/api/games/code/:code", (req, res) => {
    const game = storage.getGameByCode(req.params.code.toUpperCase());
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  // Update game (bets, status)
  app.patch("/api/games/:id", (req, res) => {
    const game = storage.updateGame(Number(req.params.id), req.body);
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  // Start game
  app.post("/api/games/:id/start", (req, res) => {
    const game = storage.updateGame(Number(req.params.id), { status: "active" });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  // Finish game
  app.post("/api/games/:id/finish", (req, res) => {
    const game = storage.updateGame(Number(req.params.id), { status: "finished" });
    if (!game) return res.status(404).json({ error: "Game not found" });
    res.json(game);
  });

  // Add player
  app.post("/api/games/:id/players", (req, res) => {
    try {
      const gameId = Number(req.params.id);
      const game = storage.getGame(gameId);
      if (!game) return res.status(404).json({ error: "Game not found" });

      const existingPlayers = storage.getPlayersByGame(gameId);
      if (existingPlayers.length >= 20) {
        return res.status(400).json({ error: "Maximum 20 players" });
      }

      const { name, handicap } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });

      const player = storage.createPlayer({
        gameId,
        name,
        handicap: handicap ?? 0,
      });
      res.json(player);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get players for a game
  app.get("/api/games/:id/players", (req, res) => {
    const gamePlayers = storage.getPlayersByGame(Number(req.params.id));
    res.json(gamePlayers);
  });

  // Delete player
  app.delete("/api/players/:id", (req, res) => {
    storage.deletePlayer(Number(req.params.id));
    res.json({ ok: true });
  });

  // Update score (upsert)
  app.post("/api/scores", (req, res) => {
    try {
      const { gameId, playerId, hole, grossScore, longestDrive, closestPin } = req.body;
      if (!gameId || !playerId || !hole) {
        return res.status(400).json({ error: "gameId, playerId, and hole are required" });
      }
      const score = storage.upsertScore(gameId, playerId, hole, {
        grossScore: grossScore !== undefined ? grossScore : undefined,
        longestDrive: longestDrive !== undefined ? longestDrive : undefined,
        closestPin: closestPin !== undefined ? closestPin : undefined,
      });
      res.json(score);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get all scores for a game
  app.get("/api/games/:id/scores", (req, res) => {
    const gameScores = storage.getScoresByGame(Number(req.params.id));
    res.json(gameScores);
  });

  // Get full game data (game + players + scores) for live polling
  app.get("/api/games/:id/full", (req, res) => {
    const game = storage.getGame(Number(req.params.id));
    if (!game) return res.status(404).json({ error: "Game not found" });
    const gamePlayers = storage.getPlayersByGame(game.id);
    const gameScores = storage.getScoresByGame(game.id);
    res.json({ game, players: gamePlayers, scores: gameScores });
  });

  return httpServer;
}
