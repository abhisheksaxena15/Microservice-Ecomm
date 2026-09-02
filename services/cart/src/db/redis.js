const redis = require('redis');

const redisClient = redis.createClient({
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
  if (process.env.NODE_ENV !== 'test') {
    await redisClient.connect();
    console.log('Cart Service: Connected to Redis');
  }
})();

module.exports = redisClient;
