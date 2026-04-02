import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Trophy,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  MapPin,
  Calendar,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Tab = "overview" | "courses" | "history";

interface GameStat {
  gameId: number;
  gameName: string;
  gameDate: string;
  courseId: string;
  courseName: string;
  gameStatus: string;
  handicap: number;
  holesPlayed: number;
  grossTotal: number;
  netTotal: number;
  birdies: number;
  eagles: number;
  moneyWon: number;
  matchPlay: number;
  birdieWinnings: number;
  eagleWinnings: number;
  specialBets: number;
  totalPlayers: number;
  position: number;
}

interface StatsData {
  rosterId: number;
  name: string;
  handicap: number;
  statsPublic: boolean;
  gamesPlayed: number;
  gamesFinished: number;
  totalMoney: number;
  avgGross: number;
  avgNet: number;
  totalBirdies: number;
  totalEagles: number;
  wins: number;
  gameHistory: GameStat[];
}

export default function StatsPage() {
  const [matched, params] = useRoute("/stats/:rosterId");
  const [, navigate] = useLocation();
  const rosterId = matched ? Number(params!.rosterId) : 0;
  const [tab, setTab] = useState<Tab>("overview");
  const [pin, setPin] = useState("");
  const [enteredPin, setEnteredPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState("");
  const [toggling, setToggling] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [settingPin, setSettingPin] = useState(false);
  const { toast } = useToast();

  const togglePublic = async () => {
    if (!enteredPin) return;
    setToggling(true);
    try {
      const res = await apiRequest("POST", `/api/roster/${rosterId}/toggle-public`, { pin: enteredPin });
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/roster", rosterId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/roster", rosterId, "stats", enteredPin] });
      toast({ title: result.statsPublic ? "Stats are now public" : "Stats are now private" });
    } catch {
      toast({ title: "Failed to toggle", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const handleSetPin = async () => {
    if (newPin.length !== 4) return;
    setSettingPin(true);
    try {
      await apiRequest("POST", `/api/roster/${rosterId}/set-pin`, { pin: newPin });
      await queryClient.invalidateQueries({ queryKey: ["/api/roster", rosterId] });
      setEnteredPin(newPin);
      setShowSetPin(false);
      setNewPin("");
      toast({ title: "PIN set!", description: "Your stats are now private. Use the toggle to make them public." });
    } catch {
      toast({ title: "Failed to set PIN", variant: "destructive" });
    } finally {
      setSettingPin(false);
    }
  };

  // First fetch public info to check if PIN is needed
  const { data: rosterInfo } = useQuery<{ id: number; name: string; handicap: number; statsPublic: number; hasPin: boolean }>({
    queryKey: ["/api/roster", rosterId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/roster/${rosterId}`);
      return res.json();
    },
    enabled: rosterId > 0,
  });

  // Fetch stats (with PIN if needed)
  // Stats are open when: no PIN set, OR statsPublic=1, OR user entered correct PIN
  const canFetchStats = rosterInfo && (
    !rosterInfo.hasPin ||         // no PIN set → stats are open
    rosterInfo.statsPublic === 1 || // explicitly public
    enteredPin !== null             // user entered a PIN to try
  );

  const { data: stats, error: statsError, isLoading } = useQuery<StatsData>({
    queryKey: ["/api/roster", rosterId, "stats", enteredPin],
    queryFn: async () => {
      const url = enteredPin
        ? `/api/roster/${rosterId}/stats?pin=${enteredPin}`
        : `/api/roster/${rosterId}/stats`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: rosterId > 0 && !!canFetchStats,
    retry: false,
  });

  if (!matched) return null;

  const needsPin = rosterInfo && rosterInfo.hasPin && !rosterInfo.statsPublic && !stats;

  // React to query errors — reliable replacement for setTimeout
  useEffect(() => {
    if (enteredPin && statsError) {
      setPinError("Wrong PIN. Try again.");
      setPin("");
      setEnteredPin(null);
    }
  }, [statsError, enteredPin]);

  const handlePinSubmit = () => {
    if (pin.length !== 4) return;
    setPinError("");
    setEnteredPin(pin);
  };

  // PIN gate
  if (needsPin && !stats) {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/roster")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold">{rosterInfo.name}'s Stats</h1>
          </div>
          <Card>
            <CardContent className="p-6 flex flex-col items-center gap-4">
              <Lock className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                These stats are private. Enter PIN to view.
              </p>
              <InputOTP maxLength={4} value={pin} onChange={setPin} pattern="^[0-9]*$">
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              {pinError && (
                <p className="text-xs text-destructive">{pinError}</p>
              )}
              <Button
                className="w-full golf-gradient text-white border-0"
                onClick={handlePinSubmit}
                disabled={pin.length !== 4 || (!!enteredPin && isLoading)}
              >
                {enteredPin && isLoading ? "Checking..." : "Unlock Stats"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // No PIN set and stats are private — this shouldn't happen anymore
  // since stats are open when no PIN is set, but keep as fallback
  if (rosterInfo && !canFetchStats) {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/roster")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-bold">{rosterInfo.name}'s Stats</h1>
          </div>
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <Lock className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">
                Stats are not available.
              </p>
              <Button variant="secondary" onClick={() => navigate("/")}>
                Go Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading || !stats) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading stats...</p>
      </div>
    );
  }

  // Build chart data (chronological money over time)
  const finishedGames = stats.gameHistory
    .filter(g => g.gameStatus === "finished")
    .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

  let cumulative = 0;
  const chartData = finishedGames.map(g => {
    cumulative += g.moneyWon;
    return {
      name: g.gameDate.slice(5), // MM-DD
      money: Math.round(cumulative),
      game: g.gameName,
    };
  });

  // Course aggregation
  const courseMap = new Map<string, { courseName: string; games: number; totalGross: number; bestGross: number; full18Count: number }>();
  for (const g of finishedGames) {
    if (g.holesPlayed !== 18) continue;
    const existing = courseMap.get(g.courseId);
    if (existing) {
      existing.games++;
      existing.totalGross += g.grossTotal;
      existing.full18Count++;
      if (g.grossTotal < existing.bestGross) existing.bestGross = g.grossTotal;
    } else {
      courseMap.set(g.courseId, { courseName: g.courseName, games: 1, totalGross: g.grossTotal, bestGross: g.grossTotal, full18Count: 1 });
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "courses", label: "By Course" },
    { key: "history", label: "History" },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6 pb-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/roster")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold">{stats.name}</h1>
              <p className="text-xs text-muted-foreground">HCP {stats.handicap} · {stats.gamesFinished} games finished</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {/* Show Set PIN if no PIN, or privacy toggle if authenticated */}
            {rosterInfo && !rosterInfo.hasPin && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => { setShowSetPin(true); setNewPin(""); }}
              >
                <Lock className="w-3.5 h-3.5" />
                Set PIN
              </Button>
            )}
            {enteredPin && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={togglePublic}
                disabled={toggling}
              >
                {stats.statsPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {stats.statsPublic ? "Public" : "Private"}
              </Button>
            )}
          </div>
        </div>

        {/* Set PIN dialog */}
        {showSetPin && (
          <Card className="mb-4">
            <CardContent className="p-4 flex flex-col items-center gap-3">
              <p className="text-sm font-medium">Create a 4-digit PIN to protect your stats</p>
              <InputOTP maxLength={4} value={newPin} onChange={setNewPin} pattern="^[0-9]*$">
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
              <div className="flex gap-2 w-full">
                <Button variant="secondary" className="flex-1" onClick={() => setShowSetPin(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 golf-gradient text-white border-0"
                  onClick={handleSetPin}
                  disabled={newPin.length !== 4 || settingPin}
                >
                  {settingPin ? "..." : "Set PIN"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                After setting a PIN, only you can view these stats. You can make them public again anytime.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 mb-4 bg-muted rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <SummaryCard
                label="Net Money"
                value={`${stats.totalMoney >= 0 ? "+" : ""}${stats.totalMoney.toFixed(0)}`}
                color={stats.totalMoney >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}
              />
              <SummaryCard label="Avg Gross" value={stats.avgGross > 0 ? String(stats.avgGross) : "-"} />
              <SummaryCard label="Avg Net" value={stats.avgNet > 0 ? String(stats.avgNet) : "-"} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <SummaryCard label="Wins" value={String(stats.wins)} icon={<Trophy className="w-3.5 h-3.5 text-yellow-500" />} />
              <SummaryCard label="Birdies" value={String(stats.totalBirdies)} icon={<Target className="w-3.5 h-3.5 text-blue-500" />} />
              <SummaryCard label="Eagles" value={String(stats.totalEagles)} icon={<Zap className="w-3.5 h-3.5 text-purple-500" />} />
            </div>

            {/* Money chart */}
            {chartData.length >= 2 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Cumulative Money</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value: number) => [`${value >= 0 ? "+" : ""}${value}`, "Money"]}
                        labelFormatter={(label, payload) => payload?.[0]?.payload?.game || label}
                      />
                      <Line
                        type="monotone"
                        dataKey="money"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
            {chartData.length < 2 && stats.gamesFinished === 0 && (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No finished games yet. Stats will appear after claiming completed games.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {tab === "courses" && (
          <div className="space-y-3">
            {courseMap.size === 0 && (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No full rounds completed yet.</p>
                </CardContent>
              </Card>
            )}
            {Array.from(courseMap.entries()).map(([courseId, c]) => (
              <Card key={courseId}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{c.courseName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Rounds</div>
                      <div className="font-bold text-sm">{c.games}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Avg Gross</div>
                      <div className="font-bold text-sm">{Math.round(c.totalGross / c.full18Count)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Best</div>
                      <div className="font-bold text-sm">{c.bestGross}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-2">
            {stats.gameHistory.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No games linked to this profile yet.</p>
                </CardContent>
              </Card>
            )}
            {[...stats.gameHistory]
              .sort((a, b) => b.gameDate.localeCompare(a.gameDate))
              .map(g => (
                <div
                  key={g.gameId}
                  className="flex items-center justify-between py-3 px-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                  onClick={() => navigate(`/game/${g.gameId}`)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{g.gameName}</div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{g.gameDate}</span>
                      <span>·</span>
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{g.courseName}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    {g.holesPlayed === 18 && (
                      <div className="text-sm font-bold tabular-nums">{g.grossTotal}</div>
                    )}
                    <div className={`text-xs font-semibold tabular-nums ${
                      g.moneyWon > 0 ? "text-green-600 dark:text-green-400" :
                      g.moneyWon < 0 ? "text-red-500" : "text-muted-foreground"
                    }`}>
                      {g.moneyWon >= 0 ? "+" : ""}{g.moneyWon.toFixed(0)}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="flex items-center justify-center gap-1 mb-1">
          {icon}
          <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
        </div>
        <div className={`text-lg font-bold tabular-nums ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
