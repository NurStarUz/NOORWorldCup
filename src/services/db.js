// ═══════════════════════════════════════════════════════════
//  src/services/db.js  —  PostgreSQL + In-Memory fallback
// ═══════════════════════════════════════════════════════════
const { Pool } = require("pg");

let pool;
let inMemory = {
  users: {},         // telegram_id → user
  subscribers: {},   // telegram_id → { comps }
  fantasy: {},       // user_id → fantasy team
  notifications: [], // log
};

async function initDB() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL yo'q");

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  await pool.query("SELECT 1");
  await createTables();
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      telegram_id   TEXT UNIQUE NOT NULL,
      username      TEXT,
      first_name    TEXT,
      last_name     TEXT,
      language_code TEXT DEFAULT 'uz',
      photo_url     TEXT,
      is_subscribed BOOLEAN DEFAULT true,
      subscribed_comps TEXT[] DEFAULT '{"WC"}',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS fantasy_teams (
      id          SERIAL PRIMARY KEY,
      user_id     TEXT NOT NULL,
      name        TEXT DEFAULT 'Mening jamoam',
      players     JSONB DEFAULT '[]',
      total_points INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notification_log (
      id          SERIAL PRIMARY KEY,
      type        TEXT,  -- 'goal' | 'start' | 'end' | 'broadcast'
      match_id    INTEGER,
      recipients  INTEGER DEFAULT 0,
      content     TEXT,
      sent_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS custom_players (
      id          SERIAL PRIMARY KEY,
      api_id      INTEGER,
      name        TEXT,
      team_tla    TEXT,
      position    TEXT,
      photo_url   TEXT,
      injured     BOOLEAN DEFAULT false,
      injury_info TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS custom_teams (
      id          SERIAL PRIMARY KEY,
      api_id      INTEGER,
      tla         TEXT,
      name        TEXT,
      logo_url    TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ── Users ─────────────────────────────────────────────────
async function saveUser(data) {
  if (!pool) {
    inMemory.users[data.telegram_id] = {
      ...data,
      id: data.telegram_id,
      is_subscribed: true,
    };
    return inMemory.users[data.telegram_id];
  }

  const res = await pool.query(`
    INSERT INTO users (telegram_id, username, first_name, last_name, language_code, photo_url)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      photo_url = EXCLUDED.photo_url,
      updated_at = NOW()
    RETURNING *
  `, [data.telegram_id, data.username, data.first_name, data.last_name, data.language_code, data.photo_url]);

  return res.rows[0];
}

async function getUser(userId) {
  if (!pool) return inMemory.users[userId] || null;
  const res = await pool.query("SELECT * FROM users WHERE telegram_id = $1", [userId]);
  return res.rows[0] || null;
}

async function getAllUsers(page = 1, limit = 50) {
  if (!pool) return Object.values(inMemory.users);
  const offset = (page - 1) * limit;
  const res  = await pool.query(
    "SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [limit, offset]
  );
  const count = await pool.query("SELECT COUNT(*) FROM users");
  return { users: res.rows, total: parseInt(count.rows[0].count) };
}

// ── Subscriptions ─────────────────────────────────────────
async function subscribeUser(telegramId, comps = ["WC"]) {
  if (!pool) {
    if (!inMemory.users[telegramId]) inMemory.users[telegramId] = { telegram_id: telegramId };
    inMemory.users[telegramId].is_subscribed = true;
    return;
  }
  await pool.query(`
    INSERT INTO users (telegram_id, is_subscribed, subscribed_comps)
    VALUES ($1, true, $2)
    ON CONFLICT (telegram_id) DO UPDATE SET is_subscribed = true, subscribed_comps = $2, updated_at = NOW()
  `, [telegramId, comps]);
}

async function unsubscribeUser(telegramId) {
  if (!pool) {
    if (inMemory.users[telegramId]) inMemory.users[telegramId].is_subscribed = false;
    return;
  }
  await pool.query(
    "UPDATE users SET is_subscribed = false, updated_at = NOW() WHERE telegram_id = $1",
    [telegramId]
  );
}

async function getAllSubscribers(compCode = null) {
  if (!pool) {
    return Object.values(inMemory.users).filter(u => u.is_subscribed);
  }
  let query = "SELECT telegram_id FROM users WHERE is_subscribed = true";
  const params = [];
  if (compCode) {
    params.push(compCode);
    query += ` AND ($1 = ANY(subscribed_comps) OR 'ALL' = ANY(subscribed_comps))`;
  }
  const res = await pool.query(query, params);
  return res.rows;
}

// ── Fantasy ───────────────────────────────────────────────
async function getFantasyTeam(userId) {
  if (!pool) return inMemory.fantasy[userId] || null;
  const res = await pool.query(
    "SELECT * FROM fantasy_teams WHERE user_id = $1",
    [userId]
  );
  return res.rows[0] || null;
}

async function saveFantasyTeam(userId, name, players) {
  if (!pool) {
    inMemory.fantasy[userId] = { user_id: userId, name, players, total_points: 0 };
    return inMemory.fantasy[userId];
  }
  const res = await pool.query(`
    INSERT INTO fantasy_teams (user_id, name, players)
    VALUES ($1, $2, $3)
    ON CONFLICT DO UPDATE SET name = EXCLUDED.name, players = EXCLUDED.players, updated_at = NOW()
    RETURNING *
  `, [userId, name, JSON.stringify(players)]);
  return res.rows[0];
}

async function getFantasyLeaderboard(limit = 20) {
  if (!pool) {
    return Object.values(inMemory.fantasy)
      .sort((a, b) => b.total_points - a.total_points)
      .slice(0, limit);
  }
  const res = await pool.query(`
    SELECT ft.*, u.username, u.first_name, u.last_name
    FROM fantasy_teams ft
    JOIN users u ON ft.user_id = u.telegram_id
    ORDER BY ft.total_points DESC
    LIMIT $1
  `, [limit]);
  return res.rows;
}

// ── Custom Players/Teams (admin tomonidan) ────────────────
async function getCustomPlayer(apiId) {
  if (!pool) return null;
  const res = await pool.query("SELECT * FROM custom_players WHERE api_id = $1", [apiId]);
  return res.rows[0] || null;
}

async function upsertCustomPlayer(data) {
  if (!pool) return data;
  const res = await pool.query(`
    INSERT INTO custom_players (api_id, name, team_tla, position, photo_url, injured, injury_info)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (api_id) DO UPDATE SET
      photo_url = EXCLUDED.photo_url,
      injured = EXCLUDED.injured,
      injury_info = EXCLUDED.injury_info,
      updated_at = NOW()
    RETURNING *
  `, [data.api_id, data.name, data.team_tla, data.position, data.photo_url, data.injured || false, data.injury_info || null]);
  return res.rows[0];
}

async function upsertCustomTeam(data) {
  if (!pool) return data;
  const res = await pool.query(`
    INSERT INTO custom_teams (api_id, tla, name, logo_url)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (api_id) DO UPDATE SET logo_url = EXCLUDED.logo_url
    RETURNING *
  `, [data.api_id, data.tla, data.name, data.logo_url]);
  return res.rows[0];
}

module.exports = {
  initDB,
  saveUser, getUser, getAllUsers,
  subscribeUser, unsubscribeUser, getAllSubscribers,
  getFantasyTeam, saveFantasyTeam, getFantasyLeaderboard,
  getCustomPlayer, upsertCustomPlayer, upsertCustomTeam,
};
