// ═══════════════════════════════════════════════════════════
//  src/routes/auth.js  —  Telegram MiniApp Authentication
// ═══════════════════════════════════════════════════════════
const express = require("express");
const crypto  = require("crypto");
const jwt     = require("jsonwebtoken");
const { saveUser, getUser } = require("../services/db");

const router = express.Router();

// ── Telegram initData tekshirish ──────────────────────────
function verifyTelegramData(initData) {
  const params  = new URLSearchParams(initData);
  const hash    = params.get("hash");
  params.delete("hash");

  const sortedStr = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto
    .createHmac("sha256", "WebAppData")
    .update(process.env.BOT_TOKEN)
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(sortedStr)
    .digest("hex");

  return expectedHash === hash;
}

// ── POST /api/auth/telegram ───────────────────────────────
// MiniApp ochilganda frontend shu endpoint'ga initData yuboradi
router.post("/telegram", async (req, res) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: "initData kerak" });
    }

    // Development rejimda tekshirishni o'tkazib yuborish
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && !verifyTelegramData(initData)) {
      return res.status(401).json({ error: "Telegram ma'lumotlari noto'g'ri" });
    }

    // initData'dan user ma'lumotlarini olish
    const params   = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) {
      return res.status(400).json({ error: "User topilmadi" });
    }

    const tgUser = JSON.parse(decodeURIComponent(userJson));
    const userId = tgUser.id.toString();

    // DB'da saqlash yoki yangilash
    const user = await saveUser({
      telegram_id:  userId,
      username:     tgUser.username || null,
      first_name:   tgUser.first_name || "",
      last_name:    tgUser.last_name  || "",
      language_code: tgUser.language_code || "uz",
      photo_url:    tgUser.photo_url || null,
    });

    // JWT token
    const token = jwt.sign(
      { userId, telegramId: userId, username: tgUser.username },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        id:         user.id || userId,
        telegramId: userId,
        username:   tgUser.username,
        firstName:  tgUser.first_name,
        lastName:   tgUser.last_name,
        photoUrl:   tgUser.photo_url,
      }
    });
  } catch (e) {
    console.error("Auth xato:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/auth/me  —  Token orqali profil olish ────────
router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getUser(req.userId);
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Middleware: JWT tekshirish ─────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token kerak" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.userId = decoded.userId;
    req.telegramId = decoded.telegramId;
    next();
  } catch {
    res.status(401).json({ error: "Token noto'g'ri yoki muddati o'tgan" });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
