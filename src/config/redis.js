const { createClient } = require('redis');

let redisClient = null;

async function connectRedis() {
  redisClient = createClient({
    socket: {
      host: process.env.NOTIFY_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.NOTIFY_REDIS_PORT || process.env.REDIS_PORT) || 6379,
      reconnectStrategy: (retries) => Math.min(retries * 100, 5000),
    },
    password: process.env.NOTIFY_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
  });

  redisClient.on('error', (err) => console.error('Redis error:', err.message));
  redisClient.on('connect', () => console.log('✅ Redis terhubung'));
  redisClient.on('reconnecting', () => console.log('⚠️  Redis reconnecting...'));

  await redisClient.connect();
  return redisClient;
}

function getRedis() {
  return redisClient;
}

async function cacheGet(key) {
  if (!redisClient) return null;
  try {
    const val = await redisClient.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function cacheSet(key, value, ttl = 3600) {
  if (!redisClient) return;
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (e) { console.error('Redis set error:', e.message); }
}

async function cacheDel(key) {
  if (!redisClient) return;
  try { await redisClient.del(key); } catch { }
}

module.exports = { connectRedis, getRedis, cacheGet, cacheSet, cacheDel };
