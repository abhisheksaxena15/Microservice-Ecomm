const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const db = require('../db');
const { authenticate, redisClient } = require('../middleware/authenticate');
const passport = require('passport');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

// Validation schemas
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Helper: Generate Tokens
const generateTokens = async (userId, role) => {
  const accessToken = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  
  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const hashedRefreshToken = await bcrypt.hash(rawRefreshToken, 10);
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashedRefreshToken, expiresAt]
  );
  
  return { accessToken, refreshToken: rawRefreshToken };
};

// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = signupSchema.parse(req.body);
    
    // Check if user exists
    const userExists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password (cost 12)
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Insert user
    const newUser = await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
      [email, passwordHash, 'customer']
    );
    
    res.status(201).json({ user: newUser.rows[0] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userResult.rows[0];
    
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const tokens = await generateTokens(user.id, user.role);
    res.json(tokens);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh Token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken, userId } = req.body;
    if (!refreshToken || !userId) {
      return res.status(400).json({ error: 'Missing refresh token or user id' });
    }
    
    // Find active refresh tokens for user
    const tokensResult = await db.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked = FALSE AND expires_at > NOW()',
      [userId]
    );
    
    let matchedToken = null;
    for (const row of tokensResult.rows) {
      const isValid = await bcrypt.compare(refreshToken, row.token_hash);
      if (isValid) {
        matchedToken = row;
        break;
      }
    }
    
    if (!matchedToken) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    // Revoke old token
    await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [matchedToken.id]);
    
    // Get user role
    const userResult = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
    
    // Issue new pair
    const tokens = await generateTokens(userId, userResult.rows[0].role);
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Blacklist current access token in Redis
    const tokenExp = req.user.exp;
    const now = Math.floor(Date.now() / 1000);
    const ttl = tokenExp - now;
    
    if (ttl > 0) {
      await redisClient.setEx(`bl_${req.token}`, ttl, 'true');
    }
    
    // Revoke refresh token in DB if provided
    if (refreshToken) {
      const tokensResult = await db.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked = FALSE',
        [req.user.userId]
      );
      
      for (const row of tokensResult.rows) {
        const isValid = await bcrypt.compare(refreshToken, row.token_hash);
        if (isValid) {
          await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);
          break;
        }
      }
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google OAuth2
router.get('/oauth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/oauth/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
  // Generate tokens for the authenticated user
  const tokens = await generateTokens(req.user.id, req.user.role);
  // In a real app, you might redirect to a frontend with tokens in URL or cookie
  res.json({ message: 'OAuth successful', ...tokens });
});

module.exports = router;
