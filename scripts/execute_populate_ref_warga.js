const { all, run } = require('../src/db');
const { checkAndPrepareWarga } = require('./populate_ref_warga');

(async () => {
  const { toInsert, skipped, totalStatic, totalDb } = await checkAndPrepareWarga();

  console.log(`Initial DB count: ${totalDb}`);
  console.log(`Skipping ${skipped.length} existing warga (nama & no_hp preserved).`);
  console.log(`Inserting ${toInsert.length} new homes into ref_warga...`);

  let insertedCount = 0;
  for (const item of toInsert) {
    await run(
      `INSERT INTO ref_warga (nomor, nama, sudah_menghuni, tanggal_huni, no_hp)
       VALUES (?, ?, ?, ?, ?)`,
      [item.nomor, item.nama, item.sudah_menghuni, item.tanggal_huni, item.no_hp]
    );
    insertedCount++;
  }

  console.log(`Successfully inserted ${insertedCount} rows.`);

  // Verify
  const finalWarga = await all('SELECT * FROM ref_warga ORDER BY CAST(nomor AS INTEGER) ASC');
  console.log(`Final total rows in ref_warga: ${finalWarga.length}`);

  // Sample check: check No. 1 (new), No. 2 (skipped/original), No. 20 (skipped/original), No. 68 (new)
  const samples = finalWarga.filter(w => [1, 2, 7, 20, 44, 68].includes(Number(w.nomor)));
  console.log('Sample rows in DB:');
  console.table(samples);
})();
