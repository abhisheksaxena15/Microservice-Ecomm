require('dotenv').config();
const express = require('express');
const correlationIdMiddleware = require('./middleware/correlationId');
const rateLimiter = require('./middleware/rateLimiter');
const setupProxies = require('./routes/proxy');

const app = express();

// 1. Generate and log Correlation IDs for every request
app.use(correlationIdMiddleware);

// 2. Apply Redis Rate Limiting to prevent abuse
app.use(rateLimiter);

// 3. Optional: Global request logging
app.use((req, res, next) => {
  console.log(`[Gateway] [${req.correlationId}] ${req.method} ${req.url}`);
  next();
});
// 4. Setup Microservice Proxies with Circuit Breakers
setupProxies(app);

// 5. Health Check for Gateway itself
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'API Gateway' });
});

// 6. Global Error Handler
app.use((err, req, res, next) => {
  console.error(`[Gateway Error] [${req.correlationId}]`, err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal Gateway Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
