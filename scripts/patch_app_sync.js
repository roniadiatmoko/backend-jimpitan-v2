const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '..', 'frontend', 'src', 'app', 'App.js');
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
  'import StatusWhatsApp from "../features/admin/whatsapp/StatusWhatsApp.js";',
  'import StatusWhatsApp from "../features/admin/whatsapp/StatusWhatsApp.js";\nimport SinkronCloud from "../features/admin/cloud-sync/SinkronCloud.js";'
);

c = c.replace(
  '<Route path="status-whatsapp" element={<StatusWhatsApp />} />',
  '<Route path="status-whatsapp" element={<StatusWhatsApp />} />\n            <Route path="sinkron-cloud" element={<SinkronCloud />} />'
);

fs.writeFileSync(file, c, 'utf8');
console.log('App.js successfully patched with SinkronCloud route!');
