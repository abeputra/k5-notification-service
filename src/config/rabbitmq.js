const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

const EXCHANGES = {
  TRACKER: 'tracker.events',
  NOTIFICATION: 'notification.events',
};

let connection = null;
let channel = null;
let reconnectTimeout = null;
let isConnecting = false;

async function connectRabbitMQ() {
  if (isConnecting) return null;
  isConnecting = true;

  try {
    console.log(`🐰 Menghubungkan ke RabbitMQ: ${RABBITMQ_URL}`);
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Assert kedua exchange — idempotent, aman meski kelompok lain sudah assert duluan
    await channel.assertExchange(EXCHANGES.TRACKER, 'topic', { durable: true });
    await channel.assertExchange(EXCHANGES.NOTIFICATION, 'topic', { durable: true });

    console.log('✅ RabbitMQ terhubung ke shared broker');

    connection.on('close', () => {
      console.warn('⚠️  RabbitMQ terputus. Reconnect dalam 5 detik...');
      channel = null;
      connection = null;
      isConnecting = false;
      scheduleReconnect();
    });

    connection.on('error', (err) => {
      console.error('❌ RabbitMQ error:', err.message);
    });

    isConnecting = false;
    return channel;
  } catch (err) {
    console.error('❌ Gagal konek RabbitMQ:', err.message);
    isConnecting = false;
    scheduleReconnect();
    return null;
  }
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    await connectRabbitMQ();
  }, 5000);
}

function getChannel() { return channel; }

module.exports = { connectRabbitMQ, getChannel, EXCHANGES };
