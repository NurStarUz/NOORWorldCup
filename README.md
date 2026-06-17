# ⚽ World Cup MiniApp — Backend

Node.js server: Football API proxy, Telegram Bot, Live Monitor, Admin API.

---

## 🚀 Boshlash (Railway — bepul)

### 1. GitHub'ga yuklash
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SIZNING_USERNAME/worldcup-backend
git push -u origin main
```

### 2. Railway'da deploy
1. [railway.app](https://railway.app) → GitHub bilan kirish
2. **New Project** → **Deploy from GitHub repo** → reponi tanlash
3. **Add PostgreSQL** plugin qo'shish (bepul)
4. **Add Redis** plugin qo'shish (bepul)
5. **Variables** bo'limiga quyidagilarni qo'shish:

```
FOOTBALL_API_KEY    = bbb143c3e3834132934ccf14fa9343ea
BOT_TOKEN           = @BotFather'dan olingan token
CHANNEL_ID          = @kanal_username
ADMIN_CHAT_ID       = Sizning Telegram ID (https://t.me/userinfobot)
BOT_USERNAME        = botning username (@ siz)
JWT_SECRET          = kamida 32 belgili tasodifiy matn
ADMIN_PASSWORD      = admin panel paroli
FRONTEND_URL        = https://sizning-miniapp.vercel.app
NODE_ENV            = production
```

> DATABASE_URL va REDIS_URL Railway tomonidan avtomatik qo'shiladi

### 3. Telegram Bot sozlash
1. [@BotFather](https://t.me/BotFather) → `/newbot` → nom va username bering
2. Token'ni oling → `.env` dagi `BOT_TOKEN` ga qo'ying
3. Botni kanalingizga **admin** sifatida qo'shing (post yuborish huquqi bilan)
4. `/setmenubutton` → MiniApp URL'ini belgilang

### 4. MiniApp'ni botga ulash
```
@BotFather → /newapp → botni tanlang →
  Title: World Cup 2026
  Description: Jonli natijalar, statistika, Fantasy WC
  URL: https://sizning-miniapp.vercel.app
```

---

## 📁 Fayl tuzilmasi

```
src/
├── index.js              ← Server
├── routes/
│   ├── football.js       ← API proxy (cache bilan)
│   ├── auth.js           ← Telegram login
│   ├── admin.js          ← Admin API
│   └── fantasy.js        ← Fantasy WC
└── services/
    ├── bot.js            ← Bot xabarlari
    ├── liveMonitor.js    ← Jonli o'yin kuzatuv
    ├── db.js             ← PostgreSQL
    ├── cache.js          ← Redis
    └── mediaCache.js     ← Rasm keshi
```

---

## 🔌 API Endpoints

### Football (ochiq)
| Method | URL | Tavsif |
|--------|-----|--------|
| GET | `/api/football/competitions` | Barcha ligalar |
| GET | `/api/football/competitions/WC/matches` | O'yinlar |
| GET | `/api/football/competitions/WC/standings` | Jadval |
| GET | `/api/football/competitions/WC/scorers` | Snayperlar |
| GET | `/api/football/matches/:id` | O'yin statistikasi |
| GET | `/api/football/persons/:id` | Futbolchi profili |
| GET | `/api/football/teams/:id` | Jamoa |

### Auth
| Method | URL | Tavsif |
|--------|-----|--------|
| POST | `/api/auth/telegram` | MiniApp login |
| GET | `/api/auth/me` | Mening profilim |

### Admin (x-admin-token header kerak)
| Method | URL | Tavsif |
|--------|-----|--------|
| GET | `/api/admin/dashboard` | Statistika |
| GET | `/api/admin/users` | Foydalanuvchilar |
| POST | `/api/admin/player` | Futbolchi tahrirlash |
| POST | `/api/admin/team` | Jamoa tahrirlash |
| POST | `/api/admin/broadcast` | Barcha obunachilarga xabar |
| POST | `/api/admin/channel` | Kanalga xabar |

### Fantasy
| Method | URL | Tavsif |
|--------|-----|--------|
| GET | `/api/fantasy/my-team` | Mening jamoam |
| POST | `/api/fantasy/my-team` | Jamoani saqlash |
| GET | `/api/fantasy/leaderboard` | Reyting |

---

## 🔧 Lokal ishlatish

```bash
npm install
cp .env.example .env
# .env faylini to'ldiring
npm run dev
```

---

## 📢 Telegram kanal xabarlari formati

**Gol xabari:**
```
⚽ GOL!

🇦🇷 Argentina  1 : 0  Fransiya 🇫🇷

👤 Lionel Messi 35'
🅰️ Assist: Angel Di Maria

🏆 FIFA World Cup
⏱ 35' | Guruh A
```

**O'yin boshlanishi:**
```
🏟 O'YIN BOSHLANMOQDA!

🇦🇷 Argentina  VS  Fransiya 🇫🇷

🏆 FIFA World Cup
⏰ Toshkent vaqti: 22:00
```

**Yakunlanishi:**
```
🏁 YAKUNLANDI!

🇦🇷 Argentina  3 : 3  Fransiya 🇫🇷
🎯 Penalti: 4 – 2

🏆 Argentina g'alaba qozondi

Gollar:
⚽ 23' Messi (pen)
⚽ 36' Di Maria
...
```
