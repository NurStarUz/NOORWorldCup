// ═══════════════════════════════════════════════════════════
//  src/services/liveMonitor.js
//  Har 30 soniyada jonli o'yinlarni tekshiradi.
//  Yangi gol, boshlanish, yakunlanish → Bot xabar yuboradi.
// ═══════════════════════════════════════════════════════════
const fetch    = require("node-fetch");
const cron     = require("node-cron");
const { sendGoalAlert, sendMatchStart, sendMatchEnd } = require("./bot");

const API = process.env.FOOTBALL_API_URL || "https://api.football-data.org/v4";
const KEY = process.env.FOOTBALL_API_KEY;

// Kuzatiladigan musobaqalar
const WATCH_COMPETITIONS = [
  "WC",   // FIFA World Cup
  "CL",   // Champions League
  "PL",   // Premier League
  "BL1",  // Bundesliga
  "PD",   // La Liga
  "SA",   // Serie A
  "FL1",  // Ligue 1
];

// Holat xotirasi
const state = {
  goals:   {},   // matchId → goalCount
  status:  {},   // matchId → status
  started: new Set(),
  ended:   new Set(),
};

async function fetchLiveMatches(compCode) {
  try {
    const res = await fetch(
      `${API}/competitions/${compCode}/matches?status=LIVE`,
      { headers: { "X-Auth-Token": KEY } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.matches || [];
  } catch (e) {
    console.error(`[monitor] ${compCode} xato:`, e.message);
    return [];
  }
}

async function fetchScheduledSoon(compCode) {
  // Keyingi 30 daqiqada boshlanadiganlari
  try {
    const now   = new Date();
    const after = new Date(now.getTime() - 5  * 60000).toISOString();
    const before= new Date(now.getTime() + 35 * 60000).toISOString();
    const res   = await fetch(
      `${API}/competitions/${compCode}/matches?status=SCHEDULED&dateFrom=${after.slice(0,10)}&dateTo=${before.slice(0,10)}`,
      { headers: { "X-Auth-Token": KEY } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.matches || []).filter(m => {
      const t = new Date(m.utcDate).getTime();
      return t >= now.getTime() - 5*60000 && t <= now.getTime() + 35*60000;
    });
  } catch { return []; }
}

async function checkMatches() {
  for (const comp of WATCH_COMPETITIONS) {
    const [live, soon] = await Promise.all([
      fetchLiveMatches(comp),
      fetchScheduledSoon(comp),
    ]);

    // ── Tez boshlanadigan o'yinlar ──────────────────────
    for (const m of soon) {
      if (!state.started.has(m.id)) {
        state.started.add(m.id);
        await sendMatchStart(m).catch(e => console.error("[bot] start xato:", e.message));
        console.log(`[monitor] 🏁 Boshlanmoqda: ${m.homeTeam?.shortName} vs ${m.awayTeam?.shortName}`);
      }
    }

    // ── Jonli o'yinlar ──────────────────────────────────
    for (const m of live) {
      const id     = m.id;
      const goals  = (m.goals || []).length;
      const prevG  = state.goals[id];
      const prevS  = state.status[id];

      // Yangi gol?
      if (prevG !== undefined && goals > prevG) {
        const newGoals = (m.goals || []).slice(prevG);
        for (const goal of newGoals) {
          await sendGoalAlert(m, goal).catch(e => console.error("[bot] goal xato:", e.message));
          console.log(`[monitor] ⚽ GOL: ${goal.scorer?.name} ${goal.minute}' | ${m.homeTeam?.shortName} ${m.score?.fullTime?.home}:${m.score?.fullTime?.away} ${m.awayTeam?.shortName}`);
        }
      }

      state.goals[id]  = goals;
      state.status[id] = m.status;
    }

    // ── Yakunlangan o'yinlarni aniqlash ─────────────────
    for (const [id, prevStatus] of Object.entries(state.status)) {
      if (prevStatus === "IN_PLAY" || prevStatus === "PAUSED") {
        const stillLive = live.find(m => m.id === parseInt(id));
        if (!stillLive && !state.ended.has(parseInt(id))) {
          // O'yin tugagan — to'liq ma'lumotni olish
          try {
            const res = await fetch(`${API}/matches/${id}`, {
              headers: { "X-Auth-Token": KEY }
            });
            if (res.ok) {
              const match = await res.json();
              if (match.status === "FINISHED") {
                state.ended.add(parseInt(id));
                await sendMatchEnd(match).catch(e => console.error("[bot] end xato:", e.message));
                console.log(`[monitor] 🏁 Yakunlandi: ${match.homeTeam?.shortName} ${match.score?.fullTime?.home}:${match.score?.fullTime?.away} ${match.awayTeam?.shortName}`);
              }
            }
          } catch {}
        }
      }
    }
  }
}

function startLiveMonitor() {
  console.log("📡 Live monitor ishga tushdi (har 30 soniyada)");

  // Darhol bir tekshirib ko'rish
  checkMatches().catch(console.error);

  // Har 30 soniyada
  cron.schedule("*/30 * * * * *", () => {
    checkMatches().catch(console.error);
  });

  // Eski state'ni har kechasi tozalash
  cron.schedule("0 0 * * *", () => {
    state.started.clear();
    state.ended.clear();
    Object.keys(state.goals).forEach(k => delete state.goals[k]);
    Object.keys(state.status).forEach(k => delete state.status[k]);
    console.log("[monitor] State tozalandi");
  });
}

module.exports = { startLiveMonitor };
