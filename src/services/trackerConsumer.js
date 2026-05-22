/**
 * Kelompok 5 — RabbitMQ Consumer
 * Mendengarkan event dari K1 (Auth), K2 (Bidding), K3 (Team Matching), K4 (Audit)
 *
 * Referensi routing key sudah disesuaikan dengan dokumentasi resmi tiap kelompok.
 */
const { getChannel, EXCHANGES } = require('../config/rabbitmq');
const { pool } = require('../config/db');
const { sendBidStatusEmail, sendMilestoneEmail, sendSkillMatchEmail, sendAcceptanceEmail } = require('./emailService');

// ============================================================
// BINDINGS — event yang K5 dengarkan
// ============================================================
const BINDINGS = [
  // --- K1: Auth Service (exchange: tracker.events) ---
  { exchange: EXCHANGES.TRACKER, key: 'user.registered' },       // user baru → cache
  { exchange: EXCHANGES.TRACKER, key: 'user.deactivated' },      // user dinonaktifkan → log
  { exchange: EXCHANGES.TRACKER, key: 'project.completed' },     // proyek selesai → log

  // --- K2: Bidding Service (exchange: notification.events) ---
  { exchange: EXCHANGES.NOTIFICATION, key: 'notification.bid.status.updated' },  // bid diterima/ditolak → email
  { exchange: EXCHANGES.NOTIFICATION, key: 'notification.deal.confirmed' },      // deal final → email
  { exchange: EXCHANGES.NOTIFICATION, key: 'notification.counter.offer' },       // counter offer → email

  // --- K3: Team Matching (exchange: tracker.events) ---
  { exchange: EXCHANGES.TRACKER, key: 'tracker.profile.skills.updated' },        // skills update → cek proyek cocok
  { exchange: EXCHANGES.TRACKER, key: 'tracker.team.member.joined' },            // diterima di tim → email
  { exchange: EXCHANGES.TRACKER, key: 'tracker.team.member.removed' },           // dikeluarkan dari tim → log

  // --- K4: Audit/Monitoring (exchange: tracker.events) ---
  { exchange: EXCHANGES.TRACKER, key: 'tracker.milestone.created' },             // milestone baru → log
  { exchange: EXCHANGES.TRACKER, key: 'tracker.milestone.updated' },             // milestone diupdate → log
  { exchange: EXCHANGES.TRACKER, key: 'tracker.submission.posted' },             // submission masuk → log
  { exchange: EXCHANGES.TRACKER, key: 'tracker.submission.approved' },           // disetujui → email payment
  { exchange: EXCHANGES.TRACKER, key: 'tracker.submission.rejected' },           // ditolak → email
  { exchange: EXCHANGES.TRACKER, key: 'tracker.submission.needs_revision' },     // revisi → email
];

