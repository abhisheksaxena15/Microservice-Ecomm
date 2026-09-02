const request = require('supertest');
const app = require('../src/index');
const redisClient = require('../src/db/redis');
const { getProduct } = require('../src/services/catalogClient');

// Mock dependencies
jest.mock('../src/db/redis', () => ({
  hGetAll: jest.fn(),
  hGet: jest.fn(),
  hSet: jest.fn(),
  hDel: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  connect: jest.fn().mockResolvedValue(true),
  on: jest.fn()
}));

jest.mock('../src/services/catalogClient', () => ({
  getProduct: jest.fn()
}));

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { userId: 1, role: 'customer' };
    next();
  }
}));

describe('Cart Service Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/cart', () => {
    it('should return empty cart if no items in Redis', async () => {
      redisClient.hGetAll.mockResolvedValueOnce({});
      
      const res = await request(app).get('/api/cart');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toEqual(0);
    });

    it('should hydrate cart items with catalog data', async () => {
      // Mock Redis cart: { '101': '2' }  -> Product 101, Quantity 2
      redisClient.hGetAll.mockResolvedValueOnce({ '101': '2' });
      
      // Mock Catalog Service returning price $50
      getProduct.mockResolvedValueOnce({ id: 101, name: 'Test Product', price: 50 });

      const res = await request(app).get('/api/cart');
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.items.length).toEqual(1);
      expect(res.body.items[0].product.name).toEqual('Test Product');
      expect(res.body.items[0].quantity).toEqual(2);
      expect(res.body.items[0].itemTotal).toEqual(100); // 50 * 2
      expect(res.body.total).toEqual(100);
    });
  });

  describe('POST /api/cart/items', () => {
    it('should prevent adding product if catalog service says unavailable', async () => {
      getProduct.mockResolvedValueOnce({ unavailable: true });
      
      const res = await request(app)
        .post('/api/cart/items')
        .send({ productId: 999, quantity: 1 });
        
      expect(res.statusCode).toEqual(404);
      expect(res.body.error).toContain('unavailable');
    });

    it('should add item to redis if catalog resolves', async () => {
      getProduct.mockResolvedValueOnce({ id: 101, name: 'Valid Product' });
      redisClient.hGet.mockResolvedValueOnce(null); // Not in cart currently
      
      const res = await request(app)
        .post('/api/cart/items')
        .send({ productId: 101, quantity: 2 });
        
      expect(res.statusCode).toEqual(201);
      expect(redisClient.hSet).toHaveBeenCalledWith('cart:1', '101', '2');
    });
  });
});
