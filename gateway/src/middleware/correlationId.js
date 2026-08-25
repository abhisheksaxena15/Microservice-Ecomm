const { v4: uuidv4 } = require('uuid');

const correlationIdMiddleware = (req, res, next) => {
  // Check if a request ID already exists (e.g., from a load balancer)
  let correlationId = req.headers['x-request-id'];

  if (!correlationId) {
    // Generate a new one if it doesn't exist
    correlationId = uuidv4();
    req.headers['x-request-id'] = correlationId;
  }

  // Attach it to the response headers so the client can trace it too
  res.setHeader('x-request-id', correlationId);

  // We can also attach it to the request object for easy logging later
  req.correlationId = correlationId;

  next();
};

module.exports = correlationIdMiddleware;
