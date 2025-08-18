import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL || !process.env.SECRET) {
	throw new Error("Required environment variables are missing.");
  }

export const DATABASE_URL = process.env.DATABASE_URL as string;
export const PORT = (process.env.PORT || 3001) as number;
export const SECRET = process.env.SECRET as string;
