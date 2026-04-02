import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw } from "lucide-react";

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
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PaceTimer({ gameId, currentHole }: Props) {
  const [pace, setPace] = useState(() => loadPace(gameId));
  const [now, setNow] = useState(Date.now());
  const prevHoleRef = useRef(currentHole);

  // Auto-start timer for current hole, auto-end previous hole when hole changes
  useEffect(() => {
    const prev = prevHoleRef.current;
    const updated = { ...pace };
    let changed = false;

    // End previous hole if it was running
    if (prev !== currentHole && updated.holeStartTimes[prev] && !updated.holeEndTimes[prev]) {
      updated.holeEndTimes = { ...updated.holeEndTimes, [prev]: Date.now() };
      changed = true;
    }

    // Start current hole if not started
    if (!updated.holeStartTimes[currentHole]) {
      updated.holeStartTimes = { ...updated.holeStartTimes, [currentHole]: Date.now() };
      changed = true;
    }

    if (changed) {
      setPace(updated);
      savePace(gameId, updated);
    }
    prevHoleRef.current = currentHole;
  }, [currentHole]);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const holeStart = pace.holeStartTimes[currentHole];
  const holeEnd = pace.holeEndTimes[currentHole];
  const holeElapsed = holeStart ? (holeEnd || now) - holeStart : 0;

  // Completed holes for avg calculation
  let completedCount = 0;
  let completedTotal = 0;
  for (let h = 1; h <= 18; h++) {
    const start = pace.holeStartTimes[h];
    const end = pace.holeEndTimes[h];
    if (start && end) {
      completedCount++;
      completedTotal += end - start;
    }
  }
  const avgMs = completedCount > 0 ? completedTotal / completedCount : 0;
  const totalElapsed = now - pace.gameStartTime;

  const resetTimer = () => {
    const fresh: PaceData = { holeStartTimes: { [currentHole]: Date.now() }, holeEndTimes: {}, gameStartTime: Date.now() };
    setPace(fresh);
    savePace(gameId, fresh);
  };

  return (
    <Card className="border-border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-[10px] text-muted-foreground">Hole {currentHole}</div>
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

          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetTimer} title="Reset all timers">
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
