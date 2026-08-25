const { createProxyMiddleware } = require('http-proxy-middleware');
const CircuitBreaker = require('opossum');

// Configuration for downstream services
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:3002',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
  payment: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005',
};

// Circuit Breaker options
const breakerOptions = {
  timeout: 3000, // If a service takes longer than 3s, trigger a failure
  errorThresholdPercentage: 50, // When 50% of requests fail, trip the circuit
  resetTimeout: 10000 // After 10s, try one request to see if the service is back up
};

// Setup proxies wrapped in circuit breakers
const setupProxies = (app) => {
  Object.keys(services).forEach((serviceName) => {
    const targetUrl = services[serviceName];

    // 1. Define the actual proxy middleware
    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      pathRewrite: {
        [`^/api/${serviceName}`]: '/api', // Rewrite /api/auth -> /api for downstream
      },
      onProxyReq: (proxyReq, req, res) => {
        // Pass the correlation ID downstream
        if (req.correlationId) {
          proxyReq.setHeader('x-request-id', req.correlationId);
        }
      }
    });

    // 2. Wrap the proxy call in a promise so opossum can handle it
    const proxyAction = (req, res, next) => {
      return new Promise((resolve, reject) => {
        proxy(req, res, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    };

    // 3. Create the Circuit Breaker
    const breaker = new CircuitBreaker(proxyAction, breakerOptions);

    breaker.fallback((req, res, next) => {
      return res.status(503).json({
        error: `Service Unavailable: The ${serviceName} service is currently down or overwhelmed. Circuit breaker is open.`
      });
    });

    // 4. Attach the breaker to the express route
    app.use(`/api/${serviceName}`, (req, res, next) => {
      breaker.fire(req, res, next).catch(next);
    });
  });
};

module.exports = setupProxies;
