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
  grossScores: number[]; // full 18-hole rounds only
  handicap: number;
  coursesPlayed: Set<string>;
  consecutiveLosses: number;
  uniqueOpponentsLostTo: Set<number>;
  firstGameWon: boolean;
  lostAfterFirstWin: number;
}

const ALL_BADGES: { id: string; emoji: string; title: string; description: string; check: (s: PlayerGameStats) => boolean }[] = [
  // === POSITIVE ===
  {
    id: "eagle-scout",
    emoji: "🦅",
    title: "Eagle Scout",
    description: "Spotted in the wild: an actual eagle",
    check: s => s.eagles >= 3,
  },
  {
    id: "birdie-machine",
    emoji: "🐦",
    title: "Birdie Machine",
    description: "Birdies like it's going out of fashion",
    check: s => s.birdies >= 15,
  },
  {
    id: "serial-winner",
    emoji: "🏆",
    title: "Serial Winner",
    description: "Wins more often than he buys drinks",
    check: s => s.wins >= 5,
  },
  {
    id: "the-landlord",
    emoji: "💰",
    title: "The Landlord",
    description: "Collects rent on every fairway",
    check: s => s.totalMoney >= 200,
  },
  {
    id: "course-collector",
    emoji: "🗺️",
    title: "Course Collector",
    description: "Has a locker at every course in Bulgaria",
    check: s => s.coursesPlayed.size >= 4,
  },
  {
    id: "mr-consistent",
    emoji: "🎯",
    title: "Mr. Consistent",
    description: "Scores vary less than his excuses",
    check: s => {
      if (s.grossScores.length < 5) return false;
      const mean = s.grossScores.reduce((a, b) => a + b, 0) / s.grossScores.length;
      const variance = s.grossScores.reduce((sum, x) => sum + (x - mean) ** 2, 0) / s.grossScores.length;
      return Math.sqrt(variance) < 3.5;
    },
  },
  {
    id: "first-blood",
    emoji: "⭐",
    title: "First Blood",
    description: "Won their very first game. Natural talent or luck?",
    check: s => s.firstGameWon && s.gamesFinished >= 1,
  },
  // === ROASTING ===
  {
    id: "atm-machine",
    emoji: "🏧",
    title: "ATM Machine",
    description: "Dispenses cash to playing partners since day one",
    check: s => s.totalMoney <= -200,
  },
  {
    id: "lunch-sponsor",
    emoji: "🍽️",
    title: "Lunch Sponsor",
    description: "Officially funds the 19th hole menu",
    check: s => s.consecutiveLosses >= 5,
  },
  {
    id: "participation-trophy",
    emoji: "🏳️",
    title: "Participation Trophy",
    description: "Many games played. Zero wins. Unbreakable spirit",
    check: s => s.gamesFinished >= 10 && s.wins === 0,
  },
  {
    id: "rollercoaster",
    emoji: "🎢",
    title: "The Rollercoaster",
    description: "78 on Saturday, 102 on Sunday. Same guy",
    check: s => {
      if (s.grossScores.length < 3) return false;
      return Math.max(...s.grossScores) - Math.min(...s.grossScores) >= 15;
    },
  },
  {
    id: "sandbagger",
    emoji: "🎭",
    title: "The Sandbagger",
    description: "Handicap says 24, plays like a 12. Hmm",
    check: s => s.handicap >= 18 && s.wins >= 3 && s.gamesFinished >= 5,
  },
  {
    id: "reverse-midas",
    emoji: "💸",
    title: "Reverse Midas",
    description: "Everything he touches turns to bogey",
    check: s => {
      if (s.gamesFinished < 5) return false;
      const lossGames = s.moneyPerGame.filter(m => m < 0).length;
      return lossGames / s.gamesFinished >= 0.7;
    },
  },
  {
    id: "bogey-train",
    emoji: "🚂",
    title: "Bogey Train",
    description: "All aboard! Next stop: double bogey",
    check: s => s.bogeys >= 50,
  },
  // === ABSURD / SOCIAL ===
  {
    id: "getting-worse",
    emoji: "📉",
    title: "Getting Worse",
    description: "Practice makes... whatever this is",
    check: s => {
      if (s.grossScores.length < 6) return false;
      const recent = s.grossScores.slice(-3);
      const earlier = s.grossScores.slice(-6, -3);
      const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
      const avgEarlier = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      return avgRecent - avgEarlier >= 5;
    },
  },
  {
    id: "beginners-luck",
    emoji: "🧲",
    title: "Beginner's Luck",
    description: "Won his first game. It's been downhill since",
    check: s => s.firstGameWon && s.lostAfterFirstWin >= 3 && s.gamesFinished >= 5,
  },
  {
    id: "everybodys-donor",
    emoji: "🤝",
    title: "Everybody's Donor",
    description: "Has personally funded most of the roster",
    check: s => s.uniqueOpponentsLostTo.size >= 8,
  },
  {
    id: "the-regular",
    emoji: "🏌️",
    title: "The Regular",
    description: "Plays more golf than a retired millionaire",
    check: s => s.gamesPlayed >= 15,
  },
  {
    id: "one-hit-wonder",
    emoji: "🎤",
    title: "One Hit Wonder",
    description: "Came. Played. Never returned",
    check: s => s.gamesFinished === 1 && s.gamesPlayed === 1,
  },
];

