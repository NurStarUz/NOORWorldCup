// ═══════════════════════════════════════════════════════════
//  src/services/bot.js
//  Telegram Bot — kanal va shaxsiy xabarlar
//  Gol, o'yin boshlanishi, yakunlanishi
// ═══════════════════════════════════════════════════════════
const TelegramBot = require("node-telegram-bot-api");
const fetch       = require("node-fetch");
const { getPlayerImage, getTeamImage } = require("./mediaCache");
const { getAllSubscribers } = require("./db");

const BOT_TOKEN  = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

let bot;
try {
  if (BOT_TOKEN && BOT_TOKEN !== "YOUR_BOT_TOKEN_FROM_BOTFATHER") {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
    setupBotCommands();
    console.log("✅ Telegram Bot tayyor");
  } else {
    console.warn("⚠️  BOT_TOKEN yo'q — Telegram funksiyalari o'chirilgan");
  }
} catch (e) {
  console.error("Bot yaratishda xato:", e.message);
}

// ── Emoji va bayroqlar ────────────────────────────────────
const FLAGS = {
  QAT:"🇶🇦",ECU:"🇪🇨",SEN:"🇸🇳",NED:"🇳🇱",ENG:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",USA:"🇺🇸",IRN:"🇮🇷",
  WAL:"🏴󠁧󠁢󠁷󠁬󠁳󠁿",ARG:"🇦🇷",POL:"🇵🇱",MEX:"🇲🇽",SAU:"🇸🇦",FRA:"🇫🇷",AUS:"🇦🇺",
  TUN:"🇹🇳",DEN:"🇩🇰",ESP:"🇪🇸",GER:"🇩🇪",BEL:"🇧🇪",POR:"🇵🇹",BRA:"🇧🇷",
  URU:"🇺🇾",KOR:"🇰🇷",GHA:"🇬🇭",CAM:"🇨🇲",SUI:"🇨🇭",SRB:"🇷🇸",MAR:"🇲🇦",
  CRO:"🇭🇷",CAN:"🇨🇦",JPN:"🇯🇵",CRC:"🇨🇷",RSA:"🇿🇦",MOR:"🇲🇦",
};
const flag = tla => FLAGS[tla] || "🏳️";

const shortName = t => t?.shortName || t?.name || "—";

function scoreStr(m) {
  const hg = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? "?";
  const ag = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? "?";
  return `${hg} : ${ag}`;
}

// ── Xabar yuborish (rasmli yoki rasmsiz) ─────────────────
async function sendToChannel(text, imageUrl = null, options = {}) {
  if (!bot || !CHANNEL_ID) return;

  const opts = {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...options,
  };

  try {
    if (imageUrl) {
      await bot.sendPhoto(CHANNEL_ID, imageUrl, { caption: text, parse_mode: "HTML", ...options });
    } else {
      await bot.sendMessage(CHANNEL_ID, text, opts);
    }
  } catch (e) {
    console.error("[bot] kanal xato:", e.message);
    // Fallback: rasmsiz yuborish
    if (imageUrl) {
      await bot.sendMessage(CHANNEL_ID, text, opts).catch(() => {});
    }
  }
}

async function sendToUser(chatId, text, imageUrl = null, options = {}) {
  if (!bot) return;
  try {
    if (imageUrl) {
      await bot.sendPhoto(chatId, imageUrl, { caption: text, parse_mode: "HTML", ...options });
    } else {
      await bot.sendMessage(chatId, text, { parse_mode: "HTML", ...options });
    }
  } catch (e) {
    console.error(`[bot] user ${chatId} xato:`, e.message);
  }
}

