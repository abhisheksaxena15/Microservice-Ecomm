const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'admin',
  host: process.env.POSTGRES_HOST || 'localhost',
  database: process.env.POSTGRES_DB || 'auth_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: process.env.POSTGRES_PORT || 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
//wrapper - any console here applies to all routes making
//  the routes clean
/*module.exports = {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      console.log("Retrying query...");
      return await pool.query(text, params); // one retry
    }
  }
};*/
//Both are implemented in the db.query() wrapper so all routes get
//  the behavior without duplicating code.