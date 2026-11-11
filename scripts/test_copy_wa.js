const { getHitungKekuranganTahun } = require('../src/features/laporan/model');
const { all } = require('../src/db');

(async () => {
  const data = await getHitungKekuranganTahun('2026');
  const warga = await all('SELECT nomor, nama, sudah_menghuni FROM ref_warga');
  const homeMap = {};
  for (const w of warga) homeMap[String(w.nomor)] = w;

  const months = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember' }
  ];

  const selectedEndMonth = 11;
  const year = '2026';
  const monthLabel = months.find(m => m.value === selectedEndMonth)?.label;

  const calculateCumulativeTotal = (item) => {
    let cumulative = 0;
    for (let i = 1; i <= selectedEndMonth; i++) {
      const month = months.find((m) => m.value === i);
      if (month) {
        const key = month.label.toLowerCase();
        cumulative += Number(item[key]) || 0;
      }
    }
    return cumulative;
  };

  const rupiahFormat = (nominal) => 'Rp ' + Number(nominal || 0).toLocaleString('id-ID');

  const listTagihan = data
    .map(item => {
      const days = calculateCumulativeTotal(item);
      if (days <= 0) return null;
      const nominal = days * 500;
      const nama = homeMap[item.nomor_rumah]?.nama || '-';
      return `No. ${item.nomor_rumah} - ${nama} | ${rupiahFormat(nominal)}`;
    })
    .filter(Boolean);

  const text = `Kekurangan bayar jimpitan s/d ${monthLabel} ${year}\n\n` + listTagihan.join('\n');
  console.log(text);
})();
