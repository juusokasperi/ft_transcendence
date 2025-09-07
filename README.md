# FT Transcendence

---

## 👥 Team & Responsibilities

| Member    | Role                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------- |
| Matias    | **Frontend** (React + Tailwind + TypeScript) – user flows: registration, login, deletion, dashboard |
| Juso/Juri | **Backend (REST API + Database Models)** – user management, stats, friends system                   |
| Juso/Juri | **WebSocket Backend** – real-time matchmaking & chat                                                |
| Niklas    | **Game Logic Server** – server-side Pong engine, game physics, Babylon 3D rendering                 |
| Leo       | **DevOps** – Docker, CI/CD, monitoring, deployment                                                  |

---

## 🛠 Tech Stack

- **Backend Framework:** Fastify (Node.js)
- **Database:** SQLite with `better-sqlite3` + `umzug` migrations
- **Frontend:** Vite + React + Tailwind CSS + TypeScript
- **Game Engine:** Babylon.js (advanced 3D)
- **Authentication:** JWT + Google Sign-In + Two-Factor Authentication (2FA)
- **Real-time:** WebSockets (Yuri’s server for matchmaking/chat + Niklas’s game server)
- **DevOps:** Docker, log management, monitoring, microservices design
- **Optional:** Avalanche + Solidity for blockchain tournament score storage

---

## 📂 Database Schema

### Users

- `uuid` (PK)
- `username` (unique)
- `email` (unique)
- `password_hash` (nullable if Google Sign-in)
- `two_factor_enabled` (boolean)
- `created_at` (datetime)
- `avatar`
- `ranking_points` (int, default 1000)
- `google_id` (nullable, unique)

### Games

- `id` (PK)
- `team1_score`
- `team2_score`
- `ended_at` (datetime)

### GamePlayers

- `id` (PK)
- `game_id` (FK → Games.id)
- `user_uuid` (FK → Users.uuid, nullable if deleted)
- `team_number` (1 or 2)

### Friends

- `id` (PK)
- `friend1_uuid` (FK → Users.uuid)
- `friend2_uuid` (FK → Users.uuid)
- `added_at` (datetime)
- `accepted` (boolean)

---

## 📅 Planning

**Phase 1 – Initial Backend & Frontend (Matias + Juuso/Juri)**

- Duration: Weeks 1–2
- Tasks:
  - Set up backend (Fastify + SQLite)
  - Database models & migrations
  - REST API for users, games, friends
  - Frontend signup/login/dashboard pages
  - Connect frontend to API

**Phase 2 – Real-Time & 3D Game**

- Duration: Weeks 3–5
- Tasks:
  - Docker, monitoring, CI/CD pipelines
  - Server-side Pong engine + Babylon.js 3D rendering
  - WebSocket matchmaking & chat

**Phase 3 – Security & Optional Features**

- Duration: Weeks 5–6
- Tasks:
  - JWT + Google Sign-In + 2FA
  - Optional blockchain tournament score storage
  - Stats dashboards & minor features

> Note: Phases overlap slightly; backend and frontend are the foundation for everything else.

---

## 🏆 Modules & Scoring

### Web

- ✅ **(1.0) Major:** Backend with Fastify (Node.js)
- ✅ **(0.5) Minor:** Frontend with React + Tailwind + TS
- ✅ **(0.5) Minor:** Database with SQLite
- ❓ **(1.0) Major:** Blockchain tournament scores (Avalanche + Solidity)

### User Management

- ✅ **(1.0) Major:** User management & authentication
- ✅ **(1.0) Major:** Remote authentication (Google Sign-in + JWT)

### Gameplay & UX

- ✅ **(1.0) Major:** Remote players
- ❓ **(1.0) Major:** Multiplayer (>2 players)
- ❓ **(0.5) Minor:** Game customization options
- ❓ **(1.0) Major:** Live chat

### AI & Algorithms

- ❓ **(1.0) Major:** AI opponent
- ✅ **(0.5) Minor:** Stats dashboards

### Cybersecurity

- ❓ **(1.0) Major:** WAF + Vault for secrets
- ✅ **(0.5) Minor:** GDPR compliance
- ✅ **(1.0) Major:** 2FA + JWT

### DevOps

- ✅ **(1.0) Major:** Infrastructure setup with log management
- ✅ **(0.5) Minor:** Monitoring system
- ❓**(1.0) Major:** Backend as microservices

### Graphics

- ✅ **(1.0) Major:** Advanced 3D with Babylon.js

### Accessibility

- ❓ **(0.5) Minor:** Cross-device support
- ❓ **(0.5) Minor:** Browser compatibility
- ✅ **(0.5) Minor:** Multi-language support
- ❓ **(0.5) Minor:** Accessibility features
- ❓ **(0.5) Minor:** Server-Side Rendering (SSR)

### Server-Side Pong

- ✅ **(1.0) Major:** Replace Pong with server-side Pong + API
- ❓ **(1.0) Major:** CLI Pong vs Web API users

**✅ Confirmed Score: 9.5**  
**➕ Optional modules can push higher.**

---

## 🛠 Development Workflow

### 1. Backend (Juso || Juri)

- Set up Fastify with SQLite (`better-sqlite3`, `umzug`)
- Define database models (Users, Games, GamePlayers, Friends)
- Implement REST API endpoints (users, games, friends)
- Add authentication (JWT, Google Sign-In, 2FA)

### 2. Frontend (Matias)

- Build UI for signup, login, dashboard, friends
- Connect frontend to REST API
- Add WebSocket integration (chat + game updates)

### 3. Game Logic (Niklas)

- Implement server-side Pong engine
- Handle game state & physics server-side
- Send state updates to clients via WebSockets
- Babylon.js 3D rendering for gameplay

### 4. WebSockets (Juso || Juri)

- Build matchmaking system
- Implement real-time chat
- Sync with game server

### 5. DevOps (Leo)

- Dockerize backend, frontend, database, game server
- Add monitoring & log management
- Setup CI/CD pipelines for deployment
