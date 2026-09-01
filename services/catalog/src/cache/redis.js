const redis = require('redis');

const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  if (process.env.NODE_ENV !== 'test') {
    await redisClient.connect();
    console.log('Connected to Redis');
  }
})();

// Cache-Aside Pattern helper functions
const getCached = async (key) => {
  if (process.env.NODE_ENV === 'test') return null;
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis get error', err);
    return null; // Fallback to DB if Redis fails
  }
};

const setCached = async (key, value, ttl = 3600) => {
  if (process.env.NODE_ENV === 'test') return;
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error('Redis set error', err);
  }
};

const invalidateCache = async (key) => {
  if (process.env.NODE_ENV === 'test') return;
  try {
    await redisClient.del(key);
  } catch (err) {
    console.error('Redis del error', err);
  }
};

module.exports = {
  redisClient,
  getCached,
  setCached,
  invalidateCache
};