// ============================================================
// HANDLER UTAMA
// ============================================================
async function handleEvent(routingKey, payload) {
  const ts = new Date().toISOString();
  console.log(`\n[${ts}] 📩 EVENT: ${routingKey}`);
  console.log(`   Payload: ${JSON.stringify(payload).substring(0, 200)}`);

  try {

    // ── K1: USER BARU TERDAFTAR ──────────────────────────────
    if (routingKey === 'user.registered') {
      // Payload K1: { userId, payload: { email, name/full_name, role, skills? } }
      const { userId, payload: data } = payload;
      const email = data?.email;
      const name = data?.name || data?.full_name;
      const skills = Array.isArray(data?.skills) ? data.skills : [];
      if (email) {
        await pool.query(`
          INSERT INTO users_cache (external_user_id, name, email, skills, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (email) DO UPDATE SET
            name = EXCLUDED.name,
            skills = EXCLUDED.skills,
            updated_at = NOW()
        `, [String(userId || ''), name || null, email, skills]);
        console.log(`[K5] 💾 User cached: ${email}`);
      }
      await logNotif({
        user_email: email,
        type: 'welcome',
        subject: `Selamat datang di Freelance Project Hub, ${name || email}!`,
        metadata: JSON.stringify(data || {}),
      });
    }

    // ── K1: USER DINONAKTIFKAN ───────────────────────────────
    else if (routingKey === 'user.deactivated') {
      // Payload K1: { userId, payload: { targetUserId, targetEmail } }
      const targetEmail = payload?.payload?.targetEmail || payload?.targetEmail;
      await pool.query(
        `UPDATE users_cache SET is_active=false, updated_at=NOW() WHERE email=$1 OR external_user_id=$2`,
        [targetEmail || null, String(payload?.userId || payload?.payload?.targetUserId || '')]
      );
      await logNotif({ user_email: targetEmail, type: 'user_deactivated', subject: 'Akun dinonaktifkan oleh admin', metadata: JSON.stringify(payload) });
    }

    // ── K1: PROJECT COMPLETED ────────────────────────────────
    else if (routingKey === 'project.completed') {
      // Payload K1: { userId, payload: { projectId, tokenId, ipfsUri, completionDate } }
      const { userId, payload: data } = payload;
      await logNotif({ type: 'project_completed', subject: `Proyek #${data?.projectId} selesai`, project_id: data?.projectId, metadata: JSON.stringify(payload) });
    }

    // ── K2: STATUS BID DIUPDATE ──────────────────────────────
    else if (routingKey === 'notification.bid.status.updated') {
      // Payload K2: { bidId, freelancerEmail, projectId, projectTitle, status }
      const { bidId, freelancerEmail, projectId, projectTitle, status } = payload;
      await logNotif({
        user_email: freelancerEmail,
        type: 'bid_status',
        subject: `Bid untuk "${projectTitle || `Project #${projectId}`}" → ${status}`,
        project_id: projectId,
        metadata: JSON.stringify(payload),
      });
      if (freelancerEmail) {
        try {
          await sendBidStatusEmail({ to: freelancerEmail, bidId, projectTitle: projectTitle || `Project #${projectId}`, status });
          await updateStatus(freelancerEmail, 'bid_status', 'sent');
          console.log(`[K5] ✉️  Email bid status terkirim ke: ${freelancerEmail}`);
        } catch (e) { console.error('[K5] ❌ Email bid status gagal:', e.message); }
      }
    }

    // ── K2: DEAL DIKONFIRMASI ────────────────────────────────
    else if (routingKey === 'notification.deal.confirmed') {
      const { projectId, projectTitle, freelancerEmail, freelancerName } = payload;
      await logNotif({
        user_email: freelancerEmail,
        type: 'deal_confirmed',
        subject: `Deal dikonfirmasi: ${projectTitle || `Project #${projectId}`}`,
        project_id: projectId,
        metadata: JSON.stringify(payload),
      });
      if (freelancerEmail) {
        try {
          await sendAcceptanceEmail({ to: freelancerEmail, userName: freelancerName || freelancerEmail, projectTitle: projectTitle || `Project #${projectId}`, projectId });
          await updateStatus(freelancerEmail, 'deal_confirmed', 'sent');
          console.log(`[K5] ✉️  Email deal confirmed terkirim ke: ${freelancerEmail}`);
        } catch (e) { console.error('[K5] ❌ Email deal gagal:', e.message); }
      }
    }

    // ── K2: COUNTER OFFER ────────────────────────────────────
    else if (routingKey === 'notification.counter.offer') {
      const { projectId, projectTitle, freelancerEmail } = payload;
      await logNotif({
        user_email: freelancerEmail,
        type: 'counter_offer',
        subject: `Counter offer untuk ${projectTitle || `Project #${projectId}`}`,
        project_id: projectId,
        metadata: JSON.stringify(payload),
      });
    }

    // ── K3: SKILLS DIUPDATE → cek proyek cocok ──────────────
    else if (routingKey === 'tracker.profile.skills.updated') {
      // Payload K3: { userId, payload: { skills, email?, name? } }
      const { userId, payload: data } = payload;
      const skills = Array.isArray(data?.skills) ? data.skills : [];
      if (userId && skills.length > 0) {
        // Update cache user
        await pool.query(
          `UPDATE users_cache SET skills=$1, updated_at=NOW() WHERE external_user_id=$2`,
          [skills, String(userId)]
        );
        // Cari proyek yang cocok dengan skill baru
        const { rows: userRows } = await pool.query(
          `SELECT email, name FROM users_cache WHERE external_user_id=$1`, [String(userId)]
        );
        const userEmail = data?.email || userRows[0]?.email;
        const userName = data?.name || userRows[0]?.name;

        const { rows: projects } = await pool.query(
          `SELECT * FROM projects WHERE status='open' ORDER BY created_at DESC LIMIT 20`
        );
        for (const p of projects) {
          const matched = skills.filter(s =>
            (p.required_skills || []).some(r =>
              r.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(r.toLowerCase())
            )
          );
          if (matched.length > 0 && userEmail) {
            await logNotif({
              user_email: userEmail,
              type: 'skill_match_alert',
              subject: `Skills cocok dengan proyek: ${p.title}`,
              project_id: p.id,
              metadata: JSON.stringify({ matchedSkills: matched }),
            });
            try {
              await sendSkillMatchEmail({ to: userEmail, userName: userName || userEmail, projectTitle: p.title, projectId: p.id, matchedSkills: matched });
              console.log(`[K5] ✉️  Email skill match → ${userEmail} untuk proyek: ${p.title}`);
            } catch (e) { console.error('[K5] ❌ Email skill match gagal:', e.message); }
          }
        }
      }
    }

    // ── K3: MEMBER BERGABUNG KE TIM ──────────────────────────
    else if (routingKey === 'tracker.team.member.joined') {
      // Payload K3: { userId, payload: { teamId, teamName, studentId, studentEmail?, studentName? } }
      const { userId, payload: data } = payload;
      const memberEmail = data?.studentEmail || data?.email;
      const memberName = data?.studentName || data?.name;
      await logNotif({
        user_email: memberEmail,
        type: 'team_joined',
        subject: `Kamu diterima di tim: ${data?.teamName || `Tim #${data?.teamId}`}`,
        metadata: JSON.stringify(payload),
      });
      if (memberEmail && memberName) {
        try {
          await sendAcceptanceEmail({ to: memberEmail, userName: memberName, projectTitle: data?.teamName || `Tim #${data?.teamId}`, projectId: data?.teamId });
          console.log(`[K5] ✉️  Email penerimaan tim → ${memberEmail}`);
        } catch (e) { console.error('[K5] ❌ Email tim join gagal:', e.message); }
      }
    }

    // ── K3: MEMBER DIKELUARKAN ───────────────────────────────
    else if (routingKey === 'tracker.team.member.removed') {
      const { payload: data } = payload;
      const memberEmail = data?.studentEmail || data?.email;
      await logNotif({
        user_email: memberEmail,
        type: 'team_removed',
        subject: `Kamu dikeluarkan dari tim: ${data?.teamName || `Tim #${data?.teamId}`}`,
        metadata: JSON.stringify(payload),
      });
    }

    // ── K4: MILESTONE DIBUAT ─────────────────────────────────
    else if (routingKey === 'tracker.milestone.created') {
      // Payload K4: { eventType, milestoneId, employerId, studentId, status, deadline, occurredAt }
      const { milestoneId, studentId, deadline } = payload;
      // Ambil email student dari cache kalau ada
      const { rows } = await pool.query(
        `SELECT email, name FROM users_cache WHERE external_user_id=$1`, [String(studentId || '')]
      );
      const studentEmail = rows[0]?.email;
      await logNotif({
        user_email: studentEmail,
        type: 'milestone_created',
        subject: `Milestone baru dibuat (ID: ${milestoneId}), deadline: ${deadline || '-'}`,
        metadata: JSON.stringify(payload),
      });
    }

    // ── K4: MILESTONE DIUPDATE ───────────────────────────────
    else if (routingKey === 'tracker.milestone.updated') {
      const { milestoneId, studentId, deadline } = payload;
      const { rows } = await pool.query(
        `SELECT email FROM users_cache WHERE external_user_id=$1`, [String(studentId || '')]
      );
      await logNotif({
        user_email: rows[0]?.email,
        type: 'milestone_updated',
        subject: `Milestone diperbarui (ID: ${milestoneId}), deadline baru: ${deadline || '-'}`,
        metadata: JSON.stringify(payload),
      });
    }

    // ── K4: SUBMISSION MASUK ─────────────────────────────────
    else if (routingKey === 'tracker.submission.posted') {
      const { submissionId, milestoneId, studentId } = payload;
      await logNotif({
        type: 'submission_posted',
        subject: `Submission diterima (ID: ${submissionId}) untuk milestone ${milestoneId}`,
        metadata: JSON.stringify(payload),
      });
    }

    // ── K4: SUBMISSION DISETUJUI ─────────────────────────────
    else if (routingKey === 'tracker.submission.approved') {
      // Payload K4: { submissionId, milestoneId, studentId, reviewerId, reviewId, approvedBy, approvedAt, updatedAt, occurredAt }
      const { submissionId, milestoneId, studentId } = payload;
      const { rows } = await pool.query(
        `SELECT email, name FROM users_cache WHERE external_user_id=$1`, [String(studentId || '')]
      );
      const studentEmail = rows[0]?.email;
      await logNotif({
        user_email: studentEmail,
        type: 'payment_disbursement',
        subject: `Submission disetujui! (ID: ${submissionId}) — Payment akan diproses`,
        metadata: JSON.stringify(payload),
      });
      if (studentEmail) {
        try {
          await sendMilestoneEmail({
            to: studentEmail,
            submissionId,
            projectTitle: `Milestone #${milestoneId}`,
            status: 'approved',
            paymentAmount: null,
          });
          await updateStatus(studentEmail, 'payment_disbursement', 'sent');
          console.log(`[K5] ✉️  Email approval → ${studentEmail}`);
        } catch (e) { console.error('[K5] ❌ Email approval gagal:', e.message); }
      }
    }

    // ── K4: SUBMISSION DITOLAK / PERLU REVISI ───────────────
    else if (routingKey === 'tracker.submission.rejected' || routingKey === 'tracker.submission.needs_revision') {
      const { submissionId, milestoneId, studentId } = payload;
      const isRevision = routingKey === 'tracker.submission.needs_revision';
      const { rows } = await pool.query(
        `SELECT email FROM users_cache WHERE external_user_id=$1`, [String(studentId || '')]
      );
      const studentEmail = rows[0]?.email;
      await logNotif({
        user_email: studentEmail,
        type: isRevision ? 'submission_revision' : 'submission_rejected',
        subject: `Submission ${isRevision ? 'perlu revisi' : 'ditolak'} (ID: ${submissionId})`,
        metadata: JSON.stringify(payload),
      });
      if (studentEmail) {
        try {
          await sendMilestoneEmail({
            to: studentEmail,
            submissionId,
            projectTitle: `Milestone #${milestoneId}`,
            status: isRevision ? 'needs_revision' : 'rejected',
          });
          console.log(`[K5] ✉️  Email ${isRevision ? 'revisi' : 'reject'} → ${studentEmail}`);
        } catch (e) { console.error('[K5] ❌ Email gagal:', e.message); }
      }
    }

    else {
      console.log(`[K5] ℹ️  Event tidak di-handle: ${routingKey}`);
    }

  } catch (err) {
    console.error(`[K5] ❌ Error handle event ${routingKey}:`, err.message);
  }
}

