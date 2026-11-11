const { all, get } = require('../src/db');

async function testFullYearWithRefWarga() {
  const maxRow = await get("SELECT MAX(tanggal) as max_tgl FROM jimpitan WHERE jumlah > 0");
  const todayStr = new Date().toISOString().substring(0, 10);
  const maxDate = maxRow?.max_tgl && maxRow.max_tgl > todayStr ? maxRow.max_tgl : todayStr;

  const year = 2026;
  const start = `${year}-01-01`;
  const nextYearStart = `${year + 1}-01-01`;

  const sql = `
  WITH RECURSIVE all_days(d) AS (
    SELECT ? WHERE ? <= ?
    UNION ALL
    SELECT date(d, '+1 day') FROM all_days
    WHERE date(d, '+1 day') < ? AND date(d, '+1 day') <= ?
  ),
  pemutihan AS (
    SELECT tanggal FROM tanggal_pemutihan
    WHERE tanggal >= ? AND tanggal < ?
  ),
  warga AS (
    SELECT nomor as nomor_rumah, tanggal_huni, date(tanggal_huni, 'start of month') as awal_huni
    FROM ref_warga
    WHERE sudah_menghuni = 1 AND tanggal_huni IS NOT NULL
  ),
  terisi AS (
    SELECT nomor_rumah, tanggal
    FROM jimpitan
    WHERE jumlah = 1 AND tanggal >= ? AND tanggal < ?
    UNION
    SELECT nomor_rumah, tanggal
    FROM rapel
    WHERE tanggal >= ? AND tanggal < ?
  ),
  kalender AS (
    SELECT w.nomor_rumah, a.d AS tanggal
    FROM warga w
    JOIN all_days a ON a.d >= w.awal_huni
    WHERE a.d NOT IN (SELECT tanggal FROM pemutihan)
  )
  SELECT
    rw.nomor AS nomor_rumah,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '01' THEN 1 ELSE 0 END), 0) AS m01,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '02' THEN 1 ELSE 0 END), 0) AS m02,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '03' THEN 1 ELSE 0 END), 0) AS m03,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '04' THEN 1 ELSE 0 END), 0) AS m04,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '05' THEN 1 ELSE 0 END), 0) AS m05,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '06' THEN 1 ELSE 0 END), 0) AS m06,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '07' THEN 1 ELSE 0 END), 0) AS m07,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '08' THEN 1 ELSE 0 END), 0) AS m08,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '09' THEN 1 ELSE 0 END), 0) AS m09,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '10' THEN 1 ELSE 0 END), 0) AS m10,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '11' THEN 1 ELSE 0 END), 0) AS m11,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL AND strftime('%m', k.tanggal) = '12' THEN 1 ELSE 0 END), 0) AS m12,
    COALESCE(SUM(CASE WHEN k.tanggal IS NOT NULL AND t.tanggal IS NULL THEN 1 ELSE 0 END), 0) AS total
  FROM ref_warga rw
  LEFT JOIN kalender k ON k.nomor_rumah = rw.nomor
  LEFT JOIN terisi t ON t.nomor_rumah = k.nomor_rumah AND t.tanggal = k.tanggal
  GROUP BY rw.nomor
  ORDER BY CAST(rw.nomor AS INTEGER) ASC;
  `;

  const params = [
    start,
    start,
    maxDate,
    nextYearStart,
    maxDate,
    start,
    nextYearStart,
    start,
    nextYearStart,
    start,
    nextYearStart
  ];

  const rows = await all(sql, params);
  console.log("Total rows returned for 2026:", rows.length);
  console.log("No 63 (Kasto):", rows.find(r => r.nomor_rumah === 63));
  console.log("No 3 (Risal, belum menghuni):", rows.find(r => r.nomor_rumah === 3));
  console.log("No 10 (Tri Koesnanto):", rows.find(r => r.nomor_rumah === 10));
  console.log("No 24 (Andhika):", rows.find(r => r.nomor_rumah === 24));
  console.log("No 4 (Wahyono):", rows.find(r => r.nomor_rumah === 4));
}

testFullYearWithRefWarga();
