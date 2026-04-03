import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw } from "lucide-react";

interface Props {
  gameId: number;
  currentHole: number;
  gameStatus?: string;
}

function getStorageKey(gameId: number) {
  return `pace-${gameId}`;
}

interface PaceData {
  holeStartTimes: Record<number, number>;
  holeEndTimes: Record<number, number>;
  gameStartTime: number;
  gameEndTime?: number;
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

// Fun pace comments based on hole time
function getPaceComment(holeMs: number, avgMs: number): string {
  const mins = holeMs / 60000;
  if (mins < 8) return "Speed golf! Save some for the 19th hole";
  if (mins < 10) return "Nice pace. The group behind you is grateful";
  if (mins < 13) return "Right on schedule";
  if (mins < 16) return "Taking the scenic route?";
  if (mins < 20) return "The club might close before you finish";
  return "Did someone lose a ball... or the entire group?";
}

function getRoundComment(totalMs: number, holesPlayed: number): string {
  if (holesPlayed === 0) return "";
  const totalHours = totalMs / 3600000;
  const projectedHours = (totalHours / holesPlayed) * 18;
  if (projectedHours < 3) return "Pro pace!";
  if (projectedHours < 3.5) return "Solid";
  if (projectedHours < 4) return "Normal";
  if (projectedHours < 4.5) return "Leisurely";
  if (projectedHours < 5) return "Are you playing or camping?";
  return "Booking a hotel on hole 9";
}

export default function PaceTimer({ gameId, currentHole, gameStatus }: Props) {
  const [pace, setPace] = useState(() => loadPace(gameId));
  const [now, setNow] = useState(Date.now());
  const prevHoleRef = useRef(currentHole);
  const isFinished = gameStatus === "finished";

  // Stop timer when game finishes
  useEffect(() => {
    if (isFinished && !pace.gameEndTime) {
      const updated = { ...pace, gameEndTime: Date.now() };
      // Also end current hole
      if (pace.holeStartTimes[currentHole] && !pace.holeEndTimes[currentHole]) {
        updated.holeEndTimes = { ...updated.holeEndTimes, [currentHole]: Date.now() };
      }
      setPace(updated);
      savePace(gameId, updated);
    }
  }, [isFinished]);

  // Auto-start/stop holes
  useEffect(() => {
    if (isFinished) return;
    const prev = prevHoleRef.current;
    const updated = { ...pace };
    let changed = false;

    if (prev !== currentHole && updated.holeStartTimes[prev] && !updated.holeEndTimes[prev]) {
      updated.holeEndTimes = { ...updated.holeEndTimes, [prev]: Date.now() };
      changed = true;
    }
    if (!updated.holeStartTimes[currentHole]) {
      updated.holeStartTimes = { ...updated.holeStartTimes, [currentHole]: Date.now() };
      changed = true;
    }
    if (changed) { setPace(updated); savePace(gameId, updated); }
    prevHoleRef.current = currentHole;
  }, [currentHole]);

  // Tick every second (only if game is active)
  useEffect(() => {
    if (isFinished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isFinished]);

  const effectiveNow = isFinished ? (pace.gameEndTime || now) : now;
  const holeStart = pace.holeStartTimes[currentHole];
  const holeEnd = pace.holeEndTimes[currentHole];
  const holeElapsed = holeStart ? (holeEnd || effectiveNow) - holeStart : 0;

  let completedCount = 0, completedTotal = 0;
  for (let h = 1; h <= 18; h++) {
    const s = pace.holeStartTimes[h], e = pace.holeEndTimes[h];
    if (s && e) { completedCount++; completedTotal += e - s; }
  }
  const avgMs = completedCount > 0 ? completedTotal / completedCount : 0;
  const totalElapsed = effectiveNow - pace.gameStartTime;

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
            <Clock className={`w-4 h-4 ${isFinished ? "text-muted-foreground" : "text-primary"}`} />
            <div>
              <div className="text-[10px] text-muted-foreground">
                {isFinished ? "Finished" : `Hole ${currentHole}`}
              </div>
              <div className={`text-lg font-bold tabular-nums ${
                isFinished ? "text-muted-foreground" :
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

          {!isFinished && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetTimer} title="Reset all timers">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
        {/* Fun pace comment */}
        {holeElapsed > 5 * 60 * 1000 && !isFinished && (
          <p className="text-[10px] text-muted-foreground text-center mt-1 italic">
            {getPaceComment(holeElapsed, avgMs)}
          </p>
        )}
        {isFinished && completedCount > 0 && (
          <p className="text-[10px] text-muted-foreground text-center mt-1 italic">
            Round complete: {formatDuration(totalElapsed)} · {getRoundComment(totalElapsed, completedCount)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
