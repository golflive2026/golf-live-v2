import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Play, RotateCcw } from "lucide-react";

interface Props {
  gameId: number;
  currentHole: number;
}

function getStorageKey(gameId: number) {
  return `pace-${gameId}`;
}

interface PaceData {
  holeStartTimes: Record<number, number>;
  holeEndTimes: Record<number, number>;
  gameStartTime: number;
}

function loadPace(gameId: number): PaceData {
  try {
    const raw = localStorage.getItem(getStorageKey(gameId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { holeStartTimes: {}, holeEndTimes: {}, gameStartTime: Date.now() };
}

function savePace(gameId: number, data: PaceData) {
  localStorage.setItem(getStorageKey(gameId), JSON.stringify(data));
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PaceTimer({ gameId, currentHole }: Props) {
  const [pace, setPace] = useState(() => loadPace(gameId));
  const [now, setNow] = useState(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Auto-start timer for current hole if not started
  useEffect(() => {
    if (!pace.holeStartTimes[currentHole]) {
      const updated = { ...pace, holeStartTimes: { ...pace.holeStartTimes, [currentHole]: Date.now() } };
      setPace(updated);
      savePace(gameId, updated);
    }
  }, [currentHole]);

  // Tick every second
  useEffect(() => {
    timerRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const holeStart = pace.holeStartTimes[currentHole];
  const holeElapsed = holeStart ? now - holeStart : 0;

  // Compute completed hole durations
  const completedHoles: number[] = [];
  for (let h = 1; h <= 18; h++) {
    const start = pace.holeStartTimes[h];
    const end = pace.holeEndTimes[h] || (h === currentHole ? now : 0);
    if (start && end) completedHoles.push(end - start);
  }
  const avgMs = completedHoles.length > 0 ? completedHoles.reduce((a, b) => a + b, 0) / completedHoles.length : 0;
  const totalElapsed = now - pace.gameStartTime;

  const markHoleDone = () => {
    const updated = {
      ...pace,
      holeEndTimes: { ...pace.holeEndTimes, [currentHole]: Date.now() },
    };
    // Auto-start next hole
    if (currentHole < 18 && !updated.holeStartTimes[currentHole + 1]) {
      updated.holeStartTimes[currentHole + 1] = Date.now();
    }
    setPace(updated);
    savePace(gameId, updated);
  };

  const resetTimer = () => {
    const fresh: PaceData = { holeStartTimes: { [currentHole]: Date.now() }, holeEndTimes: {}, gameStartTime: Date.now() };
    setPace(fresh);
    savePace(gameId, fresh);
  };

  const isDone = !!pace.holeEndTimes[currentHole];

  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Hole {currentHole}</div>
              <div className={`text-lg font-bold tabular-nums ${
                holeElapsed > 15 * 60 * 1000 ? "text-red-500" :
                holeElapsed > 12 * 60 * 1000 ? "text-yellow-500" : "text-foreground"
              }`}>
                {formatDuration(holeElapsed)}
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Avg/hole</div>
            <div className="text-sm font-semibold tabular-nums">{avgMs > 0 ? formatDuration(avgMs) : "--:--"}</div>
          </div>

          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase">Round</div>
            <div className="text-sm font-semibold tabular-nums">{formatDuration(totalElapsed)}</div>
          </div>

          <div className="flex gap-1">
            {!isDone && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={markHoleDone} title="Mark hole done">
                <Play className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetTimer} title="Reset timer">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