// ── GOL XABARI ────────────────────────────────────────────
async function sendGoalAlert(match, goal) {
  const scorer   = goal.scorer?.name || "Noma'lum";
  const scorerShort = scorer.split(" ").slice(-1)[0];
  const assist   = goal.assist?.name;
  const minute   = goal.minute + (goal.extraTime ? `+${goal.extraTime}` : "");
  const teamTla  = goal.team?.tla;
  const hTeam    = shortName(match.homeTeam);
  const aTeam    = shortName(match.awayTeam);
  const hFlag    = flag(match.homeTeam?.tla);
  const aFlag    = flag(match.awayTeam?.tla);
  const score    = scoreStr(match);
  const isPen    = goal.type === "PENALTY";
  const isOG     = goal.type === "OWN_GOAL";
  const goalEmoji = isOG ? "🥅" : "⚽";

  const text =
`${goalEmoji} <b>GOL!</b> ${isPen ? "(penalti)" : isOG ? "(o'z g'oli)" : ""}

${hFlag} <b>${hTeam}</b>  ${score}  <b>${aTeam}</b> ${aFlag}

👤 <b>${scorer}</b> ${minute}'${assist ? `\n🅰️ Assist: ${assist}` : ""}

🏆 ${match.competition?.name || "FIFA World Cup"}
⏱ ${match.minute || minute}' | ${match.stage?.type || match.group || ""}

#WorldCup2026 #Gol #${teamTla || "Goal"}`;

  // Futbolchi rasmi
  const scorerId = goal.scorer?.id;
  const imageUrl = scorerId
    ? await getPlayerImage(scorerId, scorer).catch(() => null)
    : await getTeamImage(goal.team?.id).catch(() => null);

  // Inline keyboard — miniappdagi o'yinni ochish
  const keyboard = {
    inline_keyboard: [[{
      text: "⚽ To'liq statistika",
      url: `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?startapp=match_${match.id}`,
    }]]
  };

  await sendToChannel(text, imageUrl, { reply_markup: keyboard });

  // Obunachilarga ham yuborish
  await notifySubscribers(text, imageUrl, match, keyboard);
}

// ── O'YIN BOSHLANISHI ─────────────────────────────────────
async function sendMatchStart(match) {
  const hTeam = shortName(match.homeTeam);
  const aTeam = shortName(match.awayTeam);
  const hFlag = flag(match.homeTeam?.tla);
  const aFlag = flag(match.awayTeam?.tla);
  const utc   = new Date(match.utcDate);
  const time  = utc.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });

  const text =
`🏟 <b>O'YIN BOSHLANMOQDA!</b>

${hFlag} <b>${hTeam}</b>  VS  <b>${aTeam}</b> ${aFlag}

🏆 ${match.competition?.name || "FIFA World Cup"}
⏰ Toshkent vaqti: ${time}
📍 ${match.venue || "Stadion"}

#WorldCup2026 #Live`;

  const teamImageUrl = await getTeamImage(match.homeTeam?.id).catch(() => null);
  const keyboard = {
    inline_keyboard: [[{
      text: "🔴 Jonli kuzatish",
      url: `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?startapp=match_${match.id}`,
    }]]
  };

  await sendToChannel(text, teamImageUrl, { reply_markup: keyboard });
}

// ── O'YIN YAKUNLANDI ─────────────────────────────────────
async function sendMatchEnd(match) {
  const hTeam = shortName(match.homeTeam);
  const aTeam = shortName(match.awayTeam);
  const hFlag = flag(match.homeTeam?.tla);
  const aFlag = flag(match.awayTeam?.tla);
  const hg    = match.score?.fullTime?.home ?? 0;
  const ag    = match.score?.fullTime?.away ?? 0;

  let winner = "🤝 Durang";
  let winnerEmoji = "🟡";
  if (hg > ag) { winner = `🏆 ${hTeam} g'alaba qozondi`; winnerEmoji = "🟢"; }
  else if (ag > hg) { winner = `🏆 ${aTeam} g'alaba qozondi`; winnerEmoji = "🟢"; }

  // Golchilar
  const goals = (match.goals || [])
    .map(g => `⚽ ${g.minute}' ${g.scorer?.name?.split(" ").slice(-1)[0] || ""} (${g.team?.shortName || ""})`)
    .join("\n");

  const penStr = match.score?.penalties
    ? `\n🎯 Penalti: ${match.score.penalties.home} – ${match.score.penalties.away}`
    : "";

  const text =
`🏁 <b>YAKUNLANDI!</b>

${hFlag} <b>${hTeam}  ${hg} : ${ag}  ${aTeam}</b> ${aFlag}${penStr}

${winnerEmoji} ${winner}

${goals ? `<b>Gollar:</b>\n${goals}\n` : ""}
🏆 ${match.competition?.name || "FIFA World Cup"}
📊 ${match.stage?.type || match.group || ""}

#WorldCup2026 #FT #Natija`;

  const keyboard = {
    inline_keyboard: [[{
      text: "📊 To'liq statistika",
      url: `https://t.me/${process.env.BOT_USERNAME || "your_bot"}?startapp=match_${match.id}`,
    }]]
  };

  await sendToChannel(text, null, { reply_markup: keyboard });
  await notifySubscribers(text, null, match, keyboard);
}

