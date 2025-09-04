export interface UserDb {
	uuid: string;
	username: string;
	email: string;
	password_hash: string | null;
	tfa: boolean;
	avatar: string | null;
	ranking: number;
	created_at: string;
	last_seen: string;
	google_id: string | null;
}

export interface UserStatsDb {
	username: string;
	uuid: string;
	email: string | null;
	avatar: string | null;
	ranking: number;
	created_at: string;
	wins: number;
	losses: number;
	total_games: number;
	online: boolean;
};

export interface GameDb {
	id: number;
	team_1_score: number;
	team_2_score: number;
	created_at: string;
};

export interface GamePlayerDb {
	team_number: number;
	uuid: string | null;
	username: string | null;
	avatar: string | null;
	ranking: number | null;
	created_at: string | null;
};

export interface PublicUserDb {
	uuid: string;
	username: string;
	avatar: string | null;
	ranking: number;
	created_at: string;
};

export interface PendingUserDb {
	username: string;
	email: string;
	password_hash: string;
	confirmation_token: string;
	expires_at: string;
	created_at: string;
};
