const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.js');
let content = fs.readFileSync(file, 'utf8');

const target = `app.post("/api/whatsapp/chat-test", async (req, res) => {
  try {
    const { message, sender } = req.body || {};
    const { prosesPesanDenganAI } = require("./src/services/aiService");
    const reply = await prosesPesanDenganAI(message || "Halo", sender || "628123456789@s.whatsapp.net");
    res.json({ status: "OK", reply });
  } catch (err) {
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});`;

const addition = `
// ==== Cloud Database Sync (PostgreSQL <-> Local SQLite) ====
const {
  getPreviewStatus,
  executeFullPull,
} = require("./src/services/cloudSyncService");

app.get("/api/database/sync-preview", async (req, res) => {
  try {
    const data = await getPreviewStatus();
    res.json({ status: "OK", data });
  } catch (err) {
    console.error("Error in /api/database/sync-preview:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});

app.post("/api/database/pull-from-cloud", async (req, res) => {
  try {
    const result = await executeFullPull();
    res.json(result);
  } catch (err) {
    console.error("Error in /api/database/pull-from-cloud:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});
`;

if (!content.includes('/api/database/sync-preview')) {
  content = content.replace(target, target + '\n' + addition);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully patched index.js with sync endpoints!');
} else {
  console.log('index.js already has sync endpoints.');
}
