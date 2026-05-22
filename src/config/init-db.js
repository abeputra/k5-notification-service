const { pool } = require('./db');

async function initDB() {
  const client = await pool.connect();
  try {
    console.log('🔧 Inisialisasi tabel kelompok 5...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users_cache (
        id SERIAL PRIMARY KEY,
        external_user_id VARCHAR(255) UNIQUE,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        skills TEXT[],
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        external_project_id VARCHAR(255),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        required_skills TEXT[],
        budget VARCHAR(100),
        client_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_ext_id
      ON projects(external_project_id)
      WHERE external_project_id IS NOT NULL
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users_cache(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'accepted',
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(project_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_email VARCHAR(255),
        type VARCHAR(100) NOT NULL,
        subject VARCHAR(500),
        status VARCHAR(50) DEFAULT 'logged',
        project_id INTEGER,
        metadata TEXT,
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pdf_contracts (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        user_id INTEGER,
        filename VARCHAR(500),
        local_path VARCHAR(500),
        generated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users_cache(id) ON DELETE SET NULL,
        title VARCHAR(500),
        content TEXT,
        type VARCHAR(50) DEFAULT 'general',
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Semua tabel kelompok 5 siap');
  } finally {
    client.release();
  }
}

module.exports = { initDB };
