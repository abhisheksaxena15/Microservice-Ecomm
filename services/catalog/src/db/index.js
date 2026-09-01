const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'ecommerce_user',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'ecommerce',
  password: process.env.POSTGRES_PASSWORD || 'secretpassword',
  port: process.env.POSTGRES_PORT || 5432,
});

// Initialize database schema
const initDB = async () => {
  try {
    const initSql = fs.readFileSync(path.join(__dirname, 'init.sql')).toString();
    await pool.query(initSql);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

if (process.env.NODE_ENV !== 'test') {
  initDB();
}

module.exports = pool;
