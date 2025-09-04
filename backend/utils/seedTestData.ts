import './config.ts';
import { runMigrations } from '../db/migrations.ts';
import { addUser, updateUserSettings, updateLastSeen } from '../db/queries/users.ts';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { addFriend, respondToFriendReq } from '../db/queries/friends.ts';
import { addGame } from '../db/queries/games.ts';
import { createSettings } from '../db/queries/unconfirmedUsers.ts';

// Run migrations first
await runMigrations();

const createUser = async (username: string, email: string, password: string) => {
	const passwordHash = await bcrypt.hash(password, 10);
	const uuid = uuidv4();
	addUser(uuid, username, passwordHash, email);
	createSettings(uuid);
	return (uuid);
}

// Create a few test users
const uuidJoe = await createUser("Joe", "joe@test.com", "testPassword!1");
const uuidBob = await createUser("Bob", "bob@test.com", "testPassword!1");
const uuidWil = await createUser("Wil", "wil@test.com", "testPassword!1");
// Make Joe and Bob friends
addFriend(uuidJoe, uuidBob);
respondToFriendReq(uuidBob, uuidJoe, true);
// Make Joe and Wil friends
addFriend(uuidJoe, uuidWil);
respondToFriendReq(uuidWil, uuidJoe, true);
// Bob wants to befriend Wil, but Wil has not responded
addFriend(uuidBob, uuidWil);
// Create a few games
addGame(11, 5, uuidBob, uuidJoe);
addGame(11, 0, uuidBob, uuidJoe);
addGame(10, 12, uuidWil, uuidBob);
addGame(1, 11, uuidJoe, uuidWil);
// Change UserProfileSettings for Joe and Bob
updateUserSettings(uuidJoe, { paddle_color: '#FF0000', photo_sensitive_mode: 1, color_blind_mode: 1 });
updateUserSettings(uuidBob, { paddle_color: '#BB00FF', color_blind_mode: 2 });

// Move Joe's and Bob's last_seen to 10 minutes ago, so they appear offline
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
updateLastSeen(uuidJoe, tenMinutesAgo);
updateLastSeen(uuidBob, tenMinutesAgo);
