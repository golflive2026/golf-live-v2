import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type CourseData, type Player, type Score } from "@shared/schema";
import { computeLeaderboard, getScoreColorClass, getScoreBgClass, type LeaderboardEntry } from "@/lib/golf";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";

interface Props {
  players: Player[];
  scores: Score[];
  course: CourseData;
}

function PlayerDetail({ entry, course }: { entry: LeaderboardEntry; course: CourseData }) {
  const front9 = course.holePars.slice(0, 9);
  const back9 = course.holePars.slice(9, 18);

  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground mb-1">Front 9 (Par {course.frontNinePar})</div>
      <div className="grid grid-cols-9 gap-0.5">
        {front9.map((_, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground font-medium">{i + 1}</div>
        ))}
        {front9.map((p, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground">{p}</div>
        ))}
        {front9.map((_, i) => {
          const gross = entry.holeScores[i];
          return (
            <div key={i} className={`text-center text-xs font-bold rounded py-0.5 ${gross != null ? getScoreColorClass(gross, i, course) : ""} ${gross != null ? getScoreBgClass(gross, i, course) : ""}`}>
              {gross ?? "-"}
            </div>
          );
        })}
      </div>

      <div className="text-xs font-medium text-muted-foreground mb-1 mt-2">Back 9 (Par {course.backNinePar})</div>
      <div className="grid grid-cols-9 gap-0.5">
        {back9.map((_, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground font-medium">{i + 10}</div>
        ))}
        {back9.map((p, i) => (
          <div key={i} className="text-center text-[10px] text-muted-foreground">{p}</div>
        ))}
        {back9.map((_, i) => {
          const idx = i + 9;
          const gross = entry.holeScores[idx];
          return (
            <div key={i} className={`text-center text-xs font-bold rounded py-0.5 ${gross != null ? getScoreColorClass(gross, idx, course) : ""} ${gross != null ? getScoreBgClass(gross, idx, course) : ""}`}>
              {gross ?? "-"}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Leaderboard({ players, scores, course }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const entries = computeLeaderboard(players, scores, course);

  if (players.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No players yet</div>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <div className="w-6">#</div>
        <div>Player</div>
        <div className="text-right w-12">Net</div>
        <div className="text-right w-12">Gross</div>
        <div className="text-right w-10">vs Par</div>
      </div>

      {entries.map((entry, idx) => {
        const expanded = expandedId === entry.player.id;
        const position = idx + 1;

        return (
          <Card
            key={entry.player.id}
            className={`border-border transition-all cursor-pointer ${position === 1 && entry.holesPlayed > 0 ? "border-l-2 border-l-primary" : ""}`}
            onClick={() => setExpandedId(expanded ? null : entry.player.id)}
            data-testid={`card-player-${entry.player.id}`}
          >
            <CardContent className="p-3">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center">
                <div className="w-6 text-center">
                  {position === 1 && entry.holesPlayed > 0 ? (
                    <Trophy className="w-4 h-4 text-yellow-500 inline" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">{position}</span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate" data-testid={`text-player-name-${entry.player.id}`}>
                    {entry.player.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>HCP {entry.player.handicap}</span>
                    <span>·</span>
                    <span>{entry.holesPlayed} holes</span>
                    {entry.birdies > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] score-birdie">{entry.birdies}🐦</Badge>
                    )}
                    {entry.eagles > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] score-eagle">{entry.eagles}🦅</Badge>
                    )}
                  </div>
                </div>

                <div className="text-right w-12">
                  <div className="text-sm font-bold" data-testid={`text-net-${entry.player.id}`}>
                    {entry.holesPlayed > 0 ? entry.netTotal : "-"}
                  </div>
                </div>

                <div className="text-right w-12">
                  <div className="text-sm text-muted-foreground" data-testid={`text-gross-${entry.player.id}`}>
                    {entry.holesPlayed > 0 ? entry.grossTotal : "-"}
                  </div>
                </div>

                <div className="text-right w-10 flex items-center justify-end gap-1">
                  <span className={`text-sm font-bold ${
                    entry.netVsParDisplay.startsWith("-") ? "score-birdie" :
                    entry.netVsParDisplay === "E" ? "score-par" :
                    entry.netVsParDisplay !== "-" ? "score-bogey" : ""
                  }`} data-testid={`text-vspar-${entry.player.id}`}>
                    {entry.netVsParDisplay}
                  </span>
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </div>
              </div>

              {expanded && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="grid grid-cols-3 gap-3 text-center mb-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">F9 Net</div>
                      <div className="text-sm font-bold">{entry.holesPlayed > 0 ? entry.front9Net : "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">B9 Net</div>
                      <div className="text-sm font-bold">{entry.holesPlayed > 0 ? entry.back9Net : "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">Total Net</div>
                      <div className="text-sm font-bold">{entry.holesPlayed > 0 ? entry.netTotal : "-"}</div>
                    </div>
                  </div>
                  <PlayerDetail entry={entry} course={course} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
