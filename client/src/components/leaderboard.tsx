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

// Savage randomized commentary
function pick(arr: string[], seed: number): string {
  return arr[Math.abs(seed) % arr.length];
}

function getPlayerComment(entry: LeaderboardEntry, position: number, total: number, course: CourseData): string | null {
  if (entry.holesPlayed === 0) return null;
  if (entry.holesPlayed < 2) return null;
  const seed = entry.player.id * 7 + entry.holesPlayed * 13 + entry.grossTotal;

  // Leader
  if (position === 1 && total > 1) {
    if (entry.birdies >= 3) return pick([
      "On fire. Someone call the marshals",
      "Playing golf while others play fetch",
      "At this point just hand over the wallets",
      "Forgot to tell everyone this is a charity event",
    ], seed);
    if (entry.eagles > 0) return pick([
      "Eagle on the card. Lunch is sorted",
      "Showing off with eagles. We get it, you're good",
      "That eagle cost everyone else money. Beautiful",
    ], seed);
    return pick([
      "Leading. Try not to bottle it on the back 9",
      "Currently winning. Historically, this means nothing",
      "Ahead for now. Golf has a way of humbling people",
      "Top of the board. Don't let it go to your head",
    ], seed);
  }

  // Last place
  if (position === total && total > 1) {
    if (entry.holesPlayed >= 14) return pick([
      "Thanks for lunch. And dinner. And drinks",
      "Officially the group's financial advisor... in reverse",
      "Playing like the course owes him money",
      "Somebody has to fund the prizes. Thank you for your service",
      "The ATM of the group. Generous as always",
      "Playing for the prestigious 'Most Improved Next Time' award",
    ], seed);
    if (entry.holesPlayed >= 9) return pick([
      "Back 9 can only get better... right? RIGHT?",
      "The course isn't going anywhere. Neither is last place",
      "At least the scenery is nice from back here",
      "Still technically playing golf. Technically",
    ], seed);
    return pick([
      "Early days. Plenty of time to disappoint properly",
      "Warming up. The real disaster starts on the back 9",
      "Off to a classic start",
    ], seed);
  }

  // Second to last
  if (position === total - 1 && total > 2) return pick([
    "One spot from buying lunch. Sweat accordingly",
    "Close to last. Can almost taste the free meal",
    "The buffer between mediocrity and the lunch bill",
  ], seed);

  // Second place
  if (position === 2 && total > 2) return pick([
    "First loser. Nobody remembers second place",
    "Close enough to dream, far enough to suffer",
    "Silver medal energy",
  ], seed);

  // Strong back 9
  if (entry.holesPlayed >= 12 && entry.back9Net < entry.front9Net - 3) return pick([
    "Back 9 merchant. Where was this 2 hours ago?",
    "Woke up on the back 9. Better late than never",
    "Front 9 was just a warm-up apparently",
  ], seed);

  // Eagle while losing
  if (entry.eagles > 0 && position > 2) return pick([
    "Has an eagle but still losing. Peak golf",
    "Eagle spotted! Shame about the other 17 holes",
    "One hole of genius, surrounded by chaos",
  ], seed);

  // Many birdies
  if (entry.birdies >= 2 && entry.holesPlayed <= 9) return pick([
    "Birdie hunting season is open",
    "Collecting birdies. Wallet collectors take note",
    "Two birdies in 9 holes. Who is this person?",
  ], seed);

  // Lots of bogeys
  if (entry.holesPlayed >= 6) {
    const avgOverPar = (entry.grossTotal - entry.holesPlayed * (course.totalPar / 18)) / entry.holesPlayed;
    if (avgOverPar > 2) return pick([
      "Bogey train. Next stop: double bogey",
      "Playing a different game to everyone else",
      "The course is winning this battle",
      "Treating par as a suggestion, not a target",
      "Golf is hard. This is proof",
    ], seed);
  }

  // Middle of pack (50% chance to show — less clutter)
  if (total >= 4 && position > 1 && position < total && seed % 2 === 0) return pick([
    "Floating in the middle. Switzerland of golf",
    "Not winning, not buying lunch. The sweet spot",
    "Perfectly average. A gift and a curse",
    "The invisible middle. No glory, no shame",
  ], seed);

  return null;

  return null;
}

export default function Leaderboard({ players, scores, course }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const entries = computeLeaderboard(players, scores, course);

  if (players.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">No players yet</div>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        <div className="w-6">#</div>
        <div>Player</div>
        <div className="text-right w-16">Net</div>
        <div className="text-right w-16">Gross</div>
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
              <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
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
                    <span>{entry.holesPlayed}h</span>
                    {entry.birdies > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] score-birdie">{entry.birdies}🐦</Badge>
                    )}
                    {entry.eagles > 0 && (
                      <Badge variant="secondary" className="h-4 px-1 text-[9px] score-eagle">{entry.eagles}🦅</Badge>
                    )}
                  </div>
                  {(() => {
                    const comment = getPlayerComment(entry, idx + 1, entries.length, course);
                    return comment ? (
                      <p className="text-[10px] italic text-muted-foreground/70 mt-0.5">{comment}</p>
                    ) : null;
                  })()}
                </div>

                <div className="text-right w-16">
                  <div className="text-sm font-bold" data-testid={`text-net-${entry.player.id}`}>
                    {entry.holesPlayed > 0 ? entry.netTotal : "-"}
                  </div>
                  <div className={`text-[10px] font-semibold ${
                    entry.netVsParDisplay.startsWith("-") ? "score-birdie" :
                    entry.netVsParDisplay === "E" ? "score-par" :
                    entry.netVsParDisplay !== "-" ? "score-bogey" : ""
                  }`} data-testid={`text-vspar-${entry.player.id}`}>
                    {entry.netVsParDisplay !== "-" ? entry.netVsParDisplay : ""}
                  </div>
                </div>

                <div className="text-right w-16">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-sm text-muted-foreground" data-testid={`text-gross-${entry.player.id}`}>
                      {entry.holesPlayed > 0 ? entry.grossTotal : "-"}
                    </span>
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </div>
                  <div className={`text-[10px] font-semibold ${
                    entry.vsParDisplay.startsWith("-") ? "score-birdie" :
                    entry.vsParDisplay === "E" ? "score-par" :
                    entry.vsParDisplay !== "-" ? "score-bogey" : ""
                  }`}>
                    {entry.vsParDisplay !== "-" ? entry.vsParDisplay : ""}
                  </div>
                </div>
              </div>

              {expanded && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="grid grid-cols-4 gap-2 text-center mb-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">F9 Net</div>
                      <div className="text-sm font-bold">{entry.holesPlayed > 0 ? entry.front9Net : "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">B9 Net</div>
                      <div className="text-sm font-bold">{entry.holesPlayed > 0 ? entry.back9Net : "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">F9 Gross</div>
                      <div className="text-sm font-bold text-muted-foreground">{entry.holesPlayed > 0 ? entry.front9Gross : "-"}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase">B9 Gross</div>
                      <div className="text-sm font-bold text-muted-foreground">{entry.holesPlayed > 0 ? entry.back9Gross : "-"}</div>
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