// ============================================================
// HELPERS
// ============================================================
async function logNotif({ user_email, type, subject, status = 'logged', project_id, metadata }) {
  try {
    await pool.query(`
      INSERT INTO notifications_log (user_email, type, subject, status, project_id, metadata, sent_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [user_email || null, type, subject, status, project_id || null, metadata || null]);
  } catch (e) { console.warn('[K5] ⚠️  Gagal log notif:', e.message); }
}

async function updateStatus(email, type, newStatus) {
  try {
    await pool.query(`
      UPDATE notifications_log SET status=$1
      WHERE user_email=$2 AND type=$3
      ORDER BY sent_at DESC LIMIT 1
    `, [newStatus, email, type]);
  } catch (e) { console.warn('[K5] ⚠️  Gagal update status:', e.message); }
}

// ============================================================
// START CONSUMER
// ============================================================
async function startConsumer() {
  const channel = getChannel();
  if (!channel) { console.warn('⚠️  Channel belum siap, startConsumer dibatalkan'); return; }

  const QUEUE = process.env.RABBITMQ_QUEUE || 'kelompok5.notification.queue';
  await channel.assertQueue(QUEUE, { durable: true });

  for (const { exchange, key } of BINDINGS) {
    await channel.bindQueue(QUEUE, exchange, key);
    console.log(`   📌 Bound: [${exchange}] → ${key}`);
  }

  console.log(`\n📬 Consumer aktif — queue: ${QUEUE}`);
  console.log(`   Mendengarkan ${BINDINGS.length} event dari K1, K2, K3, K4`);

  channel.prefetch(1);
  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const routingKey = msg.fields.routingKey;
    let payload = {};
    try { payload = JSON.parse(msg.content.toString()); } catch { console.error('[K5] Payload bukan JSON valid'); }
    await handleEvent(routingKey, payload);
    channel.ack(msg);
  }, { noAck: false });
}

module.exports = { startConsumer };
