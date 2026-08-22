require('dotenv').config();
const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
app.use(express.json());
app.use(passport.initialize());

// Passport Google Strategy setup
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'DUMMY_CLIENT_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'DUMMY_CLIENT_SECRET',
    callbackURL: "/api/auth/oauth/google/callback"
  },
  async function(accessToken, refreshToken, profile, cb) {
    try {
      const email = profile.emails[0].value;
      let userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      
      if (userResult.rows.length === 0) {
        // Create user if doesn't exist
        userResult = await db.query(
          'INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id, email, role',
          [email, 'customer']
        );
      }
      return cb(null, userResult.rows[0]);
    } catch (err) {
      return cb(err);
    }
  }
));

app.use('/api/auth', authRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP' });
});

const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Auth service listening on port ${PORT}`);
  });
}

module.exports = app; // export for testing
