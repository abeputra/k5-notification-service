const express = require('express');
const router = express.Router();
const { generateContract } = require('../services/pdfService');
const pool = require('../config/db');

// POST /api/pdf/contract — generate kontrak PDF dan download langsung
router.post('/contract', async (req, res) => {
  const { project, user, members } = req.body;

  if (!project || !user) {
    return res.status(400).json({ error: 'Field project dan user wajib diisi' });
  }

  try {
    const { buffer, filename } = await generateContract({ project, user, members: members || [] });

    // Simpan log ke DB
    try {
      await pool.query(
        `INSERT INTO pdf_contracts (project_id, user_id, filename, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [project.id || 'unknown', user.id || 'unknown', filename]
      );
    } catch (dbErr) {
      console.warn('[PDF] Gagal simpan log ke DB (non-fatal):', dbErr.message);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('[PDF] Gagal generate:', err.message);
    res.status(500).json({ error: 'Gagal generate PDF', detail: err.message });
  }
});

// GET /api/pdf/contracts — list kontrak yang pernah digenerate
router.get('/contracts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM pdf_contracts ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ contracts: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
