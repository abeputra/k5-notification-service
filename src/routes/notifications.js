const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// GET semua log notifikasi
router.get('/', async (req, res) => {
  try {
    const { type, user_email, limit = 100 } = req.query;
    let q = 'SELECT * FROM notifications_log';
    const params = [];
    const conds = [];
    if (type) { conds.push(`type = $${params.length + 1}`); params.push(type); }
    if (user_email) { conds.push(`user_email = $${params.length + 1}`); params.push(user_email); }
    if (conds.length) q += ' WHERE ' + conds.join(' AND ');
    q += ` ORDER BY sent_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const { rows } = await pool.query(q, params);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET notifikasi per email
router.get('/user/:email', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications_log WHERE user_email=$1 ORDER BY sent_at DESC LIMIT 50`,
      [req.params.email]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET stats
router.get('/stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT type, status, COUNT(*) as count
      FROM notifications_log GROUP BY type, status ORDER BY type, status
    `);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
