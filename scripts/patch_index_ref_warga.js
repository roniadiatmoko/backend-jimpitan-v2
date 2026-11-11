const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

c = c.replace(
  'const { nama, sudah_menghuni, tanggal_huni, no_hp } = req.body;',
  'const { nomor, nama, sudah_menghuni, tanggal_huni, no_hp } = req.body;'
);
c = c.replace(
  'const nomor = await simpanRefWarga(nama, sudah_menghuni, tanggal_huni, no_hp);',
  'const resultNomor = await simpanRefWarga(nomor, nama, sudah_menghuni, tanggal_huni, no_hp);'
);
c = c.replace(
  'res.json({ status: "OK", nomor });',
  'res.json({ status: "OK", nomor: resultNomor });'
);

fs.writeFileSync('index.js', c, 'utf8');
console.log('index.js patch success:', c.includes('resultNomor'));
