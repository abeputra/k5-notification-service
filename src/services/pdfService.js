const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Pastikan folder /tmp/contracts ada
const CONTRACT_DIR = '/tmp/k5-contracts';
if (!fs.existsSync(CONTRACT_DIR)) fs.mkdirSync(CONTRACT_DIR, { recursive: true });

async function generateContract({ project, user, members = [] }) {
  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).fillColor('#1a237e').text('KONTRAK KERJA SAMA', { align: 'center' });
    doc.fontSize(12).fillColor('#555').text('Freelance Project Hub — Kelompok 5', { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#1a237e').stroke();
    doc.moveDown();

    // Info proyek
    doc.fontSize(14).fillColor('#1a237e').text('Detail Proyek');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Judul       : ${project.title}`);
    doc.text(`Deskripsi   : ${project.description || '-'}`);
    doc.text(`Budget      : ${project.budget || '-'}`);
    doc.text(`Client      : ${project.client_name || '-'}`);
    doc.text(`Skills      : ${(project.required_skills || []).join(', ') || '-'}`);
    doc.text(`Tanggal     : ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`);
    doc.moveDown();

    // Info talent
    doc.fontSize(14).fillColor('#1a237e').text('Pihak Freelancer');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Nama  : ${user.name || '-'}`);
    doc.text(`Email : ${user.email || '-'}`);
    doc.moveDown();

    // Anggota tim
    if (members.length > 0) {
      doc.fontSize(14).fillColor('#1a237e').text('Tim Proyek');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#333');
      members.forEach((m, i) => doc.text(`${i + 1}. ${m.name} (${m.email}) — ${m.status}`));
      doc.moveDown();
    }

    // Pasal
    doc.fontSize(14).fillColor('#1a237e').text('Ketentuan');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    const pasal = [
      'Freelancer wajib menyelesaikan milestone sesuai jadwal yang disepakati.',
      'Pembayaran dilakukan setelah setiap milestone disetujui oleh client.',
      'Freelancer bertanggung jawab atas kualitas pekerjaan yang diserahkan.',
      'Perselisihan diselesaikan secara musyawarah mufakat.',
    ];
    pasal.forEach((p, i) => { doc.text(`Pasal ${i + 1}: ${p}`); doc.moveDown(0.3); });
    doc.moveDown();

    // TTD
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown();
    doc.fontSize(11).fillColor('#333');
    doc.text('Client', 80, doc.y, { continued: false });
    doc.text('Freelancer', 380, doc.y - doc.currentLineHeight());
    doc.moveDown(3);
    doc.text('___________________________', 80);
    doc.text('___________________________', 380, doc.y - doc.currentLineHeight());
    doc.moveDown();
    doc.fontSize(9).fillColor('#999').text(
      `Dokumen ini digenerate otomatis oleh Kelompok 5 — ${new Date().toISOString()}`,
      { align: 'center' }
    );

    doc.end();
  });

  const filename = `kontrak_${project.id}_${user.id}_${Date.now()}.pdf`;
  const filepath = path.join(CONTRACT_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  return { buffer, filename, filepath };
}

module.exports = { generateContract };
