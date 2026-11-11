const fs = require('fs');
const path = require('path');

// 1. Patch db.js
const dbPath = path.join(__dirname, '..', 'db.js');
let dbContent = fs.readFileSync(dbPath, 'utf8');

const oldSimpanRegex = /function simpanRefWarga\(nama, sudah_menghuni, tanggal_huni, no_hp\) \{[\s\S]*?resolve\(nomor \|\| null\);\s*\},?\s*\);\s*\}\);?\s*\}/;

const newSimpanFn = `function simpanRefWarga(nomor, nama, sudah_menghuni, tanggal_huni, no_hp) {
  let targetNomor = nomor;
  let targetNama = nama;
  let targetSudahMenghuni = sudah_menghuni;
  let targetTanggalHuni = tanggal_huni;
  let targetNoHp = no_hp;

  if (typeof targetNomor === "string" && isNaN(Number(targetNomor))) {
    targetNama = nomor;
    targetSudahMenghuni = nama;
    targetTanggalHuni = sudah_menghuni;
    targetNoHp = tanggal_huni;
    targetNomor = null;
  }

  return new Promise((resolve, reject) => {
    if (targetNomor != null && targetNomor !== "") {
      const numNomor = Number(targetNomor);
      db.run(
        \`INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (nomor) DO UPDATE SET
           nama = EXCLUDED.nama,
           sudah_menghuni = EXCLUDED.sudah_menghuni,
           tanggal_huni = EXCLUDED.tanggal_huni,
           no_hp = EXCLUDED.no_hp\`,
        [numNomor, targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
        function (err) {
          if (err) return reject(err);
          enqueueMirror(\`warga \${numNomor}\`, (pool) =>
            pool.query(
              "INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nomor) DO UPDATE SET nama = EXCLUDED.nama, sudah_menghuni = EXCLUDED.sudah_menghuni, tanggal_huni = EXCLUDED.tanggal_huni, no_hp = EXCLUDED.no_hp",
              [numNomor, targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
            ),
          );
          resolve(numNomor);
        },
      );
    } else {
      db.run(
        "INSERT INTO ref_warga (nama, sudah_menghuni, tanggal_huni, no_hp) VALUES (?, ?, ?, ?)",
        [targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
        function (err) {
          if (err) return reject(err);
          const newNomor = this.lastID;
          enqueueMirror(\`warga \${newNomor}\`, (pool) =>
            pool.query(
              "INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nomor) DO UPDATE SET nama = EXCLUDED.nama, sudah_menghuni = EXCLUDED.sudah_menghuni, tanggal_huni = EXCLUDED.tanggal_huni, no_hp = EXCLUDED.no_hp",
              [newNomor, targetNama, targetSudahMenghuni, targetTanggalHuni, targetNoHp],
            ),
          );
          resolve(newNomor || null);
        },
      );
    }
  });
}`;

if (oldSimpanRegex.test(dbContent)) {
  dbContent = dbContent.replace(oldSimpanRegex, newSimpanFn);
} else if (!dbContent.includes('targetNomor')) {
  console.warn('Regex match failed on simpanRefWarga, using string search replace');
  const anchor = 'function simpanRefWarga(nama, sudah_menghuni, tanggal_huni, no_hp) {';
  const endAnchor = 'function updateRefWarga';
  const aIdx = dbContent.indexOf(anchor);
  const bIdx = dbContent.indexOf(endAnchor);
  if (aIdx !== -1 && bIdx !== -1) {
    dbContent = dbContent.substring(0, aIdx) + newSimpanFn + '\n\n' + dbContent.substring(bIdx);
  }
}

// Pastikan ORDER BY CAST(nomor AS INTEGER) ASC
dbContent = dbContent.replace(
  'SELECT * FROM ref_warga ORDER BY nomor ASC',
  'SELECT * FROM ref_warga ORDER BY CAST(nomor AS INTEGER) ASC'
);

fs.writeFileSync(dbPath, dbContent, 'utf8');
console.log('✅ db.js patched');

// 2. Patch index.js
const indexPath = path.join(__dirname, '..', 'index.js');
let indexContent = fs.readFileSync(indexPath, 'utf8');

indexContent = indexContent.replace(
  'const { nama, sudah_menghuni, tanggal_huni, no_hp } = req.body;\n    const nomor = await simpanRefWarga(nama, sudah_menghuni, tanggal_huni, no_hp);',
  'const { nomor, nama, sudah_menghuni, tanggal_huni, no_hp } = req.body;\n    const resultNomor = await simpanRefWarga(nomor, nama, sudah_menghuni, tanggal_huni, no_hp);\n    res.json({ status: "OK", nomor: resultNomor });'
);
indexContent = indexContent.replace(
  'res.json({ status: "OK", nomor });\n  } catch (err) {',
  'res.json({ status: "OK", nomor: resultNomor });\n  } catch (err) {'
);

fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log('✅ index.js patched');
