import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_BETS } from "@shared/schema";
import { ArrowLeft, Plus, Trash2, Play, DollarSign, Users } from "lucide-react";

interface PlayerInput {
  name: string;
  handicap: number;
}

export default function Setup() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"info" | "players" | "bets">("info");
  const [gameName, setGameName] = useState("");
  const [gameDate, setGameDate] = useState(new Date().toISOString().split("T")[0]);
  const [players, setPlayers] = useState<PlayerInput[]>([]);
  const [newName, setNewName] = useState("");
  const [newHcp, setNewHcp] = useState("18");
  const [bets, setBets] = useState({ ...DEFAULT_BETS });
  const [creating, setCreating] = useState(false);

  const addPlayer = () => {
    if (!newName.trim()) return;
    if (players.length >= 20) {
      toast({ title: "Max 20 players", variant: "destructive" });
      return;
    }
    setPlayers([...players, { name: newName.trim(), handicap: parseInt(newHcp) || 0 }]);
    setNewName("");
    setNewHcp("18");
  };

  const removePlayer = (idx: number) => {
    setPlayers(players.filter((_, i) => i !== idx));
  };

  const startGame = async () => {
    if (players.length < 2) {
      toast({ title: "Need at least 2 players", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      // Create game
      const gameRes = await apiRequest("POST", "/api/games", {
        name: gameName || "Golf Game",
        date: gameDate,
        first9Bet: bets.first9Bet,
        second9Bet: bets.second9Bet,
        wholeGameBet: bets.wholeGameBet,
        birdiePot: bets.birdiePot,
        eaglePot: bets.eaglePot,
        longestDriveBet: bets.longestDriveBet,
        closestPinBet: bets.closestPinBet,
      });
      const game = await gameRes.json();

      // Add all players
      let addedCount = 0;
      for (const p of players) {
        await apiRequest("POST", `/api/games/${game.id}/players`, {
          name: p.name,
          handicap: p.handicap,
        });
        addedCount++;
      }

      // Only start the game if all players were added
      if (addedCount !== players.length) {
        throw new Error("Not all players were added. Please try again.");
      }

      // Start the game
      await apiRequest("POST", `/api/games/${game.id}/start`);

      toast({ title: "Game created!", description: `Code: ${game.code}` });
      navigate(`/game/${game.id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const betFields = [
    { key: "first9Bet", label: "Front 9", unit: "€" },
    { key: "second9Bet", label: "Back 9", unit: "€" },
    { key: "wholeGameBet", label: "Full Round", unit: "€" },
    { key: "birdiePot", label: "Birdie Pot", unit: "€" },
    { key: "eaglePot", label: "Eagle Pot", unit: "€" },
    { key: "longestDriveBet", label: "Longest Drive", unit: "€" },
    { key: "closestPinBet", label: "Closest to Pin", unit: "€" },
  ] as const;

  return (
    <div className="min-h-screen bg-background px-4 py-6 pb-24">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">New Game</h1>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          {["info", "players", "bets"].map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                (s === "info" && step === "info") || (s === "players" && (step === "players" || step === "bets")) || (s === "bets" && step === "bets")
                  ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Game Info */}
        {step === "info" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Game Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Game Name</Label>
                <Input
                  data-testid="input-game-name"
                  placeholder="Saturday Round"
                  value={gameName}
                  onChange={e => setGameName(e.target.value)}
                  className="h-12 mt-1"
                />
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  data-testid="input-game-date"
                  type="date"
                  value={gameDate}
                  onChange={e => setGameDate(e.target.value)}
                  className="h-12 mt-1"
                />
              </div>
              <Button
                data-testid="button-next-players"
                className="w-full h-12 font-semibold golf-gradient text-white border-0"
                onClick={() => setStep("players")}
              >
                Next: Add Players
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Players */}
        {step === "players" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Players ({players.length}/20)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Player list */}
              {players.length > 0 && (
                <div className="space-y-2">
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2" data-testid={`row-player-${i}`}>
                      <div>
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">HCP {p.handicap}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePlayer(i)} data-testid={`button-remove-player-${i}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add player form */}
              <div className="flex gap-2">
                <Input
                  data-testid="input-player-name"
                  placeholder="Player name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="h-12 flex-1"
                  onKeyDown={e => e.key === "Enter" && addPlayer()}
                />
                <Input
                  data-testid="input-player-hcp"
                  type="number"
                  placeholder="HCP"
                  value={newHcp}
                  onChange={e => setNewHcp(e.target.value)}
                  className="h-12 w-20 text-center"
                  min={0}
                  max={54}
                />
                <Button
                  data-testid="button-add-player"
                  size="icon"
                  className="h-12 w-12 golf-gradient text-white border-0 shrink-0"
                  onClick={addPlayer}
                  disabled={!newName.trim()}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 h-12" onClick={() => setStep("info")} data-testid="button-back-info">
                  Back
                </Button>
                <Button
                  data-testid="button-next-bets"
                  className="flex-1 h-12 font-semibold golf-gradient text-white border-0"
                  onClick={() => setStep("bets")}
                  disabled={players.length < 2}
                >
                  Next: Set Bets
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Bets */}
        {step === "bets" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Bet Amounts (per player)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {betFields.map(f => (
                <div key={f.key} className="flex items-center justify-between">
                  <Label className="text-sm">{f.label}</Label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">{f.unit}</span>
                    <Input
                      data-testid={`input-bet-${f.key}`}
                      type="number"
                      value={bets[f.key]}
                      onChange={e => setBets({ ...bets, [f.key]: parseFloat(e.target.value) || 0 })}
                      className="h-10 w-20 text-center"
                      min={0}
                      step={1}
                    />
                  </div>
                </div>
              ))}

              <div className="pt-4 flex gap-2">
                <Button variant="secondary" className="flex-1 h-12" onClick={() => setStep("players")} data-testid="button-back-players">
                  Back
                </Button>
                <Button
                  data-testid="button-start-game"
                  className="flex-1 h-14 text-base font-bold golf-gradient text-white border-0"
                  onClick={startGame}
                  disabled={creating}
                >
                  <Play className="w-5 h-5 mr-2" />
                  {creating ? "Creating..." : "Start Game"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
