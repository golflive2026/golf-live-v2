import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { RosterPlayer } from "@shared/schema";
import { ArrowLeft, Plus, Trash2, Pencil, Check, X, Users, BarChart3 } from "lucide-react";

export default function Roster() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newHcp, setNewHcp] = useState("18");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editHcp, setEditHcp] = useState("");

  const { data: players } = useQuery<RosterPlayer[]>({
    queryKey: ["/api/roster"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/roster");
      return res.json();
    },
  });

  const sorted = [...(players || [])].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const addPlayer = async () => {
    const name = newName.trim();
    if (!name) return;
    if (sorted.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Player already exists", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/roster", {
        name,
        handicap: parseInt(newHcp) || 18,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/roster"] });
      setNewName("");
      setNewHcp("18");
      toast({ title: `${name} added to roster` });
    } catch {
      toast({ title: "Failed to add player", variant: "destructive" });
    }
  };

  const startEdit = (p: RosterPlayer) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditHcp(String(p.handicap));
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await apiRequest("PATCH", `/api/roster/${editingId}`, {
        name: editName.trim(),
        handicap: parseInt(editHcp) || 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/roster"] });
      setEditingId(null);
      toast({ title: "Player updated" });
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  const deletePlayer = async (id: number, name: string) => {
    try {
      await apiRequest("DELETE", `/api/roster/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/roster"] });
      toast({ title: `${name} removed from roster` });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">Manage Roster</h1>
        </div>

        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Add Player</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Player name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="h-12 flex-1"
                onKeyDown={e => e.key === "Enter" && addPlayer()}
              />
              <Input
                type="number"
                placeholder="HCP"
                value={newHcp}
                onChange={e => setNewHcp(e.target.value)}
                className="h-12 w-20 text-center"
                min={0}
                max={54}
              />
              <Button
                size="icon"
                className="h-12 w-12 golf-gradient text-white border-0 shrink-0"
                onClick={addPlayer}
                disabled={!newName.trim()}
              >
                <Plus className="w-5 h-5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Roster ({sorted.length} players)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sorted.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No players yet. Add your first player above.
              </p>
            )}
            {sorted.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
              >
                {editingId === p.id ? (
                  <>
                    <div className="flex gap-2 flex-1 mr-2">
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="h-9 flex-1"
                        onKeyDown={e => e.key === "Enter" && saveEdit()}
                        autoFocus
                      />
                      <Input
                        type="number"
                        value={editHcp}
                        onChange={e => setEditHcp(e.target.value)}
                        className="h-9 w-16 text-center"
                        min={0}
                        max={54}
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={saveEdit}
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelEdit}
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 mr-2">
                      <span className="font-medium text-sm truncate block">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        HCP {p.handicap}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/stats/${p.id}`)}
                        title="View stats"
                      >
                        <BarChart3 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
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
                              This will remove {p.name} from the roster. They won't appear in quick-add when setting up games.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deletePlayer(p.id, p.name)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
