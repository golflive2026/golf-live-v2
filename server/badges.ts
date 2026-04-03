import { type Game, type Player, type Score, type RosterPlayer, getCourse } from "@shared/schema";
import { computeLeaderboard, computeSettlement } from "@shared/golf";

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

interface PlayerGameStats {
  rosterId: number;
  gamesPlayed: number;
  gamesFinished: number;
  wins: number;
  lastPlace: number;
  totalMoney: number;
  moneyPerGame: number[];
  birdies: number;
  eagles: number;
  bogeys: number;
  grossScores: number[];
  handicap: number;
  coursesPlayed: Set<string>;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  uniqueOpponentsLostTo: Set<number>;
  firstGameWon: boolean;
  lostAfterFirstWin: number;
  bestGross: number;
  worstGross: number;
}

const ALL_BADGES: { id: string; emoji: string; title: string; description: string; check: (s: PlayerGameStats) => boolean }[] = [
  // === INSTANT (from game 1) ===
  {
    id: "first-blood",
    emoji: "⭐",
    title: "First Blood",
    description: "Won their very first game",
    check: s => s.firstGameWon,
  },
  {
    id: "winner",
    emoji: "🏆",
    title: "Winner",
    description: "Winner buys drinks! Oh wait...",
    check: s => s.wins >= 1,
  },
  {
    id: "lunch-buyer",
    emoji: "🍽️",
    title: "Thanks for Lunch",
    description: "Lost this round — lunch is on you",
    check: s => s.lastPlace >= 1 && s.totalMoney < 0,
  },
  {
    id: "eagle-spotted",
    emoji: "🦅",
    title: "Eagle Spotted",
    description: "A rare sighting on the course",
    check: s => s.eagles >= 1,
  },
  {
    id: "birdie-hunter",
    emoji: "🐦",
    title: "Birdie Hunter",
    description: "Collecting birdies like stamps",
    check: s => s.birdies >= 3,
  },
  // === AFTER A FEW GAMES ===
  {
    id: "serial-winner",
    emoji: "👑",
    title: "Serial Winner",
    description: "Wins more often than he buys drinks",
    check: s => s.wins >= 3,
  },
  {
    id: "the-landlord",
    emoji: "💰",
    title: "The Landlord",
    description: "Collects rent on every fairway",
    check: s => s.totalMoney >= 50,
  },
  {
    id: "atm-machine",
    emoji: "🏧",
    title: "ATM Machine",
    description: "Dispenses cash to playing partners",
    check: s => s.totalMoney <= -50,
  },
  {
    id: "course-collector",
    emoji: "🗺️",
    title: "Course Collector",
    description: "Has a locker at every club in Bulgaria",
    check: s => s.coursesPlayed.size >= 3,
  },
  {
    id: "the-regular",
    emoji: "🏌️",
    title: "The Regular",
    description: "Plays more golf than a retired millionaire",
    check: s => s.gamesPlayed >= 5,
  },
  // === ROASTING (need more history) ===
  {
    id: "lunch-sponsor",
    emoji: "🥂",
    title: "Lunch Sponsor",
    description: "Officially funds the 19th hole menu",
    check: s => s.maxConsecutiveLosses >= 3,
  },
  {
    id: "participation-trophy",
    emoji: "🏳️",
    title: "Participation Trophy",
    description: "Many games. Zero wins. Unbreakable spirit",
    check: s => s.gamesFinished >= 5 && s.wins === 0,
  },
  {
    id: "rollercoaster",
    emoji: "🎢",
    title: "The Rollercoaster",
    description: "78 on Saturday, 102 on Sunday. Same guy",
    check: s => s.grossScores.length >= 2 && (s.bestGross > 0) && (s.worstGross - s.bestGross >= 12),
  },
  {
    id: "sandbagger",
    emoji: "🎭",
    title: "The Sandbagger",
    description: "Handicap says 24, plays like a 12. Hmm",
    check: s => s.handicap >= 18 && s.wins >= 2,
  },
  {
    id: "reverse-midas",
    emoji: "💸",
    title: "Reverse Midas",
    description: "Everything he touches turns to bogey",
    check: s => {
      if (s.gamesFinished < 3) return false;
      const losses = s.moneyPerGame.filter(m => m < 0).length;
      return losses / s.gamesFinished >= 0.7;
    },
  },
  {
    id: "bogey-train",
    emoji: "🚂",
    title: "Bogey Train",
    description: "All aboard! Next stop: double bogey",
    check: s => s.bogeys >= 20,
  },
  {
    id: "birdie-machine",
    emoji: "🎰",
    title: "Birdie Machine",
    description: "Birdies like it's going out of fashion",
    check: s => s.birdies >= 10,
  },
  // === ABSURD / SOCIAL ===
  {
    id: "beginners-luck",
    emoji: "🧲",
    title: "Beginner's Luck",
    description: "Won first game. It's been downhill since",
    check: s => s.firstGameWon && s.lostAfterFirstWin >= 2 && s.gamesFinished >= 3,
  },
  {
    id: "everybodys-donor",
    emoji: "🤝",
    title: "Everybody's Donor",
    description: "Has personally funded most of the roster",
    check: s => s.uniqueOpponentsLostTo.size >= 5,
  },
  {
    id: "getting-worse",
    emoji: "📉",
    title: "Getting Worse",
    description: "Practice makes... whatever this is",
    check: s => {
      if (s.grossScores.length < 4) return false;
      const mid = Math.floor(s.grossScores.length / 2);
      const earlier = s.grossScores.slice(0, mid);
      const recent = s.grossScores.slice(mid);
      const avgE = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      const avgR = recent.reduce((a, b) => a + b, 0) / recent.length;
      return avgR - avgE >= 4;
    },
  },
  {
    id: "one-hit-wonder",
    emoji: "🎤",
    title: "One Hit Wonder",
    description: "Came. Played. Never returned",
    check: s => s.gamesFinished === 1 && s.gamesPlayed === 1,
  },
  {
    id: "mr-consistent",
    emoji: "🎯",
    title: "Mr. Consistent",
    description: "Scores vary less than his excuses",
    check: s => {
      if (s.grossScores.length < 3) return false;
      const mean = s.grossScores.reduce((a, b) => a + b, 0) / s.grossScores.length;
      const variance = s.grossScores.reduce((sum, x) => sum + (x - mean) ** 2, 0) / s.grossScores.length;
      return Math.sqrt(variance) < 3.5;
    },
  },
];

