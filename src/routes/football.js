// ═══════════════════════════════════════════════════════════
//  src/routes/football.js  —  Football-data.org Proxy + Cache
// ═══════════════════════════════════════════════════════════
const express = require("express");
const fetch   = require("node-fetch");
const { getCache, setCache } = require("../services/cache");

const router = express.Router();
const API    = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
const KEY    = process.env.FOOTBALL_API_KEY;

// Cache TTL (soniyada)
const TTL = {
  competitions: 3600,   // 1 soat
  standings:    300,    // 5 daqiqa
  matches:      60,     // 1 daqiqa
  scorers:      300,
  match:        30,     // bitta o'yin
  person:       600,    // futbolchi profili
  team:         600,
};

async function footballFetch(path, nocache = false) {
  const cacheKey = `football:${path}`;
  
  if (!nocache) {
    const cached = await getCache(cacheKey);
    if (cached) return JSON.parse(cached);
  }

  const res = await fetch(`${API}${path}`, {
    headers: { "X-Auth-Token": KEY }
  });

  if (!res.ok) {
    const err = await res.text();
    throw { status: res.status, message: err };
  }

  const data = await res.json();

  // TTL aniqlash
  const segment = path.split("/")[1] || "matches";
  const ttl = TTL[segment] || 120;
  await setCache(cacheKey, JSON.stringify(data), ttl);

  return data;
}

// ── Endpoints ─────────────────────────────────────────────

// Barcha musobaqalar
router.get("/competitions", async (req, res) => {
  try {
    const data = await footballFetch("/competitions");
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Bitta musobaqa statistikasi
router.get("/competitions/:code", async (req, res) => {
  try {
    const data = await footballFetch(`/competitions/${req.params.code}`);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// O'yinlar ro'yxati
router.get("/competitions/:code/matches", async (req, res) => {
  try {
    const q = new URLSearchParams(req.query).toString();
    const nocache = req.query.status === "LIVE";
    const data = await footballFetch(
      `/competitions/${req.params.code}/matches${q ? "?" + q : ""}`,
      nocache
    );
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Guruh jadvali
router.get("/competitions/:code/standings", async (req, res) => {
  try {
    const data = await footballFetch(`/competitions/${req.params.code}/standings`);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Top snayperlar + assistlar
router.get("/competitions/:code/scorers", async (req, res) => {
  try {
    const limit = req.query.limit || 20;
    const data  = await footballFetch(`/competitions/${req.params.code}/scorers?limit=${limit}`);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Bitta o'yin to'liq statistika (gol, karta, tarkib, almashuvlar)
router.get("/matches/:id", async (req, res) => {
  try {
    const data = await footballFetch(`/matches/${req.params.id}`, true);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Futbolchi profili (jaroat, statistika)
router.get("/persons/:id", async (req, res) => {
  try {
    const [person, matches] = await Promise.all([
      footballFetch(`/persons/${req.params.id}`),
      footballFetch(`/persons/${req.params.id}/matches?limit=10`),
    ]);
    res.json({ ...person, recentMatches: matches });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Terma jamoa
router.get("/teams/:id", async (req, res) => {
  try {
    const [team, matches] = await Promise.all([
      footballFetch(`/teams/${req.params.id}`),
      footballFetch(`/teams/${req.params.id}/matches?limit=10`),
    ]);
    res.json({ ...team, recentMatches: matches });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
