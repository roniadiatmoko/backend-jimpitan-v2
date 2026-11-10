const { all } = require('../src/db');

(async () => {
  const data = await all('SELECT nomor, nama, sudah_menghuni FROM ref_warga ORDER BY CAST(nomor AS INTEGER) ASC');

  // Mapping rules
  const femaleNumbers = [12, 18, 22, 38, 59]; // Sri Parinem, Rini, Ineke, Adinda, Pitaloka
  const ambiguousNumbers = [11, 20, 35, 52, 54, 60]; // Herma, Pak Roni - Bu Nurul, Sinyo/Aang, Tri/Yudi, Okta, Tri

  const proposed = data.map(d => {
    let clean = d.nama.trim();
    if (clean === '-') return { nomor: d.nomor, current: clean, proposed: '-', category: 'Kosong' };

    // Remove old prefix Bapak / Pak / Bp. / Ibu / Bu
    let base = clean;
    if (base.startsWith('Bapak ')) base = base.slice(6);
    else if (base.startsWith('Pak ')) base = base.slice(4);
    else if (base.startsWith('Bp. ')) base = base.slice(4);
    else if (base.startsWith('Ibu ')) base = base.slice(4);
    else if (base.startsWith('Bu ')) base = base.slice(3);

    if (femaleNumbers.includes(d.nomor)) {
      return { nomor: d.nomor, current: clean, proposed: `Ibu ${base}`, category: 'Perempuan' };
    }

    if (ambiguousNumbers.includes(d.nomor)) {
      return { nomor: d.nomor, current: clean, proposed: `? (${clean})`, category: 'Butuh Konfirmasi' };
    }

    return { nomor: d.nomor, current: clean, proposed: `Bp. ${base}`, category: 'Laki-laki' };
  });

  console.log('=== AMBIGUOUS / SPECIAL CASES ===');
  console.table(proposed.filter(p => p.category === 'Butuh Konfirmasi'));

  console.log('\n=== FEMALE RESIDENTS (IBU) ===');
  console.table(proposed.filter(p => p.category === 'Perempuan'));

  console.log('\n=== SAMPLE MALE RESIDENTS (BP.) ===');
  console.table(proposed.filter(p => p.category === 'Laki-laki').slice(0, 15));
})();
