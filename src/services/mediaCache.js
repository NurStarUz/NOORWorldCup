// ═══════════════════════════════════════════════════════════
//  src/services/mediaCache.js
//  Futbolchi va jamoa rasmlarini olish
//  (football-data.org + admin'dan yuklangan rasmlar)
// ═══════════════════════════════════════════════════════════
const fetch = require("node-fetch");
const { getCache, setCache } = require("./cache");
const { getCustomPlayer, getCustomTeam } = require("./db");

const API = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
const KEY = process.env.FOOTBALL_API_KEY;

// ── Futbolchi rasmi ───────────────────────────────────────
async function getPlayerImage(playerId, playerName) {
  const cacheKey = `img:player:${playerId}`;
  const cached   = await getCache(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  // 1. Avval admin'dan qo'shilgan rasmni tekshir
  try {
    const custom = await getCustomPlayer(playerId);
    if (custom?.photo_url) {
      await setCache(cacheKey, custom.photo_url, 3600);
      return custom.photo_url;
    }
  } catch {}

  // 2. football-data.org'dan olish
  try {
    const res = await fetch(`${API}/persons/${playerId}`, {
      headers: { "X-Auth-Token": KEY }
    });
    if (res.ok) {
      const data = await res.json();
      const url  = data.section?.imageUrl || null;
      await setCache(cacheKey, url || "null", 3600);
      return url;
    }
  } catch {}

  await setCache(cacheKey, "null", 600);
  return null;
}

// ── Jamoa rasmi ───────────────────────────────────────────
async function getTeamImage(teamId) {
  if (!teamId) return null;
  const cacheKey = `img:team:${teamId}`;
  const cached   = await getCache(cacheKey);
  if (cached) return cached === "null" ? null : cached;

  try {
    const res = await fetch(`${API}/teams/${teamId}`, {
      headers: { "X-Auth-Token": KEY }
    });
    if (res.ok) {
      const data = await res.json();
      const url  = data.crest || null;
      await setCache(cacheKey, url || "null", 7200);
      return url;
    }
  } catch {}

  await setCache(cacheKey, "null", 600);
  return null;
}

module.exports = { getPlayerImage, getTeamImage };
