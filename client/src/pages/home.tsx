import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, LogIn, Flag } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const { toast } = useToast();

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const res = await apiRequest("GET", `/api/games/code/${joinCode.trim().toUpperCase()}`);
      const game = await res.json();
      navigate(`/game/${game.id}`);
    } catch {
      toast({ title: "Game not found", description: "Check the code and try again.", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-8">
      {/* Logo / Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full golf-gradient mb-4">
          <Flag className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-xl font-bold text-foreground tracking-tight" data-testid="text-app-title">
          Golf Live
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          St. Sofia Golf Club · Ravno Pole
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        {/* Create Game */}
        <Card className="border-border">
          <CardContent className="p-5">
            <Button
              data-testid="button-create-game"
              className="w-full h-14 text-base font-semibold golf-gradient text-white border-0 hover:opacity-90"
              onClick={() => navigate("/setup")}
            >
              <Plus className="w-5 h-5 mr-2" />
              Create New Game
            </Button>
          </CardContent>
        </Card>

        {/* Join Game */}
        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">Join Existing Game</p>
            <Input
              data-testid="input-join-code"
              placeholder="Enter 6-digit code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              className="h-14 text-center text-lg font-mono tracking-widest uppercase"
              maxLength={6}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
            />
            <Button
              data-testid="button-join-game"
              variant="secondary"
              className="w-full h-12 font-semibold"
              onClick={handleJoin}
              disabled={joining || joinCode.trim().length < 4}
            >
              <LogIn className="w-4 h-4 mr-2" />
              {joining ? "Joining..." : "Join Game"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground mt-8">
        Real-time scoring · Live leaderboard · Automatic bets
      </p>
    </div>
  );
}
