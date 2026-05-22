require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { connectDB } = require('./config/db');
const { connectRedis } = require('./config/redis');
const { initDB } = require('./config/init-db');
const { connectRabbitMQ } = require('./config/rabbitmq');
const { startConsumer } = require('./services/trackerConsumer');

const notificationRoutes = require('./routes/notifications');
const announcementRoutes = require('./routes/announcements');
const pdfRoutes = require('./routes/pdf');
const projectRoutes = require('./routes/projects');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use('/api/notifications', notificationRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/pdf', pdfRoutes);
app.use('/api/projects', projectRoutes);

app.get('/', (req, res) => res.render('dashboard'));
app.get('/pengumuman/:projectId', (req, res) =>
  res.render('announcement', { projectId: req.params.projectId })
);
app.get('/admin', (req, res) => res.render('admin'));

app.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'kelompok5-notify',
  timestamp: new Date(),
  port: PORT,
}));

app.use((req, res) => res.status(404).json({ error: 'Route tidak ditemukan' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

async function start() {
  try {
    await connectDB();
    await initDB();
    await connectRedis();

    // RabbitMQ non-blocking — service tetap jalan walau rabbit belum siap
    connectRabbitMQ().then(async (ch) => {
      if (ch) {
        await startConsumer();
      } else {
        console.warn('⚠️  Consumer tidak aktif — RabbitMQ belum siap, akan retry otomatis');
      }
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 Kelompok 5 — Freelance Hub Notify`);
      console.log(`   Port    : http://0.0.0.0:${PORT}`);
      console.log(`   Health  : http://0.0.0.0:${PORT}/health`);
      console.log(`   GUI     : http://0.0.0.0:${PORT}/`);
      console.log(`   Admin   : http://0.0.0.0:${PORT}/admin`);
    });
  } catch (err) {
    console.error('❌ Gagal start:', err.message);
    process.exit(1);
  }
}

start();
