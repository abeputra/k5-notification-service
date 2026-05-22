const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.NOTIFY_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.NOTIFY_DB_PORT || process.env.DB_PORT) || 5432,
  database: process.env.NOTIFY_DB_NAME || process.env.DB_NAME || 'notify',
  user: process.env.NOTIFY_DB_USER || process.env.DB_USER || 'notify',
  password: process.env.NOTIFY_DB_PASS || process.env.DB_PASS || 'notify',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function connectDB() {
  const client = await pool.connect();
  const res = await client.query('SELECT NOW()');
  client.release();
  console.log('✅ PostgreSQL terhubung:', res.rows[0].now);
}

module.exports = { pool, connectDB };
