const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { sendSkillMatchEmail } = require('../services/emailService');

// GET semua project cache
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET by id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Proyek tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST — register proyek baru + trigger skill-match alert
// Dipanggil dari dashboard GUI atau dari K2 via HTTP
router.post('/', async (req, res) => {
  const { title, description, required_skills, budget, client_name, external_project_id } = req.body;

  if (!title || !Array.isArray(required_skills) || !required_skills.length) {
    return res.status(400).json({ success: false, error: 'title dan required_skills[] wajib diisi' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [project] } = await client.query(`
      INSERT INTO projects (title, description, required_skills, budget, client_name, external_project_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (external_project_id) DO UPDATE
        SET title=$1, description=$2, required_skills=$3, budget=$4, client_name=$5, updated_at=NOW()
      RETURNING *
    `, [title, description || null, required_skills, budget || null, client_name || null, external_project_id || null]);

    await client.query('COMMIT');

    // Skill-match: cari user di cache yang cocok
    const { rows: users } = await pool.query(`SELECT * FROM users_cache WHERE is_active=true`);
    const notified = [], failed = [];

    for (const user of users) {
      const userSkills = (user.skills || []).map(s => s.toLowerCase().trim());
      const reqNorm = required_skills.map(s => s.toLowerCase().trim());
      const matched = (user.skills || []).filter(s =>
        reqNorm.some(r => r.includes(s.toLowerCase().trim()) || s.toLowerCase().trim().includes(r))
      );

      if (matched.length >= 1 && user.email) {
        try {
          await sendSkillMatchEmail({ to: user.email, userName: user.name || user.email, projectTitle: project.title, projectId: project.id, matchedSkills: matched });
          await pool.query(`
            INSERT INTO notifications_log (user_id, user_email, type, subject, status, project_id, metadata, sent_at)
            VALUES ($1, $2, 'skill_match', $3, 'sent', $4, $5, NOW())
          `, [user.id, user.email, `Proyek cocok: ${project.title}`, project.id, JSON.stringify({ matchedSkills: matched })]);
          notified.push({ name: user.name, email: user.email, matchedSkills: matched });
        } catch (e) {
          console.error(`Email ke ${user.email} gagal:`, e.message);
          failed.push({ email: user.email, error: e.message });
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Proyek dicache, skill-match alert terkirim',
      data: project,
      notification_summary: {
        total_talent_checked: users.length,
        notified: notified.length,
        failed: failed.length,
        notified_users: notified,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
