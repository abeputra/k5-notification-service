const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const { sendAcceptanceEmail } = require('../services/emailService');

const TTL = () => parseInt(process.env.NOTIFY_REDIS_TTL || process.env.REDIS_TTL) || 3600;

// GET pengumuman proyek — di-cache Redis
router.get('/project/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const cacheKey = `k5:announcement:project:${projectId}`;

  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, data: cached, from_cache: true });

    const { rows: [project] } = await pool.query('SELECT * FROM projects WHERE id=$1', [projectId]);
    if (!project) return res.status(404).json({ success: false, error: 'Proyek tidak ditemukan' });

    const { rows: members } = await pool.query(`
      SELECT uc.name, uc.email, pm.status, pm.joined_at
      FROM project_members pm
      JOIN users_cache uc ON pm.user_id = uc.id
      WHERE pm.project_id = $1
    `, [projectId]);

    const { rows: announcements } = await pool.query(
      `SELECT * FROM announcements WHERE project_id=$1 AND is_published=true ORDER BY created_at DESC`,
      [projectId]
    );

    const data = { project, members, announcements };
    await cacheSet(cacheKey, data, TTL());
    res.json({ success: true, data, from_cache: false });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET semua pengumuman
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.*, p.title as project_title
      FROM announcements a
      LEFT JOIN projects p ON a.project_id = p.id
      ORDER BY a.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /accept — trigger email penerimaan (dipanggil dari K2/K3 atau demo)
router.post('/accept', async (req, res) => {
  const { project_id, user_email } = req.body;
  if (!project_id) return res.status(400).json({ success: false, error: 'project_id wajib' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [project] } = await client.query('SELECT * FROM projects WHERE id=$1', [project_id]);
    if (!project) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Proyek tidak ditemukan' }); }

    // Cari user — bisa by email atau ambil user pertama di cache
    let user;
    if (user_email) {
      const { rows } = await client.query('SELECT * FROM users_cache WHERE email=$1', [user_email]);
      user = rows[0];
    }
    if (!user) {
      const { rows } = await client.query('SELECT * FROM users_cache LIMIT 1');
      user = rows[0];
    }
    if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Belum ada user di cache (tunggu event user.registered dari K1)' }); }

    // Tambah ke project_members
    await client.query(`
      INSERT INTO project_members (project_id, user_id, status)
      VALUES ($1, $2, 'accepted')
      ON CONFLICT (project_id, user_id) DO UPDATE SET status='accepted'
    `, [project.id, user.id]);

    // Update status proyek
    await client.query(`UPDATE projects SET status='in_progress', updated_at=NOW() WHERE id=$1`, [project.id]);

    // Buat announcement
    await client.query(`
      INSERT INTO announcements (project_id, user_id, title, content, type)
      VALUES ($1, $2, $3, $4, 'acceptance')
    `, [project.id, user.id, `Selamat datang di proyek "${project.title}"`,
      `${user.name} telah diterima sebagai anggota proyek "${project.title}".`]);

    await client.query('COMMIT');

    // Hapus Redis cache supaya fresh
    await cacheDel(`k5:announcement:project:${project.id}`);

    // Kirim email
    try {
      await sendAcceptanceEmail({ to: user.email, userName: user.name, projectTitle: project.title, projectId: project.id });
      await pool.query(`INSERT INTO notifications_log (user_email, type, subject, status, project_id) VALUES ($1, 'project_accepted', $2, 'sent', $3)`,
        [user.email, `Diterima di proyek: ${project.title}`, project.id]);
    } catch (emailErr) {
      console.error('Email gagal:', emailErr.message);
    }

    res.json({ success: true, message: `Email dikirim ke ${user.email}`, data: { project, user } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

module.exports = router;
