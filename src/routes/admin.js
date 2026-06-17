// ═══════════════════════════════════════════════════════════
//  src/routes/admin.js  —  Admin Panel API
// ═══════════════════════════════════════════════════════════
const express = require("express");
const crypto  = require("crypto");
const multer  = require("multer");
const fetch   = require("node-fetch");
const {
  getAllUsers, upsertCustomPlayer, upsertCustomTeam,
  getFantasyLeaderboard
} = require("../services/db");
const { sendBroadcast, sendToChannel } = require("../services/bot");
const { deleteCache } = require("../services/cache");

const router  = express.Router();
const upload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Admin Auth Middleware ─────────────────────────────────
function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  const expected = crypto
    .createHash("sha256")
    .update(process.env.ADMIN_PASSWORD || "admin123")
    .digest("hex");

  if (token !== expected && token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Admin token noto'g'ri" });
  }
  next();
}

router.use(adminAuth);

// ── Dashboard statistikasi ────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const { users, total } = await getAllUsers(1, 1);
    const leaderboard = await getFantasyLeaderboard(5);
    res.json({
      totalUsers: total,
      topFantasy: leaderboard,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Foydalanuvchilar ──────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const data  = await getAllUsers(page, limit);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Futbolchi tahrirlash (rasm, jaroat, pozitsiya) ────────
router.post("/player", upload.single("photo"), async (req, res) => {
  try {
    const { api_id, name, team_tla, position, injured, injury_info } = req.body;
    let photo_url = req.body.photo_url || null;

    // Rasm yuklangan bo'lsa Cloudinary'ga jo'natish
    if (req.file) {
      photo_url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, `players/${api_id}`);
    }

    const player = await upsertCustomPlayer({
      api_id: parseInt(api_id),
      name, team_tla, position, photo_url,
      injured: injured === "true" || injured === true,
      injury_info: injury_info || null,
    });

    // Cache'ni tozalash
    await deleteCache(`img:player:${api_id}`);
    await deleteCache(`football:/persons/${api_id}`);

    res.json({ ok: true, player });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Jamoa tahrirlash ──────────────────────────────────────
router.post("/team", upload.single("logo"), async (req, res) => {
  try {
    const { api_id, tla, name } = req.body;
    let logo_url = req.body.logo_url || null;

    if (req.file) {
      logo_url = await uploadToCloudinary(req.file.buffer, req.file.mimetype, `teams/${tla}`);
    }

    const team = await upsertCustomTeam({ api_id: parseInt(api_id), tla, name, logo_url });
    await deleteCache(`img:team:${api_id}`);

    res.json({ ok: true, team });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Broadcast xabar ───────────────────────────────────────
router.post("/broadcast", async (req, res) => {
  try {
    const { text, image_url } = req.body;
    if (!text) return res.status(400).json({ error: "Matn kerak" });

    const result = await sendBroadcast(text, image_url || null);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Kanalga xabar yuborish ────────────────────────────────
router.post("/channel", async (req, res) => {
  try {
    const { text, image_url } = req.body;
    if (!text) return res.status(400).json({ error: "Matn kerak" });

    await sendToChannel(text, image_url || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cache tozalash ────────────────────────────────────────
router.post("/clear-cache", async (req, res) => {
  try {
    const { key } = req.body;
    if (key) {
      await deleteCache(key);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fantasy leaderboard ───────────────────────────────────
router.get("/fantasy/leaderboard", async (req, res) => {
  try {
    const data = await getFantasyLeaderboard(50);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cloudinary yuklash ────────────────────────────────────
async function uploadToCloudinary(buffer, mimetype, publicId) {
  const cloud  = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud || !apiKey || !secret) {
    throw new Error("Cloudinary sozlanmagan");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${secret}`)
    .digest("hex");

  const form = new (require("form-data"))();
  form.append("file", buffer, { contentType: mimetype, filename: "upload" });
  form.append("public_id",  publicId);
  form.append("timestamp",  timestamp.toString());
  form.append("api_key",    apiKey);
  form.append("signature",  signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Cloudinary xato");
  return data.secure_url;
}

module.exports = router;
