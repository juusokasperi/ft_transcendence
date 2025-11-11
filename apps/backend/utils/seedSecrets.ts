import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '@utils/logger';

/*
	Seeds a secret to backend .env and (TODO) to match server .env
	Seeds a JWT secret to backend .env
*/

const jwtSecret = crypto.randomBytes(32).toString('hex');

const backendEnvPath = path.join(process.cwd(), '.env');
//const gameServerEnvPath = path.join(process.cwd(), '../game-server/.env');

const updateEnvFile = (filePath: string, key: string, value: string) => {
  let envContent = '';
  if (fs.existsSync(filePath)) envContent = fs.readFileSync(filePath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) envContent = envContent.replace(regex, `${key}=${value}`);
  else envContent += `${key}=${value}\n`;
  fs.writeFileSync(filePath, envContent);
  logger.info(`Updated ${key} in ${filePath}`);
};

updateEnvFile(backendEnvPath, 'SECRET', jwtSecret);
//updateEnvFile(gameServerEnvPath, 'MATCH_SECRET', jwtSecret);
