const { all, get, run } = require("../../db");
const { enqueueMirror } = require("../../utils/postgresMirror");

async function getHitungUlangHarian(tanggal) {
  const header = await get(
    `SELECT
       nominal_hitung_ulang 
     FROM hitung_ulang_jimpitan_harian
     WHERE tanggal = ?`,
    [tanggal]
  );

  return {
    total_harian: Number(header?.nominal_hitung_ulang || 0),
  };
}

async function upsertHitungUlangHarian(tanggal, nominal_hitung_ulang) {
  const existing = await get(
    `SELECT tanggal FROM hitung_ulang_jimpitan_harian WHERE tanggal = ?`,
    [tanggal]
  );

  if (existing) {
    await run(
      `UPDATE hitung_ulang_jimpitan_harian
       SET nominal_hitung_ulang = ?
       WHERE tanggal = ?`,
      [nominal_hitung_ulang, existing.tanggal]
    );
    enqueueMirror(`hitung ulang ${tanggal}`, (pool) =>
      pool.query(
        "INSERT INTO hitung_ulang_jimpitan_harian (tanggal, nominal_hitung_ulang) VALUES ($1, $2) ON CONFLICT (tanggal) DO UPDATE SET nominal_hitung_ulang = EXCLUDED.nominal_hitung_ulang",
        [tanggal, nominal_hitung_ulang],
      ),
    );
    return { message: "Data updated successfully." };
  } else {
    await run(
      `INSERT INTO hitung_ulang_jimpitan_harian (tanggal, nominal_hitung_ulang)
       VALUES (?, ?)`,
      [tanggal, nominal_hitung_ulang]
    );
    enqueueMirror(`hitung ulang ${tanggal}`, (pool) =>
      pool.query(
        "INSERT INTO hitung_ulang_jimpitan_harian (tanggal, nominal_hitung_ulang) VALUES ($1, $2) ON CONFLICT (tanggal) DO UPDATE SET nominal_hitung_ulang = EXCLUDED.nominal_hitung_ulang",
        [tanggal, nominal_hitung_ulang],
      ),
    );
    return { message: "Data inserted successfully." };
  }
}

module.exports = {
  getHitungUlangHarian,
  upsertHitungUlangHarian,
};
