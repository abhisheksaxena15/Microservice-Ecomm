const request = require('supertest');
const app = require('../src/index');
const db = require('../src/db');
const { redisClient } = require('../src/middleware/authenticate');

// Mock the DB and Redis for simple unit testing
jest.mock('../src/db', () => ({
  query: jest.fn()
}));
jest.mock('redis', () => ({
  createClient: () => ({
    connect: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
    setEx: jest.fn().mockResolvedValue('OK')
  })
}));

describe('Auth Service Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/signup', () => {
    it('should validate email and password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'invalid-email', password: '123' });
      
      expect(res.statusCode).toEqual(400);
    });

    it('should return 400 if user exists', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Mock user exists

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'test@example.com', password: 'password123' });
      
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toEqual('User already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return 401 for invalid credentials', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // User not found

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });
      
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toEqual('Invalid credentials');
    });
  });
});
