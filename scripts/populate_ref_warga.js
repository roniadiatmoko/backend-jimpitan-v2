const { all, run } = require('../src/db');
const fs = require('fs');
const path = require('path');

async function checkAndPrepareWarga() {
  const dbWarga = await all('SELECT * FROM ref_warga ORDER BY nomor ASC');
  const dbMap = new Map(dbWarga.map(w => [Number(w.nomor), w]));

  const configPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'shared', 'config.js');
  const configText = fs.readFileSync(configPath, 'utf8');
  const match = configText.match(/export const homeList = (\[[\s\S]*?\]);/);
  if (!match) {
    throw new Error('homeList tidak ditemukan di config.js');
  }
  const homeList = eval(match[1]);

  const toInsert = [];
  const skipped = [];

  for (const h of homeList) {
    const nomor = Number(h.nomor);
    if (dbMap.has(nomor)) {
      skipped.push({ nomor, dbNama: dbMap.get(nomor).nama, staticNama: h.nama });
    } else {
      // Siapkan data baru
      const nama = h.nama;
      const sudahMenghuni = Number(h.sudah_menghuni) === 1 ? 1 : 0;
      let tanggalHuni = h.tanggal_huni;
      if (!tanggalHuni || tanggalHuni === '0000-00-00') {
        tanggalHuni = null;
      }
      toInsert.push({
        nomor,
        nama,
        sudah_menghuni: sudahMenghuni,
        tanggal_huni: tanggalHuni,
        no_hp: null,
      });
    }
  }

  return { toInsert, skipped, totalStatic: homeList.length, totalDb: dbWarga.length };
}

if (require.main === module) {
  (async () => {
    const res = await checkAndPrepareWarga();
    console.log(`Total data statis: ${res.totalStatic}`);
    console.log(`Sudah ada di DB (akan di-skip): ${res.skipped.length}`);
    console.log(`Belum ada di DB (siap ditambahkan): ${res.toInsert.length}`);
    console.log('\n--- DAFTAR YANG AKAN DITAMBAHKAN ---');
    console.table(res.toInsert);
  })();
}

module.exports = { checkAndPrepareWarga };
