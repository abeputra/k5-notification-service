const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.NOTIFY_MAIL_HOST || process.env.MAIL_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.NOTIFY_MAIL_PORT || process.env.MAIL_PORT) || 587,
      secure: (process.env.NOTIFY_MAIL_SECURE || process.env.MAIL_SECURE) === 'true',
      auth: {
        user: process.env.NOTIFY_MAIL_USER || process.env.MAIL_USER,
        pass: process.env.NOTIFY_MAIL_PASS || process.env.MAIL_PASS,
      },
    });
  }
  return transporter;
}

const FROM = () => process.env.NOTIFY_MAIL_FROM || process.env.MAIL_FROM || '"Freelance Hub Notify" <apl.kelompoklima@gmail.com>';
const APP_URL = () => process.env.APP_URL || 'http://localhost:8080';

async function sendSkillMatchEmail({ to, userName, projectTitle, projectId, matchedSkills }) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
    <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <div style="background:linear-gradient(135deg,#1a237e,#283593);padding:32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:24px;">🚀 Freelance Hub</h1>
        <p style="color:#c5cae9;margin:8px 0 0;">Notification Service</p>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#1a237e;margin-top:0;">Ada Proyek Baru yang Cocok!</h2>
        <p>Halo <strong>${userName}</strong>,</p>
        <p>Proyek baru yang sesuai skill kamu:</p>
        <div style="background:#e8eaf6;border-left:4px solid #3f51b5;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="color:#1a237e;margin:0 0 8px;">"${projectTitle}"</h3>
          <p style="color:#5c6bc0;margin:0;">Skill cocok: <strong>${matchedSkills.join(', ')}</strong></p>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="${APP_URL()}/pengumuman/${projectId}" style="background:#3f51b5;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
            Lihat Proyek →
          </a>
        </div>
      </div>
      <div style="background:#f5f5f5;padding:16px;text-align:center;">
        <p style="color:#9e9e9e;font-size:12px;margin:0;">© ${new Date().getFullYear()} Freelance Hub • Kelompok 5 - APL TIF215113</p>
      </div>
    </div>
  </body></html>`;

  return getTransporter().sendMail({
    from: FROM(), to,
    subject: `🎯 Proyek "${projectTitle}" Cocok dengan Skill Kamu!`,
    html,
  });
}

async function sendAcceptanceEmail({ to, userName, projectTitle, projectId }) {
  const url = `${APP_URL()}/pengumuman/${projectId}`;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
    <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <div style="background:linear-gradient(135deg,#1b5e20,#2e7d32);padding:32px;text-align:center;">
        <h1 style="color:white;margin:0;font-size:28px;">🎉 Selamat!</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#1b5e20;margin-top:0;">Kamu Diterima di Proyek!</h2>
        <p>Halo <strong>${userName}</strong>,</p>
        <p>Selamat! Kamu diterima sebagai anggota proyek:</p>
        <div style="background:#e8f5e9;border-left:4px solid #4caf50;border-radius:8px;padding:20px;margin:20px 0;">
          <h3 style="color:#1b5e20;margin:0;">"${projectTitle}"</h3>
        </div>
        <div style="text-align:center;margin:32px 0;">
          <a href="${url}" style="background:#4caf50;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
            📋 Lihat Pengumuman & Unduh Kontrak
          </a>
        </div>
        <div style="background:#fff3e0;border-radius:8px;padding:16px;">
          <p style="color:#e65100;margin:0;font-size:14px;"><strong>⚠️</strong> Unduh dan tandatangani kontrak dalam 3x24 jam.</p>
        </div>
      </div>
      <div style="background:#f5f5f5;padding:16px;text-align:center;">
        <p style="color:#9e9e9e;font-size:12px;margin:0;">© ${new Date().getFullYear()} Freelance Hub • Kelompok 5</p>
      </div>
    </div>
  </body></html>`;

  return getTransporter().sendMail({
    from: FROM(), to,
    subject: `🎉 Selamat! Kamu Diterima di Proyek "${projectTitle}"`,
    html,
  });
}

async function sendBidStatusEmail({ to, bidId, projectTitle, status }) {
  const label = { accepted: '✅ Bid Diterima', rejected: '❌ Bid Ditolak', counter: '💬 Counter Offer' }[status?.toLowerCase()] || `📋 Status: ${status}`;
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <h2 style="color:#1a237e;">${label}</h2>
      <p>Update bid Anda untuk proyek <strong>"${projectTitle}"</strong>.</p>
      <p style="color:#555;">Bid ID: <code>${bidId}</code></p>
      <p style="color:#9e9e9e;font-size:12px;">© ${new Date().getFullYear()} Freelance Hub • Kelompok 5</p>
    </div>
  </body></html>`;

  return getTransporter().sendMail({ from: FROM(), to, subject: `${label} — ${projectTitle}`, html });
}

async function sendMilestoneEmail({ to, submissionId, projectTitle, status, paymentAmount }) {
  const ok = status === 'approved';
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
    <div style="background:white;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <h2 style="color:${ok ? '#1b5e20' : '#b71c1c'};">${ok ? '✅ Submission Disetujui' : '❌ Submission Ditolak'}</h2>
      <p>Submission Anda untuk <strong>"${projectTitle}"</strong> telah <strong>${ok ? 'disetujui' : 'ditolak'}</strong>.</p>
      ${ok && paymentAmount ? `<p>💰 Payment: <strong>${paymentAmount}</strong></p>` : ''}
      <p style="color:#555;">Submission ID: <code>${submissionId}</code></p>
      <p style="color:#9e9e9e;font-size:12px;">© ${new Date().getFullYear()} Freelance Hub • Kelompok 5</p>
    </div>
  </body></html>`;

  return getTransporter().sendMail({ from: FROM(), to, subject: `${ok ? '✅ Disetujui' : '❌ Ditolak'} — ${projectTitle}`, html });
}

module.exports = { sendSkillMatchEmail, sendAcceptanceEmail, sendBidStatusEmail, sendMilestoneEmail };
