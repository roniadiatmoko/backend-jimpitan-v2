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
  pemutihan AS (
    SELECT tanggal FROM tanggal_pemutihan
    WHERE tanggal >= ? AND tanggal < ?
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
    WHERE a.d NOT IN (SELECT tanggal FROM pemutihan)
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
    start,               // 3  pemutihan: start
    nextMonthStart,      // 4  pemutihan: nextMonthStart
    start,               // 5  rumah (jimpitan)
    nextMonthStart,      // 6
    start,               // 7  rumah (rapel)
    nextMonthStart,      // 8
    start,               // 9  terisi (jimpitan)
    nextMonthStart,      // 10
    start,               // 11  terisi (rapel)
    nextMonthStart       // 12
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

// year: 'YYYY' or number
async function getHitungKekuranganTahun(year) {
  const yStr = String(year);
  const start = `${yStr}-01-01`;
  const nextYearStart = `${Number(yStr) + 1}-01-01`;
  const end = `${yStr}-12-31`;

  const sql = `
  WITH RECURSIVE all_days(d) AS (
    SELECT ?                             -- :start
    UNION ALL
    SELECT date(d, '+1 day') FROM all_days
    WHERE d < date(?, '-1 day')          -- :nextYearStart
  ),
  pemutihan AS (
    SELECT tanggal FROM tanggal_pemutihan
    WHERE tanggal >= ? AND tanggal < ?
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
    WHERE a.d NOT IN (SELECT tanggal FROM pemutihan)
  )
  SELECT
    k.nomor_rumah,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '01' THEN 1 ELSE 0 END) AS m01,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '02' THEN 1 ELSE 0 END) AS m02,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '03' THEN 1 ELSE 0 END) AS m03,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '04' THEN 1 ELSE 0 END) AS m04,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '05' THEN 1 ELSE 0 END) AS m05,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '06' THEN 1 ELSE 0 END) AS m06,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '07' THEN 1 ELSE 0 END) AS m07,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '08' THEN 1 ELSE 0 END) AS m08,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '09' THEN 1 ELSE 0 END) AS m09,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '10' THEN 1 ELSE 0 END) AS m10,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '11' THEN 1 ELSE 0 END) AS m11,
    SUM(CASE WHEN t.tanggal IS NULL AND strftime('%m', k.tanggal) = '12' THEN 1 ELSE 0 END) AS m12,
    SUM(CASE WHEN t.tanggal IS NULL THEN 1 ELSE 0 END) AS total
  FROM kalender k
  LEFT JOIN terisi t
    ON t.nomor_rumah = k.nomor_rumah AND t.tanggal = k.tanggal
  GROUP BY k.nomor_rumah
  HAVING SUM(CASE WHEN t.tanggal IS NULL THEN 1 ELSE 0 END) > 0
  ORDER BY CAST(k.nomor_rumah AS INTEGER) ASC;
  `;

  const params = [
    start,           // all_days start
    nextYearStart,   // all_days nextYearStart
    start,           // pemutihan >= start
    nextYearStart,   // pemutihan < nextYearStart
    start,           // rumah jimpitan >= start
    nextYearStart,   // rumah jimpitan < nextYearStart
    start,           // rumah rapel >= start
    nextYearStart,   // rumah rapel < nextYearStart
    start,           // terisi jimpitan >= start
    nextYearStart,   // terisi jimpitan < nextYearStart
    start,           // terisi rapel >= start
    nextYearStart    // terisi rapel < nextYearStart
  ];

  const rows = await all(sql, params);

  return rows.map(r => ({
    nomor_rumah: r.nomor_rumah,
    januari: Number(r.m01) || 0,
    februari: Number(r.m02) || 0,
    maret: Number(r.m03) || 0,
    april: Number(r.m04) || 0,
    mei: Number(r.m05) || 0,
    juni: Number(r.m06) || 0,
    juli: Number(r.m07) || 0,
    agustus: Number(r.m08) || 0,
    september: Number(r.m09) || 0,
    oktober: Number(r.m10) || 0,
    november: Number(r.m11) || 0,
    desember: Number(r.m12) || 0,
    total: Number(r.total) || 0
  }));
}

// export tambahan
module.exports.getHitungKekuranganTahun = getHitungKekuranganTahun;