// ── OBUNACHILARGA YUBORISH ────────────────────────────────
async function notifySubscribers(text, imageUrl, match, keyboard) {
  try {
    const subscribers = await getAllSubscribers(match.competition?.code);
    const chunks = [];
    for (let i = 0; i < subscribers.length; i += 30) {
      chunks.push(subscribers.slice(i, i + 30));
    }
    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(sub => sendToUser(sub.telegram_id, text, imageUrl, { reply_markup: keyboard }))
      );
      // Rate limit uchun kutish
      if (chunks.length > 1) await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {
    console.error("[bot] subscribers xato:", e.message);
  }
}

// ── BOT BUYRUQLARI ────────────────────────────────────────
function setupBotCommands() {
  if (!bot) return;

  bot.setMyCommands([
    { command: "start",       description: "Botni ishga tushirish" },
    { command: "subscribe",   description: "Bildirishnomaga obuna bo'lish" },
    { command: "unsubscribe", description: "Obunani bekor qilish" },
    { command: "live",        description: "Hozirgi jonli o'yinlar" },
    { command: "today",       description: "Bugungi o'yinlar" },
  ]);

  bot.on("polling_error", () => {}); // Polling ishlatilmaydi

  // /start
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId  = msg.chat.id;
    const payload = match?.[1]; // startapp parametri

    const text = payload?.startsWith("match_")
      ? `⚽ O'yin #${payload.replace("match_", "")} — MiniApp'da ko'ring!`
      : `🏆 <b>World Cup 2026</b> botiga xush kelibsiz!\n\n/subscribe — bildirishnomaga obuna bo'ling`;

    const keyboard = {
      inline_keyboard: [[{
        text: "⚽ MiniApp'ni ochish",
        web_app: { url: process.env.FRONTEND_URL || "https://your-miniapp.vercel.app" }
      }]]
    };
    await bot.sendMessage(chatId, text, { parse_mode: "HTML", reply_markup: keyboard });
  });

  // /subscribe
  bot.onText(/\/subscribe/, async (msg) => {
    const chatId = msg.chat.id.toString();
    try {
      const { subscribeUser } = require("./db");
      await subscribeUser(chatId);
      await bot.sendMessage(chatId, "✅ Siz barcha jonli o'yin xabarlariga obuna bo'ldingiz!\n\nGol, boshlanish va yakunlanish xabarlari keladi.", { parse_mode: "HTML" });
    } catch (e) {
      await bot.sendMessage(chatId, "⚠️ Xato yuz berdi, keyinroq urinib ko'ring.");
    }
  });

  // /unsubscribe
  bot.onText(/\/unsubscribe/, async (msg) => {
    const chatId = msg.chat.id.toString();
    try {
      const { unsubscribeUser } = require("./db");
      await unsubscribeUser(chatId);
      await bot.sendMessage(chatId, "❌ Obuna bekor qilindi. Qayta obuna bo'lish uchun /subscribe");
    } catch (e) {
      await bot.sendMessage(chatId, "⚠️ Xato yuz berdi.");
    }
  });

  console.log("✅ Bot buyruqlari sozlandi");
}

// Admin tomonidan qo'lda xabar yuborish
async function sendCustomMessage(chatId, text, imageUrl = null) {
  return sendToUser(chatId, text, imageUrl);
}

async function sendBroadcast(text, imageUrl = null) {
  const subscribers = await getAllSubscribers();
  let sent = 0, failed = 0;
  for (const sub of subscribers) {
    try {
      await sendToUser(sub.telegram_id, text, imageUrl);
      sent++;
      await new Promise(r => setTimeout(r, 50));
    } catch { failed++; }
  }
  return { sent, failed };
}

module.exports = {
  sendGoalAlert,
  sendMatchStart,
  sendMatchEnd,
  sendCustomMessage,
  sendBroadcast,
  sendToChannel,
};
