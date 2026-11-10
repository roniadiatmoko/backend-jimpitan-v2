const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.js');
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  '  getPreviewStatus,\n  executeFullPull,\n} = require("./src/services/cloudSyncService");',
  '  getPreviewStatus,\n  executeFullPull,\n  executeFullPush,\n} = require("./src/services/cloudSyncService");'
);

const pushEndpoint = `app.post("/api/database/push-to-cloud", async (req, res) => {
  try {
    const result = await executeFullPush();
    res.json(result);
  } catch (err) {
    console.error("Error in /api/database/push-to-cloud:", err);
    res.status(500).json({ status: "ERROR", message: err.message });
  }
});`;

if (!c.includes('/api/database/push-to-cloud')) {
  c = c.replace(
    'app.post("/api/database/pull-from-cloud"',
    pushEndpoint + '\n\napp.post("/api/database/pull-from-cloud"'
  );
  fs.writeFileSync(file, c, 'utf8');
  console.log('index.js successfully patched with push-to-cloud endpoint!');
} else {
  console.log('index.js already has push-to-cloud.');
}
