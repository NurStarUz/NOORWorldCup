// ═══════════════════════════════════════════════════════════
//  src/services/cache.js  —  Redis + In-Memory fallback
// ═══════════════════════════════════════════════════════════
let client;
const memCache = new Map(); // { key → { value, expires } }

async function initRedis() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL yo'q");
  const { createClient } = require("redis");
  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", () => { client = null; });
  await client.connect();
}

async function getCache(key) {
  if (client) {
    try { return await client.get(key); } catch { client = null; }
  }
  const item = memCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) { memCache.delete(key); return null; }
  return item.value;
}

async function setCache(key, value, ttlSeconds = 60) {
  if (client) {
    try { await client.setEx(key, ttlSeconds, value); return; } catch { client = null; }
  }
  memCache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  if (memCache.size > 500) {
    const firstKey = memCache.keys().next().value;
    memCache.delete(firstKey);
  }
}

async function deleteCache(key) {
  if (client) { try { await client.del(key); } catch {} }
  memCache.delete(key);
}

module.exports = { initRedis, getCache, setCache, deleteCache };