export async function computeBadges(
  allGames: Game[],
  allPlayers: Player[],
  allScores: Score[],
  allRoster: RosterPlayer[],
): Promise<Map<number, Badge[]>> {
  const badgeMap = new Map<number, Badge[]>();
  const statsMap = new Map<number, PlayerGameStats>();

  for (const rp of allRoster) {
    statsMap.set(rp.id, {
      rosterId: rp.id, gamesPlayed: 0, gamesFinished: 0, wins: 0, lastPlace: 0,
      totalMoney: 0, moneyPerGame: [], birdies: 0, eagles: 0, bogeys: 0,
      grossScores: [], handicap: rp.handicap, coursesPlayed: new Set(),
      consecutiveLosses: 0, maxConsecutiveLosses: 0,
      uniqueOpponentsLostTo: new Set(), firstGameWon: false,
      lostAfterFirstWin: 0, bestGross: 999, worstGross: 0,
    });
  }

  const finishedGames = allGames
    .filter(g => g.status === "finished")
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const game of finishedGames) {
    const course = getCourse(game.courseId);
    const gamePlayers = allPlayers.filter(p => p.gameId === game.id);
    const gameScores = allScores.filter(s => s.gameId === game.id);
    if (gamePlayers.length < 2) continue;

    const entries = computeLeaderboard(gamePlayers, gameScores, course);
    const settlement = computeSettlement(entries, gameScores, gamePlayers, game, course);

    for (const gp of gamePlayers) {
      if (!gp.rosterId) continue;
      const stats = statsMap.get(gp.rosterId);
      if (!stats) continue;

      stats.gamesPlayed++;
      stats.gamesFinished++;
      stats.coursesPlayed.add(game.courseId);

      const entry = entries.find(e => e.player.id === gp.id);
      const sEntry = settlement.find(s => s.playerId === gp.id);
      const money = sEntry?.grandTotal ?? 0;

      stats.moneyPerGame.push(money);
      stats.totalMoney += money;

      if (entry) {
        stats.birdies += entry.birdies;
        stats.eagles += entry.eagles;

        for (let i = 0; i < 18; i++) {
          const gross = entry.holeScores[i];
          if (gross !== null && gross > course.holePars[i]) stats.bogeys++;
        }

        if (entry.holesPlayed === 18) {
          stats.grossScores.push(entry.grossTotal);
          if (entry.grossTotal < stats.bestGross) stats.bestGross = entry.grossTotal;
          if (entry.grossTotal > stats.worstGross) stats.worstGross = entry.grossTotal;
        }

        const position = entries.indexOf(entry) + 1;
        if (position === 1) {
          stats.wins++;
          if (stats.gamesFinished === 1) stats.firstGameWon = true;
          stats.consecutiveLosses = 0;
        } else {
          if (stats.firstGameWon && stats.wins === 1) stats.lostAfterFirstWin++;
          if (money < 0) {
            stats.consecutiveLosses++;
            if (stats.consecutiveLosses > stats.maxConsecutiveLosses) {
              stats.maxConsecutiveLosses = stats.consecutiveLosses;
            }
          } else {
            stats.consecutiveLosses = 0;
          }
        }
        if (position === entries.length) stats.lastPlace++;

        if (money < 0) {
          for (const other of gamePlayers) {
            if (other.id !== gp.id && other.rosterId) {
              const otherS = settlement.find(s => s.playerId === other.id);
              if (otherS && otherS.grandTotal > 0) stats.uniqueOpponentsLostTo.add(other.rosterId);
            }
          }
        }
      }
    }
  }

  for (const rp of allRoster) {
    const stats = statsMap.get(rp.id);
    if (!stats || stats.gamesFinished === 0) { badgeMap.set(rp.id, []); continue; }
    const earned: Badge[] = [];
    for (const badge of ALL_BADGES) {
      if (badge.check(stats)) earned.push({ id: badge.id, emoji: badge.emoji, title: badge.title, description: badge.description });
    }
    badgeMap.set(rp.id, earned);
  }

  return badgeMap;
}
