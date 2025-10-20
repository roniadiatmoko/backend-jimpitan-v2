const { all } = require("../../db");

// period: 'YYYY-MM'
async function getHitungKekurangan(period) {
  // hitung start dan nextMonthStart
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = `${yearStr}-${monthStr}-01`;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthStr = String(nextMonth).padStart(2, "0");
  const nextMonthStart = `${nextMonthYear}-${nextMonthStr}-01`;

  const sql = `
  WITH RECURSIVE all_days(d) AS (
    SELECT ?                             -- :start
    UNION ALL
    SELECT date(d, '+1 day') FROM all_days
    WHERE d < date(?, '-1 day')          -- :nextMonthStart
  ),
  rumah AS (
    SELECT DISTINCT nomor_rumah FROM (
      SELECT nomor_rumah FROM jimpitan
      WHERE tanggal >= ? AND tanggal < ?
      UNION
      SELECT nomor_rumah FROM rapel
      WHERE tanggal >= ? AND tanggal < ?
    )
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
    SELECT r.nomor_rumah, a.d AS tanggal
    FROM rumah r CROSS JOIN all_days a
  )
  SELECT
    k.nomor_rumah,
    SUM(CASE WHEN t.tanggal IS NULL THEN 1 ELSE 0 END) AS kekurangan_hari,
    GROUP_CONCAT(CASE WHEN t.tanggal IS NULL THEN k.tanggal END, ',') AS tanggal_kurang_csv
  FROM kalender k
  LEFT JOIN terisi t
    ON t.nomor_rumah = k.nomor_rumah AND t.tanggal = k.tanggal
  GROUP BY k.nomor_rumah
  HAVING SUM(CASE WHEN t.tanggal IS NULL THEN 1 ELSE 0 END) > 0
  ORDER BY CAST(k.nomor_rumah AS INTEGER) ASC;
  `;

  const params = [
    start,               // 1  all_days: start
    nextMonthStart,      // 2  all_days: nextMonthStart
    start,               // 3  rumah (jimpitan)
    nextMonthStart,      // 4
    start,               // 5  rumah (rapel)
    nextMonthStart,      // 6
    start,               // 7  terisi (jimpitan)
    nextMonthStart,      // 8
    start,               // 9  terisi (rapel)
    nextMonthStart       // 10
  ];

  const rows = await all(sql, params);

  // mapping output biar rapi
  return rows.map(r => ({
    nomor_rumah: r.nomor_rumah,
    kekurangan_hari: Number(r.kekurangan_hari) || 0,
    tanggal_kurang: r.tanggal_kurang_csv ? r.tanggal_kurang_csv.split(",") : []
  }));
}

module.exports = {
  getHitungKekurangan,
};
