const fs = require('fs');
const target = 'e:/jimpitan/backend/index.js';
let code = fs.readFileSync(target, 'utf8');

// 1. Update imports
if (!code.includes('getBotStatus')) {
  code = code.replace(
    '  getLatestQr,\n  onBotReady,',
    '  getLatestQr,\n  onBotReady,\n  getBotStatus,\n  logoutBot,\n  restartBot,'
  );
}

// 2. Add endpoints
const endpoints = `
// ==== WhatsApp Status & Management ====
app.get("/api/whatsapp/status", async (req, res) => {
  try {
    const autoStart = req.query.auto_start === "true";
    let status = getBotStatus();
    if (!status.connected && !status.starting && autoStart) {
      startBot();
      await new Promise((r) => setTimeout(r, 1500));
      status = getBotStatus();
    }
    const qrUrl = status.qr
      ? \`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=\${encodeURIComponent(status.qr)}\`
      : null;
    res.json({
      status: "OK",
      data: {
        ...status,
        qr_url: qrUrl,
      },
    });
  } catch (err) {
    console.error("Error in /api/whatsapp/status:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/whatsapp/start", async (req, res) => {
  try {
    await restartBot();
    await new Promise((r) => setTimeout(r, 1500));
    const status = getBotStatus();
    const qrUrl = status.qr
      ? \`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=\${encodeURIComponent(status.qr)}\`
      : null;
    res.json({
      status: "OK",
      message: "WhatsApp bot dimulai.",
      data: { ...status, qr_url: qrUrl },
    });
  } catch (err) {
    console.error("Error in /api/whatsapp/start:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/whatsapp/logout", async (req, res) => {
  try {
    await logoutBot();
    res.json({ status: "OK", message: "Sesi WhatsApp berhasil dikeluarkan (logout)." });
  } catch (err) {
    console.error("Error in /api/whatsapp/logout:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/whatsapp/test", async (req, res) => {
  try {
    const status = getBotStatus();
    if (!status.connected) {
      return res.status(400).json({
        status: "ERROR",
        message: "WhatsApp belum terhubung. Silakan scan QR terlebih dahulu.",
      });
    }
    const { target_phone, message } = req.body || {};
    const textToSend = message || \`Halo! Ini adalah pesan tes dari Aplikasi Jimpitan GBK Tempel 2 pada \${new Date().toLocaleString("id-ID")}.\`;
    
    if (target_phone) {
      await kirimPesanWhatsApp(textToSend, target_phone);
    } else {
      await kirimTesWhatsApp(textToSend);
    }
    res.json({ status: "OK", message: "Pesan tes berhasil dikirim!" });
  } catch (err) {
    console.error("Error in /api/whatsapp/test:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});
`;

if (!code.includes('/api/whatsapp/status')) {
  code = code.replace(
    '// --- Endpoint untuk mengambil laporan harian berdasarkan tanggal ---',
    `${endpoints}\n// --- Endpoint untuk mengambil laporan harian berdasarkan tanggal ---`
  );
}

fs.writeFileSync(target, code, 'utf8');
console.log('index.js updated successfully with WhatsApp endpoints.');
