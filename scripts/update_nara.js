const fs = require('fs');

// 1. Update aiService.js
const aiServicePath = 'e:/jimpitan/backend/src/services/aiService.js';
let aiCode = fs.readFileSync(aiServicePath, 'utf8');

const oldPrompt = `  const systemPrompt = \`Anda adalah Asisten Virtual Resmi Pengurus Jimpitan Perumahan Griya Bhina Karya Tempel 2.
Tugas Anda menjawab pertanyaan warga dan pengurus seputar jimpitan, tagihan/kekurangan bayar, saldo kas, laporan harian, dan cara pembayaran dengan ramah, santun, dan akurat.`;

const newPrompt = `  const systemPrompt = \`Nama Anda adalah Nara. Anda adalah Asisten Virtual Resmi Pengurus Jimpitan Perumahan Griya Bhina Karya Tempel 2.
Perkenalkan diri Anda sebagai Nara dengan ramah, ceria, hangat, dan santun jika disapa, ditanya siapa Anda, atau saat memulai percakapan baru.
Tugas utama Anda membantu menjawab pertanyaan warga dan pengurus seputar iuran jimpitan, tagihan/kekurangan bayar, saldo kas, laporan harian, dan informasi pembayaran secara akurat dan solutif.`;

aiCode = aiCode.replace(oldPrompt, newPrompt);
fs.writeFileSync(aiServicePath, aiCode, 'utf8');
console.log('aiService.js updated with persona name Nara.');

// 2. Update StatusWhatsApp.js in frontend
const statusWaPath = 'e:/jimpitan/frontend/src/features/admin/whatsapp/StatusWhatsApp.js';
let statusWaCode = fs.readFileSync(statusWaPath, 'utf8');

statusWaCode = statusWaCode.replace(
  'Jimpitan Bot',
  'Nara (Asisten Jimpitan)'
);

statusWaCode = statusWaCode.replace(
  'Simulasi & Uji Coba Chat AI',
  'Simulasi & Uji Coba Chat AI (Nara)'
);

statusWaCode = statusWaCode.replace(
  'Uji coba bagaimana AI menjawab pertanyaan warga secara interaktif.',
  'Uji coba bagaimana Nara menjawab pertanyaan warga secara interaktif.'
);

statusWaCode = statusWaCode.replace(
  'Balasan WhatsApp Otomatis:',
  'Balasan WhatsApp dari Nara:'
);

statusWaCode = statusWaCode.replace(
  `placeholder="Ketik pertanyaan untuk bot AI (contoh: 'tampilkan kekurangan november')..."`,
  `placeholder="Ketik pesan untuk Nara (contoh: 'halo nara', 'tampilkan kekurangan november')..."`
);

fs.writeFileSync(statusWaPath, statusWaCode, 'utf8');
console.log('StatusWhatsApp.js updated with Nara branding.');

// 3. Update ANALISIS_FITUR_AI_WHATSAPP.md
const mdPath = 'e:/jimpitan/ANALISIS_FITUR_AI_WHATSAPP.md';
let mdCode = fs.readFileSync(mdPath, 'utf8');
mdCode = mdCode.replace(
  '# 🤖 Analisis & Rencana Arsitektur: WhatsApp Bot Interaktif Berbasis AI',
  '# 🤖 Analisis & Rencana Arsitektur: Nara - Asisten Virtual WhatsApp AI Jimpitan'
);
mdCode = mdCode.replace(
  'Asisten Virtual Resmi Pengurus Jimpitan',
  'Nara - Asisten Virtual Resmi Pengurus Jimpitan'
);
fs.writeFileSync(mdPath, mdCode, 'utf8');
console.log('ANALISIS_FITUR_AI_WHATSAPP.md updated with Nara.');

console.log('All Nara naming updates completed.');
