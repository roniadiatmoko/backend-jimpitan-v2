const { all, get } = require("../../db");

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

module.exports = {
  getHitungUlangHarian,
};
