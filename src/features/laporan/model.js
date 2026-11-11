const { all, get } = require("../../db");

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

  // Batas akhir penagihan adalah tanggal ronda terakhir yang sudah diinput petugas (maksimal hari ini).
  // Jika hari ini petugas ronda belum menginput data, maka hari ini belum dihitung sebagai kekurangan.
  const maxRow = await get("SELECT MAX(tanggal) as max_tgl FROM jimpitan WHERE jumlah > 0");
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const maxDate = maxRow?.max_tgl ? (maxRow.max_tgl > todayStr ? todayStr : maxRow.max_tgl) : todayStr;

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
    start,
    start,
    maxDate,
    nextMonthStart,
    maxDate,
    start,
    nextMonthStart,
    start,
    nextMonthStart,
    start,
    nextMonthStart,
  ];

  const rows = await all(sql, params);

  // mapping output biar rapi
  return rows.map((r) => ({
    nomor_rumah: String(r.nomor_rumah),
    kekurangan_hari: Number(r.kekurangan_hari) || 0,
    tanggal_kurang: r.tanggal_kurang_csv ? r.tanggal_kurang_csv.split(",") : [],
  }));
}

// year: 'YYYY' or number
async function getHitungKekuranganTahun(year) {
  const yStr = String(year);
  const start = `${yStr}-01-01`;
  const nextYearStart = `${Number(yStr) + 1}-01-01`;

  // Batas akhir penagihan adalah tanggal ronda terakhir yang sudah diinput petugas (maksimal hari ini).
  // Jika hari ini petugas ronda belum menginput data, maka hari ini belum dihitung sebagai kekurangan.
  const maxRow = await get("SELECT MAX(tanggal) as max_tgl FROM jimpitan WHERE jumlah > 0");
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const maxDate = maxRow?.max_tgl ? (maxRow.max_tgl > todayStr ? todayStr : maxRow.max_tgl) : todayStr;

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
    nextYearStart,
  ];

  const rows = await all(sql, params);

  return rows.map((r) => ({
    nomor_rumah: String(r.nomor_rumah),
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
    total: Number(r.total) || 0,
  }));
}

module.exports = {
  getHitungKekurangan,
  getHitungKekuranganTahun,
};
