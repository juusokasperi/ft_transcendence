import './config.ts';
import { runMigrations } from '../db/migrations.ts';
import {
  addUser,
  updateUserSettings,
  updateLastSeen,
  getUserStats,
  updateUserRanking,
} from '../db/queries/users.ts';
import { upsertMatchPlayerStats } from '../db/queries/matchPlayerStats.ts';
import db from '../db/client.ts';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { addFriend, respondToFriendReq } from '../db/queries/friends.ts';
import { addMatch, addMatchPlayer } from '../db/queries/matches.ts';
import { createSettings } from '../db/queries/unconfirmedUsers.ts';
import { deleteUser } from '../db/queries/userDelete.ts';

// Run migrations first
await runMigrations();

function generateMatchStats(games: { p1: number; p2: number }[]) {
  let p1GamesWon = 0,
    p2GamesWon = 0;
  let p1Points = 0,
    p2Points = 0;
  let p1MaxLead = 0,
    p2MaxLead = 0;

  for (const g of games) {
    p1Points += g.p1;
    p2Points += g.p2;
    if (g.p1 > g.p2) p1GamesWon++;
    else p2GamesWon++;
    p1MaxLead = Math.max(p1MaxLead, g.p1 - g.p2);
    p2MaxLead = Math.max(p2MaxLead, g.p2 - g.p1);
  }

  return [
    {
      pointsScored: p1Points,
      pointsConceded: p2Points,
      gamesWon: p1GamesWon,
      gamesLost: p2GamesWon,
      maxPointLead: p1MaxLead,
    },
    {
      pointsScored: p2Points,
      pointsConceded: p1Points,
      gamesWon: p2GamesWon,
      gamesLost: p1GamesWon,
      maxPointLead: p2MaxLead,
    },
  ];
}

function getMatchPlayerId(matchId: number, userUuid: string): number | null {
  const row = db
    .prepare('SELECT id FROM MatchPlayers WHERE match_id = ? AND user_uuid = ?')
    .get(matchId, userUuid) as { id: number } | undefined;
  return row?.id ?? null;
}

function seedMatch(
    team1Score: number,
    team2Score: number,
    team1Uuid: string,
    team2Uuid: string,
    team1Delta: number,
    team2Delta: number,
    tournamentId?: number,
    tournamentStage?: string
): number | null {
    const transaction = db.transaction(() => {
        const matchId = addMatch(
            team1Score,
            team2Score,
            tournamentId,
            tournamentStage
        );
        if (!matchId) throw new Error('Failed to create match entry');

        if (!addMatchPlayer(matchId, team1Uuid, 1, team1Delta)) {
            throw new Error(`Failed to add team 1 player ${team1Uuid}`);
        }
        if (!addMatchPlayer(matchId, team2Uuid, 2, team2Delta)) {
            throw new Error(`Failed to add team 2 player ${team2Uuid}`);
        }
        return matchId;
    });

    try {
        return transaction();
    } catch (error) {
        console.error("Failed to seed match:", error);
        return null;
    }
}

const createUser = async (username: string, email: string, password: string) => {
  const passwordHash = await bcrypt.hash(password, 10);
  const uuid = uuidv4();
  addUser(uuid, username, passwordHash, email);
  createSettings(uuid);
  return uuid;
};

// Create a few test users
const uuidJoe = await createUser('Joe', 'joe@test.com', 'testPassword!1');
await createUser('Nick', 'nick@test.com', 'testPassword!1');
const uuidBob = await createUser('Bob', 'bob@test.com', 'testPassword!1');
const uuidWil = await createUser('Wil', 'wil@test.com', 'testPassword!1');
const uuidDave = await createUser('Dave', 'dave@test.com', 'testPassword!1');
// Make Joe and Bob friends
addFriend(uuidJoe, uuidBob);
respondToFriendReq(uuidBob, uuidJoe, true);
// Make Joe and Wil friends
addFriend(uuidJoe, uuidWil);
respondToFriendReq(uuidWil, uuidJoe, true);
// Bob wants to befriend Wil, but Wil has not responded
addFriend(uuidBob, uuidWil);
// Create a few matches
const matchIds = [
  seedMatch(3, 0, uuidBob, uuidJoe, 30, -10),
  seedMatch(2, 0, uuidBob, uuidJoe, 10, -5),
  seedMatch(4, 1, uuidWil, uuidBob, -2, 8),
  seedMatch(3, 0, uuidJoe, uuidWil, 0, 10),
  seedMatch(4, 1, uuidJoe, uuidWil, 5, 10, 1, 'final'),
];

const statsData = [
  [0, uuidBob, { pointsScored: 11, pointsConceded: 5, gamesWon: 3, gamesLost: 0, maxPointLead: 6 }],
  [0, uuidJoe, { pointsScored: 5, pointsConceded: 11, gamesWon: 0, gamesLost: 3, maxPointLead: 2 }],
  [
    1,
    uuidBob,
    { pointsScored: 11, pointsConceded: 0, gamesWon: 2, gamesLost: 0, maxPointLead: 11 },
  ],
  [1, uuidJoe, { pointsScored: 0, pointsConceded: 11, gamesWon: 0, gamesLost: 1, maxPointLead: 0 }],
  [
    2,
    uuidWil,
    { pointsScored: 10, pointsConceded: 12, gamesWon: 4, gamesLost: 1, maxPointLead: 3 },
  ],
  [
    2,
    uuidBob,
    { pointsScored: 12, pointsConceded: 10, gamesWon: 1, gamesLost: 4, maxPointLead: 4 },
  ],
  [3, uuidJoe, { pointsScored: 1, pointsConceded: 11, gamesWon: 3, gamesLost: 0, maxPointLead: 1 }],
  [
    3,
    uuidWil,
    { pointsScored: 11, pointsConceded: 1, gamesWon: 0, gamesLost: 3, maxPointLead: 10 },
  ],
  [4, uuidJoe, { pointsScored: 8, pointsConceded: 11, gamesWon: 4, gamesLost: 1, maxPointLead: 4 }],
  [4, uuidWil, { pointsScored: 11, pointsConceded: 8, gamesWon: 1, gamesLost: 4, maxPointLead: 7 }],
];