export async function computeBadges(
  allGames: Game[],
  allPlayers: Player[],
  allScores: Score[],
  allRoster: RosterPlayer[],
): Promise<Map<number, Badge[]>> {
  const badgeMap = new Map<number, Badge[]>();

  // Build per-roster-player stats from game data
  const statsMap = new Map<number, PlayerGameStats>();

  // Initialize stats for each roster player
  for (const rp of allRoster) {
    statsMap.set(rp.id, {
      rosterId: rp.id,
      gamesPlayed: 0,
      gamesFinished: 0,
      wins: 0,
      lastPlace: 0,
      totalMoney: 0,
      moneyPerGame: [],
      birdies: 0,
      eagles: 0,
      bogeys: 0,
      grossScores: [],
      handicap: rp.handicap,
      coursesPlayed: new Set(),
      consecutiveLosses: 0,
      uniqueOpponentsLostTo: new Set(),
      firstGameWon: false,
      lostAfterFirstWin: 0,
    });
  }

  // Process each finished game
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

        // Count bogeys
        for (let i = 0; i < 18; i++) {
          const gross = entry.holeScores[i];
          if (gross !== null && gross > course.holePars[i]) {
            stats.bogeys++;
          }
        }

        // Full 18-hole round score
        if (entry.holesPlayed === 18) {
          stats.grossScores.push(entry.grossTotal);
        }

        // Win/loss tracking
        const position = entries.indexOf(entry) + 1;
        if (position === 1) {
          stats.wins++;
          if (stats.gamesFinished === 1) stats.firstGameWon = true;
          stats.consecutiveLosses = 0;
        } else {
          if (stats.firstGameWon && stats.wins === 1) {
            stats.lostAfterFirstWin++;
          }
          if (money < 0) {
            stats.consecutiveLosses++;
          } else {
            stats.consecutiveLosses = 0;
          }
        }
        if (position === entries.length) {
          stats.lastPlace++;
        }

        // Track unique opponents lost money to
        if (money < 0) {
          for (const other of gamePlayers) {
            if (other.id !== gp.id && other.rosterId) {
              const otherSettlement = settlement.find(s => s.playerId === other.id);
              if (otherSettlement && otherSettlement.grandTotal > 0) {
                stats.uniqueOpponentsLostTo.add(other.rosterId);
              }
            }
          }
        }
      }
    }
  }

  // Compute badges for each player
  for (const rp of allRoster) {
    const stats = statsMap.get(rp.id);
    if (!stats || stats.gamesFinished === 0) {
      badgeMap.set(rp.id, []);
      continue;
    }

    const earned: Badge[] = [];
    for (const badge of ALL_BADGES) {
      if (badge.check(stats)) {
        earned.push({ id: badge.id, emoji: badge.emoji, title: badge.title, description: badge.description });
      }
    }
    badgeMap.set(rp.id, earned);
  }

  return badgeMap;
}
