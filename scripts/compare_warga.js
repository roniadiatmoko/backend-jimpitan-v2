const { all } = require('../src/db');
const fs = require('fs');
const path = require('path');

(async () => {
  const dbWarga = await all('SELECT * FROM ref_warga ORDER BY nomor ASC');
  const dbMap = new Map(dbWarga.map(w => [Number(w.nomor), w]));

  const configPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'shared', 'config.js');
  const configText = fs.readFileSync(configPath, 'utf8');
  const match = configText.match(/export const homeList = (\[[\s\S]*?\]);/);
  if (!match) {
    console.error('homeList not found in config.js');
    return;
  }
  
  // eval homeList safely
  const homeList = eval(match[1]);

  const existingInDb = [];
  const missingFromDb = [];

  for (const h of homeList) {
    if (dbMap.has(Number(h.nomor))) {
      existingInDb.push({ static: h, db: dbMap.get(Number(h.nomor)) });
    } else {
      missingFromDb.push(h);
    }
  }

  console.log('Total static homeList:', homeList.length);
  console.log('Already in DB count:', existingInDb.length);
  console.log('Missing from DB count:', missingFromDb.length);

  console.log('\n=== SAMPLE EXISTING COMPARISON (static vs db) ===');
  existingInDb.slice(0, 10).forEach(e => {
    console.log(`No ${e.static.nomor}: Static='${e.static.nama}' vs DB='${e.db.nama}' (HP: ${e.db.no_hp || '-'})`);
  });

  console.log('\n=== LIST OF 42 HOMES TO ADD TO DB ===');
  console.table(missingFromDb.map(m => ({ nomor: m.nomor, nama: m.nama, sudah_menghuni: m.sudah_menghuni, tanggal_huni: m.tanggal_huni })));
})();
