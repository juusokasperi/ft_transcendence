import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/*
	Seeds a secret to backend .env and (TODO) to game server .env
	Seeds a JWT secret to backend .env
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gameSecret = crypto.randomBytes(32).toString('hex');
const jwtSecret = crypto.randomBytes(32).toString('hex');

const backendEnvPath = path.join(__dirname, '../.env');
//const gameServerEnvPath = path.join(__dirname, '../game-server/.env');

const updateEnvFile = (filePath: string, key: string, value: string) => {
  let envContent = '';
  if (fs.existsSync(filePath)) envContent = fs.readFileSync(filePath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) envContent = envContent.replace(regex, `${key}=${value}`);
  else envContent += `${key}=${value}\n`;
  fs.writeFileSync(filePath, envContent);
  console.log(`Updated ${key} in ${filePath}`);
};

updateEnvFile(backendEnvPath, 'SECRET', jwtSecret);
//updateEnvFile(gameServerEnvPath, 'GAME_SECRET', jwtSecret);
