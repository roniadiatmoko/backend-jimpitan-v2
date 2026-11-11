const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '..', 'frontend', 'src', 'shared', 'components', 'AdminSidebar.js');
let c = fs.readFileSync(file, 'utf8');

c = c.replace('IconWhatsApp,', 'IconWhatsApp,\n  IconCloudSync,');
c = c.replace(
  '{ to: "status-whatsapp", label: "Status WhatsApp", icon: IconWhatsApp },',
  '{ to: "status-whatsapp", label: "Status WhatsApp", icon: IconWhatsApp },\n  { to: "sinkron-cloud", label: "Sinkronisasi Cloud", icon: IconCloudSync },'
);

fs.writeFileSync(file, c, 'utf8');
console.log('AdminSidebar.js successfully patched!');
