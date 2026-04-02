import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Player, RosterPlayer } from "@shared/schema";
import { UserPlus, Plus, Trash2 } from "lucide-react";

interface ManagePlayersProps {
  gameId: number;
  players: Player[];
}

export default function ManagePlayers({ gameId, players }: ManagePlayersProps) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newHcp, setNewHcp] = useState("18");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const { data: rosterPlayers } = useQuery<RosterPlayer[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/roster");
      return res.json();
    },
    enabled: open,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/games", gameId, "full"] });

  const addPlayer = async (name: string, handicap: number) => {
    if (adding) return;
    if (players.length >= 50) {
      toast({ title: "Max 50 players", variant: "destructive" });
      return;
    }
    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Player already in game", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      await apiRequest("POST", `/api/games/${gameId}/players`, { name, handicap });
      await invalidate();
      toast({ title: `${name} added` });
    } catch {
      toast({ title: "Failed to add player", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const addFromForm = async () => {
    const name = newName.trim();
    if (!name) return;
    await addPlayer(name, parseInt(newHcp) || 0);
    setNewName("");
    setNewHcp("18");
  };

  const removePlayer = async (playerId: number, name: string) => {
    try {
      await apiRequest("DELETE", `/api/players/${playerId}`);
      await invalidate();
      toast({ title: `${name} removed` });
    } catch {
      toast({ title: "Failed to remove player", variant: "destructive" });
    }
  };

  const availableRoster = (rosterPlayers || []).filter(
    rp => !players.some(p => p.name.toLowerCase() === rp.name.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Manage players">
          <UserPlus className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Manage Players ({players.length}/50)</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Add player */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Add Player</p>
            <div className="flex gap-2">
              <Input
                placeholder="Player name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="h-11 flex-1"
                onKeyDown={e => e.key === "Enter" && addFromForm()}
              />
              <Input
                type="number"
                placeholder="HCP"
                value={newHcp}
                onChange={e => setNewHcp(e.target.value)}
                className="h-11 w-20 text-center"
                min={0}
                max={54}
              />
              <Button
                size="icon"
                className="h-11 w-11 golf-gradient text-white border-0 shrink-0"
                onClick={addFromForm}
                disabled={!newName.trim() || adding}
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>

            {availableRoster.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Quick add from roster</p>
                <div className="flex flex-wrap gap-2">
                  {availableRoster.map(rp => (
                    <button
                      key={rp.id}
                      onClick={() => addPlayer(rp.name, rp.handicap)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-all"
                    >
                      {rp.name} ({rp.handicap})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Current players */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Current Players ({players.length})</p>
            {players.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">No players in this game yet.</p>
            )}
            {players.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
              >
                <div>
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">HCP {p.handicap}</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove {p.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        All their scores will be permanently deleted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => removePlayer(p.id, p.name)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
