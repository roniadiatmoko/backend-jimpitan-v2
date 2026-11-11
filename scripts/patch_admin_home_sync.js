const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '..', 'frontend', 'src', 'features', 'admin', 'AdminHome.js');
let c = fs.readFileSync(file, 'utf8');

c = c.replace('IconKalender,\n} from "../../shared/components/icons";', 'IconKalender,\n  IconCloudSync,\n} from "../../shared/components/icons";');
c = c.replace(
  '  {\n    to: "tanggal-putih",\n    label: "Tanggal Putih",\n    desc: "Atur tanggal yang dibebaskan dari jimpitan.",\n    icon: IconKalender,\n  },',
  `  {\n    to: "tanggal-putih",\n    label: "Tanggal Putih",\n    desc: "Atur tanggal yang dibebaskan dari jimpitan.",\n    icon: IconKalender,\n  },\n  {\n    to: "sinkron-cloud",\n    label: "Sinkronisasi Cloud",\n    desc: "Cek data tertinggal & tarik data dari PostgreSQL Cloud.",\n    icon: IconCloudSync,\n  },`
);

fs.writeFileSync(file, c, 'utf8');
console.log('AdminHome.js successfully patched with SinkronCloud shortcut!');
