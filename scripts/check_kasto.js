const { all } = require('../src/db');

(async () => {
  const rapel = await all("SELECT SUBSTR(tanggal, 1, 7) as bln, count(1) as cnt FROM rapel WHERE nomor_rumah = '63' GROUP BY bln ORDER BY bln ASC");
  console.log('Rapel per month for No 63:', rapel);
  const jimp = await all("SELECT SUBSTR(tanggal, 1, 7) as bln, count(1) as cnt FROM jimpitan WHERE nomor_rumah = '63' AND jumlah = 1 GROUP BY bln ORDER BY bln ASC");
  console.log('Jimpitan per month for No 63:', jimp);
})();
