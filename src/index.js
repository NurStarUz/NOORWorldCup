// ═══════════════════════════════════════════════════════════
//  src/index.js  —  World Cup Backend Entry Point
// ═══════════════════════════════════════════════════════════
require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");

const footballRouter = require("./routes/football");
const authRouter     = require("./routes/auth");
const adminRouter    = require("./routes/admin");
const fantasyRouter  = require("./routes/fantasy");
const { startLiveMonitor } = require("./services/liveMonitor");
const { initDB }           = require("./services/db");
const { initRedis }        = require("./services/cache");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "*",
    "https://web.telegram.org",
    /\.telegram\.org$/
  ],
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Static: admin panel files
app.use("/admin", express.static(path.join(__dirname, "../admin-ui")));

// ── Routes ────────────────────────────────────────────────
app.use("/api/football", footballRouter);
app.use("/api/auth",     authRouter);
app.use("/api/admin",    adminRouter);
app.use("/api/fantasy",  fantasyRouter);

// Health check
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────
async function main() {
  try {
    await initDB();
    console.log("✅ PostgreSQL ulanildi");
  } catch (e) {
    console.warn("⚠️  PostgreSQL yo'q, in-memory rejimda:", e.message);
  }

  try {
    await initRedis();
    console.log("✅ Redis ulanildi");
  } catch (e) {
    console.warn("⚠️  Redis yo'q, cache o'chirilgan:", e.message);
  }

  app.listen(PORT, () => {
    console.log(`\n⚽ World Cup Backend ishga tushdi`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`   Admin: http://localhost:${PORT}/admin`);
  });

  // Live match monitor — 30 soniyada bir tekshiradi
  startLiveMonitor();
}

main().catch(console.error);
