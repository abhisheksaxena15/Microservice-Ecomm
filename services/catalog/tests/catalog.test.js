const request = require('supertest');
const app = require('../src/index');
const db = require('../src/db');
const { getCached, setCached } = require('../src/cache/redis');

// Mock dependencies
jest.mock('../src/db', () => ({
  query: jest.fn()
}));
jest.mock('../src/cache/redis', () => ({
  getCached: jest.fn(),
  setCached: jest.fn(),
  invalidateCache: jest.fn(),
  redisClient: {
    connect: jest.fn().mockResolvedValue(true)
  }
}));

// We'll mock the auth middleware so we don't need real JWTs in unit tests
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 1, role: req.headers['x-mock-role'] || 'customer' };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
  }
}));

describe('Catalog Service Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/catalog/products/:id', () => {
    it('should return product from cache if available (Cache Hit)', async () => {
      const mockProduct = { id: 1, name: 'Cached Laptop' };
      getCached.mockResolvedValueOnce(mockProduct);

      const res = await request(app).get('/api/catalog/products/1');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.source).toEqual('cache');
      expect(res.body.data).toEqual(mockProduct);
      expect(db.query).not.toHaveBeenCalled(); // Ensure DB wasn't hit
    });

    it('should return product from DB if not in cache (Cache Miss)', async () => {
      const mockProduct = { id: 1, name: 'DB Laptop' };
      getCached.mockResolvedValueOnce(null);
      db.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app).get('/api/catalog/products/1');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.source).toEqual('database');
      expect(res.body.data).toEqual(mockProduct);
      expect(setCached).toHaveBeenCalledWith('product:1', mockProduct, 3600); // Ensure we cached it
    });
  });

  describe('POST /api/catalog/products', () => {
    it('should forbid non-admins', async () => {
      const res = await request(app)
        .post('/api/catalog/products')
        .set('x-mock-role', 'customer')
        .send({ name: 'Test', price: 100 });
      
      expect(res.statusCode).toEqual(403);
    });

    it('should allow admins to create product', async () => {
      const mockProduct = { id: 1, name: 'Admin Laptop', price: 1000 };
      db.query.mockResolvedValueOnce({ rows: [mockProduct] });

      const res = await request(app)
        .post('/api/catalog/products')
        .set('x-mock-role', 'admin')
        .send({ name: 'Admin Laptop', price: 1000 });
      
      expect(res.statusCode).toEqual(201);
      expect(res.body.name).toEqual('Admin Laptop');
    });
  });
});
