const fs = require('fs');
let code = fs.readFileSync('e:/jimpitan/backend/index.js', 'utf8');

const testEndpoint = `
app.post("/api/whatsapp/chat-test", async (req, res) => {
  try {
    const { message, sender } = req.body || {};
    const { prosesPesanDenganAI } = require("./src/services/aiService");
    const reply = await prosesPesanDenganAI(message || "Halo", sender || "628123456789@s.whatsapp.net");
    res.json({ status: "OK", reply });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});
`;

if (!code.includes('/api/whatsapp/chat-test')) {
  code = code.replace(
    '// --- Endpoint untuk mengambil laporan harian berdasarkan tanggal ---',
    testEndpoint + '\n// --- Endpoint untuk mengambil laporan harian berdasarkan tanggal ---'
  );
  fs.writeFileSync('e:/jimpitan/backend/index.js', code, 'utf8');
  console.log('Added /api/whatsapp/chat-test to index.js');
} else {
  console.log('Already added.');
}
