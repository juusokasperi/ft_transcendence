import dotenv from 'dotenv';

dotenv.config();

if (!process.env.FRONTEND_URL || !process.env.SECRET || !process.env.DATABASE_URL) {
	throw new Error("Required environment variables are missing.");
  }

// export const DATABASE_PATH = 'data/sqlite_data.db' as string;
export const DATABASE_URL = process.env.DATABASE_URL as string;
export const PORT = (process.env.PORT || 3001) as number;
export const SECRET = process.env.SECRET as string;
export const FRONTEND_URL = process.env.FRONTEND_URL as string;