for (const [matchIdx, userUuid, stats] of statsData as any) {
  const matchId = matchIds[matchIdx];
  if (!matchId) {
    console.warn(`Skipping stats for match index ${matchIdx} because match creation failed.`);
    continue;
  }

  const matchPlayerId = getMatchPlayerId(matchId, userUuid);
  if (matchPlayerId) {
    upsertMatchPlayerStats(matchPlayerId, stats);
  } else {
      console.warn(`Could not find MatchPlayer entry for match ${matchId}, user ${userUuid}`);
  }

  let delta = 0;
  if (matchIdx === 0) delta = userUuid === uuidBob ? 30 : -10;
  if (matchIdx === 1) delta = userUuid === uuidBob ? 10 : -5;
  if (matchIdx === 2) delta = userUuid === uuidWil ? -2 : 8;
  if (matchIdx === 3) delta = userUuid === uuidJoe ? 0 : 10;
  if (matchIdx === 4) delta = userUuid === uuidJoe ? 5 : 10;
  const user = getUserStats(userUuid);
  if (!user) continue;
  const oldRanking = user.ranking;
  updateUserRanking(userUuid, oldRanking + delta);
}

// Change UserProfileSettings for Joe and Bob
updateUserSettings(uuidJoe, {
  paddle_color: '#FF0000',
  photo_sensitive_mode: 1,
  color_blind_mode: 1,
});

updateUserSettings(uuidBob, { paddle_color: '#BB00FF', color_blind_mode: 2 });

for (let i = 0; i < 25; i++) {
  const gamesToWin = Math.random() < 0.5 ? 2 : 3;
  const totalGames = gamesToWin * 2 - 1;
  let wilGames = 0,
    joeGames = 0;
  const games: { p1: number; p2: number }[] = [];

  for (let g = 0; g < totalGames; g++) {
    let wilScore = Math.floor(8 + Math.random() * 4); // 8-11
    let joeScore = Math.floor(7 + Math.random() * 5); // 7-11
    if (wilScore === joeScore) wilScore++;
    if (wilScore > joeScore) wilGames++;
    else joeGames++;
    games.push({ p1: wilScore, p2: joeScore });
    if (wilGames === gamesToWin || joeGames === gamesToWin) break;
  }

  const [wilStats, joeStats] = generateMatchStats(games);
  if (!wilStats || !joeStats) continue;
  let wilPoints;
  let joePoints;
  if (wilStats.gamesWon > joeStats.gamesWon) {
    wilPoints = 10;
    joePoints = -10;
  } else if (wilStats.gamesWon < joeStats.gamesWon) {
    wilPoints = -10;
    joePoints = 10;
  } else {
    wilPoints = 0;
    joePoints = 0;
  }
  const matchId = seedMatch(
    wilStats.gamesWon,
    joeStats.gamesWon,
    uuidWil,
    uuidJoe,
    wilPoints,
    joePoints,
  );
  if (!matchId) continue;

  const wilMatchPlayerId = getMatchPlayerId(matchId, uuidWil);
  if (wilMatchPlayerId) upsertMatchPlayerStats(wilMatchPlayerId, wilStats);

  const joeMatchPlayerId = getMatchPlayerId(matchId, uuidJoe);
  if (joeMatchPlayerId) upsertMatchPlayerStats(joeMatchPlayerId, joeStats);

  const wilOld = getUserStats(uuidWil)?.ranking;
  const joeOld = getUserStats(uuidJoe)?.ranking;
  if (wilOld === undefined || joeOld === undefined) continue;
  updateUserRanking(uuidWil, wilOld + wilPoints);
  updateUserRanking(uuidJoe, joeOld + joePoints);
}

const uuidGhost = await createUser('Ghost', 'ghost@test.com', 'testPassword!1');
for (let i = 0; i < 3; i++) {
  const games = [
    { p1: 11, p2: 7 + i },
    { p1: 11, p2: 8 + i },
  ];
  const [wilStats, ghostStats] = generateMatchStats(games);
  if (!wilStats || !ghostStats) continue;
  const matchId = seedMatch(wilStats.gamesWon, ghostStats.gamesWon, uuidWil, uuidGhost, 10, -5);
  if (!matchId) continue;

  const wilMatchPlayerId = getMatchPlayerId(matchId, uuidWil);
  if (wilMatchPlayerId) upsertMatchPlayerStats(wilMatchPlayerId, wilStats);

  const ghostMatchPlayerId = getMatchPlayerId(matchId, uuidGhost);
  if (ghostMatchPlayerId) upsertMatchPlayerStats(ghostMatchPlayerId, ghostStats);
}
deleteUser(uuidGhost);

// Move Joe's and Bob's last_seen to 10 minutes ago, so they appear offline
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
updateLastSeen(uuidJoe, tenMinutesAgo);
updateLastSeen(uuidBob, tenMinutesAgo);
