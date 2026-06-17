// ═══════════════════════════════════════════════════════════
//  src/routes/fantasy.js  —  Fantasy World Cup
// ═══════════════════════════════════════════════════════════
const express = require("express");
const { requireAuth } = require("./auth");
const { getFantasyTeam, saveFantasyTeam, getFantasyLeaderboard } = require("../services/db");

const router = express.Router();

const MAX_PLAYERS  = 11;
const MAX_BUDGET   = 100; // million

// ── Mening fantasy jamoam ─────────────────────────────────
router.get("/my-team", requireAuth, async (req, res) => {
  try {
    const team = await getFantasyTeam(req.userId);
    res.json(team || { players: [], total_points: 0, name: "Mening jamoam" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fantasy jamoani saqlash ───────────────────────────────
router.post("/my-team", requireAuth, async (req, res) => {
  try {
    const { name, players } = req.body;

    if (!Array.isArray(players)) {
      return res.status(400).json({ error: "players massiv bo'lishi kerak" });
    }
    if (players.length > MAX_PLAYERS) {
      return res.status(400).json({ error: `Maksimal ${MAX_PLAYERS} ta futbolchi` });
    }

    const totalCost = players.reduce((sum, p) => sum + (p.cost || 0), 0);
    if (totalCost > MAX_BUDGET) {
      return res.status(400).json({ error: `Byudjet oshib ketdi (${totalCost}M > ${MAX_BUDGET}M)` });
    }

    const saved = await saveFantasyTeam(req.userId, name || "Mening jamoam", players);
    res.json({ ok: true, team: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fantasy reyting ───────────────────────────────────────
router.get("/leaderboard", async (req, res) => {
  try {
    const data = await getFantasyLeaderboard(20);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Mavjud futbolchilar ro'yxati (football-data'dan) ──────
router.get("/players/:compCode", async (req, res) => {
  try {
    const fetch = require("node-fetch");
    const API   = process.env.FOOTBALL_API_URL;
    const KEY   = process.env.FOOTBALL_API_KEY;

    const r = await fetch(`${API}/competitions/${req.params.compCode}/teams`, {
      headers: { "X-Auth-Token": KEY }
    });
    const data = await r.json();

    // Barcha futbolchilarni to'plash va narx belgilash
    const players = [];
    for (const team of (data.teams || []).slice(0, 32)) {
      for (const p of (team.squad || [])) {
        players.push({
          id:       p.id,
          name:     p.name,
          position: p.position,
          teamId:   team.id,
          teamName: team.shortName || team.name,
          teamTla:  team.tla,
          cost:     estimateCost(p.position),
          nationality: p.nationality,
        });
      }
    }

    res.json({ players, total: players.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pozitsiyaga qarab narx
function estimateCost(position) {
  const costs = {
    Goalkeeper: 5,
    Defence:    6,
    Midfield:   8,
    Offence:    10,
  };
  return costs[position] || 7;
}

module.exports = router;
