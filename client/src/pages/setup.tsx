import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_BETS, DEFAULT_DOTS, type RosterPlayer } from "@shared/schema";
import { ArrowLeft, Plus, Trash2, Play, DollarSign, Users, MapPin, UserPlus, Pencil } from "lucide-react";

interface PlayerInput {
  name: string;
  handicap: number;
}

interface CourseOption {
  id: string;
  name: string;
  location: string;
  totalPar: number;
}

export default function Setup() {
  const [, params] = useRoute("/setup/:mode?");
  const isAdvanced = params?.mode === "advanced";
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<"info" | "players" | "bets">(isAdvanced ? "info" : "players");
  const [gameName, setGameName] = useState(isAdvanced ? "" : "St. Sofia Round");
  const [gameDate, setGameDate] = useState(new Date().toISOString().split("T")[0]);
  const [courseId, setCourseId] = useState("st-sofia");
  const [players, setPlayers] = useState<PlayerInput[]>([]);
  const [newName, setNewName] = useState("");
  const [newHcp, setNewHcp] = useState("18");
  const [bets, setBets] = useState({ ...DEFAULT_BETS });
  const [gameMode, setGameMode] = useState<"stroke" | "stableford" | "action">("stroke");
  const [dots, setDots] = useState<Record<string, number>>({ ...DEFAULT_DOTS });
  const [ldCtpMode, setLdCtpMode] = useState("simple");
  const [carryoverEnabled, setCarryoverEnabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingHcpIdx, setEditingHcpIdx] = useState<number | null>(null);
  const [editHcpValue, setEditHcpValue] = useState("");

  const { data: courses } = useQuery<CourseOption[]>({
    queryKey: ["/api/courses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/courses");
      return res.json();
    },
    enabled: isAdvanced,
  });

  const { data: rosterPlayers } = useQuery<RosterPlayer[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/roster");
      return res.json();
    },
  });

  const addPlayer = () => {
    if (!newName.trim()) return;
    if (players.length >= 50) {
      toast({ title: "Max 50 players", variant: "destructive" });
      return;
    }
    if (players.some(p => p.name.toLowerCase() === newName.trim().toLowerCase())) {
      toast({ title: "Player already added", variant: "destructive" });
      return;
    }
    setPlayers([...players, { name: newName.trim(), handicap: parseInt(newHcp) || 0 }]);
    setNewName("");
    setNewHcp("18");
  };

  const removePlayer = (idx: number) => {
    setPlayers(players.filter((_, i) => i !== idx));
    if (editingHcpIdx === idx) setEditingHcpIdx(null);
  };

  const updatePlayerHandicap = (idx: number, value: string) => {
    const hcp = Math.max(0, Math.min(54, parseInt(value) || 0));
    setPlayers(players.map((p, i) => i === idx ? { ...p, handicap: hcp } : p));
    setEditingHcpIdx(null);
  };

  const toggleRosterPlayer = (rp: RosterPlayer) => {
    const exists = players.some(p => p.name.toLowerCase() === rp.name.toLowerCase());
    if (exists) {
      setPlayers(players.filter(p => p.name.toLowerCase() !== rp.name.toLowerCase()));
    } else {
      if (players.length >= 50) {
        toast({ title: "Max 50 players", variant: "destructive" });
        return;
      }
      setPlayers([...players, { name: rp.name, handicap: rp.handicap }]);
    }
  };

  const startGame = async () => {
    if (players.length < 2) {
      toast({ title: "Need at least 2 players", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const gameRes = await apiRequest("POST", "/api/games", {
        name: gameName || "Golf Game",
        date: gameDate,
        courseId,
        gameMode,
        first9Bet: bets.first9Bet,
        second9Bet: bets.second9Bet,
        wholeGameBet: bets.wholeGameBet,
        birdiePot: bets.birdiePot,
        eaglePot: bets.eaglePot,
        longestDriveBet: bets.longestDriveBet,
        closestPinBet: bets.closestPinBet,
        ...(gameMode === "action" ? {
          ...dots,
          ldCtpMode,
          carryoverEnabled: carryoverEnabled ? 1 : 0,
        } : {}),
      });
      const game = await gameRes.json();

      let addedCount = 0;
      for (const p of players) {
        await apiRequest("POST", `/api/games/${game.id}/players`, {
          name: p.name,
          handicap: p.handicap,
        });
        addedCount++;
      }

      if (addedCount !== players.length) {
        throw new Error("Not all players were added. Please try again.");
      }

      await apiRequest("POST", `/api/games/${game.id}/start`);

      toast({ title: "Game created!", description: `Code: ${game.code}` });
      navigate(`/game/${game.id}`);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const selectedCourse = courses?.find(c => c.id === courseId);

  const betFields = [
    { key: "first9Bet", label: "Front 9" },
    { key: "second9Bet", label: "Back 9" },
    { key: "wholeGameBet", label: "Full Round" },
    { key: "birdiePot", label: "Birdie Pot" },
    { key: "eaglePot", label: "Eagle Pot" },
    { key: "longestDriveBet", label: "Longest Drive" },
    { key: "closestPinBet", label: "Closest to Pin" },
  ] as const;

  const availableRoster = rosterPlayers?.filter(
    rp => !players.some(p => p.name.toLowerCase() === rp.name.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-background px-4 py-6 pb-24">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">{isAdvanced ? "Advanced Game" : "Quick Game"}</h1>
        </div>

        <div className="flex gap-2 mb-6">
          {(isAdvanced ? ["info", "players", "bets"] : ["players", "bets"]).map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                (s === "info" && step === "info") ||
                (s === "players" && (step === "players" || step === "bets")) ||
                (s === "bets" && step === "bets")
                  ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === "info" && isAdvanced && (
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
              <div>
                <Label className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  Course
                </Label>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger className="h-12 mt-1" data-testid="select-course">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses?.map(c => (
                      <SelectItem key={c.id} value={c.id} data-testid={`option-course-${c.id}`}>
                        {c.name} (Par {c.totalPar})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCourse && (
                  <p className="text-xs text-muted-foreground mt-1">{selectedCourse.location} · Par {selectedCourse.totalPar}</p>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Game Mode</Label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {([
                    { mode: "stroke" as const, icon: "🏌️", label: "Stroke", desc: "Classic net scoring" },
                    { mode: "stableford" as const, icon: "⭐", label: "Stableford", desc: "Points per hole · Highest wins" },
                    { mode: "action" as const, icon: "🎯", label: "Action", desc: "Dots & side bets" },
                  ]).map(m => (
                    <button key={m.mode} onClick={() => setGameMode(m.mode)}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${gameMode === m.mode ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                      <div className="text-2xl mb-1">{m.icon}</div>
                      <div className="text-xs font-bold">{m.label}</div>
                      <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                    </button>
                  ))}
                </div>
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

        {step === "players" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Players ({players.length}/50)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAdvanced && (
                <div>
                  <Label className="mb-2 block text-sm font-medium">Game Mode</Label>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {([
                      { mode: "stroke" as const, icon: "🏌️", label: "Stroke", desc: "Classic net scoring" },
                      { mode: "stableford" as const, icon: "⭐", label: "Stableford", desc: "Points per hole · Highest wins" },
                      { mode: "action" as const, icon: "🎯", label: "Action", desc: "Dots & side bets" },
                    ]).map(m => (
                      <button key={m.mode} onClick={() => setGameMode(m.mode)}
                        className={`p-3 rounded-lg border-2 text-center transition-all ${gameMode === m.mode ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                        <div className="text-2xl mb-1">{m.icon}</div>
                        <div className="text-xs font-bold">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {players.length > 0 && (
                <div className="space-y-2">
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2" data-testid={`row-player-${i}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{p.name}</span>
                        {editingHcpIdx === i ? (
                          <Input
                            type="number"
                            value={editHcpValue}
                            onChange={e => setEditHcpValue(e.target.value)}
                            onBlur={() => updatePlayerHandicap(i, editHcpValue)}
                            onKeyDown={e => {
                              if (e.key === "Enter") updatePlayerHandicap(i, editHcpValue);
                              if (e.key === "Escape") setEditingHcpIdx(null);
                            }}
                            className="h-8 w-16 text-sm text-center"
                            min={0} max={54} autoFocus
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingHcpIdx(i); setEditHcpValue(String(p.handicap)); }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-1.5 rounded-md hover:bg-muted"
                          >
                            HCP {p.handicap} <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePlayer(i)} data-testid={`button-remove-player-${i}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

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

              {rosterPlayers && rosterPlayers.length > 0 && (
                <div className="border-t border-border pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserPlus className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Quick Add from Roster</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rosterPlayers.map(rp => {
                      const selected = players.some(p => p.name.toLowerCase() === rp.name.toLowerCase());
                      return (
                        <button
                          key={rp.id}
                          onClick={() => toggleRosterPlayer(rp)}
                          data-testid={`button-roster-${rp.id}`}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {rp.name} ({rp.handicap})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 h-12" onClick={() => isAdvanced ? setStep("info") : navigate("/")} data-testid="button-back-info">
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

        {step === "bets" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {gameMode === "action" ? "Dot Values (per player)" : "Bet Amounts (per player)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {gameMode === "action" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-bold">Point Value (€ per dot)</Label>
                    <Input type="number" value={dots.dotValue} onChange={e => setDots({...dots, dotValue: parseFloat(e.target.value) || 1})} className="h-10 w-24 text-center" min={0.5} step={0.5} />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">LD/CTP Mode</Label>
                    <Select value={ldCtpMode} onValueChange={setLdCtpMode}>
                      <SelectTrigger className="h-10 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Quick (winner only)</SelectItem>
                        <SelectItem value="distance">Detailed (distances)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Carryover (ties roll forward)</Label>
                    <button
                      onClick={() => setCarryoverEnabled(!carryoverEnabled)}
                      className={`w-11 h-6 rounded-full transition-colors relative ${carryoverEnabled ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`block w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${carryoverEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>

                  <details open>
                    <summary className="text-xs text-muted-foreground font-medium cursor-pointer">Score Bonuses (tap to collapse)</summary>
                    <div className="space-y-3 mt-2">
                      {[
                        { key: "dotBirdie", label: "Birdie (net)" },
                        { key: "dotEagle", label: "Eagle (net)" },
                        { key: "dotAlbatross", label: "Albatross (net)" },
                        { key: "dotBounceBack", label: "Bounce Back" },
                        { key: "dotHoleInOne", label: "Hole in One" },
                      ].map(f => (
                        <div key={f.key} className="flex items-center justify-between">
                          <Label className="text-sm">{f.label}</Label>
                          <Input type="number" value={(dots as any)[f.key]} onChange={e => setDots({...dots, [f.key]: parseInt(e.target.value) || 0})} className="h-10 w-20 text-center" />
                        </div>
                      ))}
                    </div>
                  </details>

                  <details>
                    <summary className="text-xs text-muted-foreground font-medium cursor-pointer">Recovery & Skill (tap to expand)</summary>
                    <div className="space-y-3 mt-2">
                      {[
                        { key: "dotSandy", label: "Sandy (par from bunker)" },
                        { key: "dotChipIn", label: "Chip-in" },
                        { key: "dotGoldenFerret", label: "Golden Ferret (chip-in from bunker)" },
                        { key: "dotBarkie", label: "Barkie (par after hitting tree)" },
                        { key: "dotSharkie", label: "Sharkie (par from water)" },
                        { key: "dotArnie", label: "Arnie (par without fairway)" },
                        { key: "dotHogan", label: "Hogan (GIR + par or better)" },
                        { key: "dotPolie", label: "Polie (par with 1 putt)" },
                        { key: "dotGreenie", label: "Greenie (CTP + par)" },
                        { key: "dotLongestDrive", label: "Longest Drive" },
                        { key: "dotClosestPin", label: "Closest to Pin" },
                        { key: "dotTigerLd", label: "Tiger LD (LD + birdie)" },
                      ].map(f => (
                        <div key={f.key} className="flex items-center justify-between">
                          <Label className="text-sm">{f.label}</Label>
                          <Input type="number" value={(dots as any)[f.key]} onChange={e => setDots({...dots, [f.key]: parseInt(e.target.value) || 0})} className="h-10 w-20 text-center" />
                        </div>
                      ))}
                    </div>
                  </details>

                  <details>
                    <summary className="text-xs text-muted-foreground font-medium cursor-pointer">Penalties (tap to expand)</summary>
                    <div className="space-y-3 mt-2">
                      {[
                        { key: "dotDoubleBogey", label: "Double Bogey+ (net)" },
                        { key: "dotThreePutt", label: "3-Putt" },
                        { key: "dotFourPutt", label: "4-Putt" },
                        { key: "dotWater", label: "Water Penalty" },
                        { key: "dotOb", label: "Out of Bounds" },
                        { key: "dotMole", label: "Mole (3-putt from < 3ft)" },
                        { key: "dotFoozle", label: "Foozle (whiff/duff)" },
                        { key: "dotSnowman", label: "Snowman (8+)" },
                      ].map(f => (
                        <div key={f.key} className="flex items-center justify-between">
                          <Label className="text-sm">{f.label}</Label>
                          <Input type="number" value={(dots as any)[f.key]} onChange={e => setDots({...dots, [f.key]: parseInt(e.target.value) || 0})} className="h-10 w-20 text-center" />
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ) : (
                betFields.map(f => (
                  <div key={f.key} className="flex items-center justify-between">
                    <Label className="text-sm">{f.label}</Label>
                    <Input
                      data-testid={`input-bet-${f.key}`}
                      type="number"
                      value={bets[f.key]}
                      onChange={e => setBets({ ...bets, [f.key]: parseFloat(e.target.value) || 0 })}
                      className="h-10 w-24 text-center"
                      min={0}
                      step={1}
                    />
                  </div>
                ))
              )}

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
