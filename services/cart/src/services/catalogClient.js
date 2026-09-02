const axios = require('axios');
const CircuitBreaker = require('opossum');

// In a real environment, this URL would be injected via env variables (e.g. http://catalog-service:3002)
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3002';

// The actual HTTP call to the catalog service
const fetchProductDetails = async (productId) => {
  const response = await axios.get(`${CATALOG_SERVICE_URL}/api/catalog/products/${productId}`);
  return response.data.data;
};

// Configure the Circuit Breaker
const breakerOptions = {
  timeout: 3000, // If the catalog service takes longer than 3s, trigger a failure
  errorThresholdPercentage: 50, // When 50% of requests fail, open the circuit
  resetTimeout: 10000 // After 10 seconds, try again (half-open)
};

const catalogCircuitBreaker = new CircuitBreaker(fetchProductDetails, breakerOptions);

catalogCircuitBreaker.on('open', () => console.log('CIRCUIT BREAKER OPEN: Catalog service is down!'));
catalogCircuitBreaker.on('halfOpen', () => console.log('CIRCUIT BREAKER HALF-OPEN: Testing Catalog service...'));
catalogCircuitBreaker.on('close', () => console.log('CIRCUIT BREAKER CLOSED: Catalog service is healthy.'));

// Fallback function when the circuit is open or the request fails
catalogCircuitBreaker.fallback((productId, error) => {
  console.log(`Fallback triggered for product ${productId}. Error: ${error.message}`);
  return {
    id: productId,
    name: 'Product details temporarily unavailable',
    price: 0,
    unavailable: true
  };
});

const getProduct = async (productId) => {
  // We use .fire() to execute the function through the circuit breaker
  return await catalogCircuitBreaker.fire(productId);
};

module.exports = { getProduct };
