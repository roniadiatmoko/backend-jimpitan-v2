const db = require('../db.js');
const { getHitungKekuranganTahun } = require('../src/features/laporan/model.js');

const rupiahFormat = (number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(number);
};

async function test() {
  const warga = await db.ambilRefWarga();
  const homeMap = {};
  for (const w of warga) {
    homeMap[String(w.nomor)] = w;
  }
  const data = await getHitungKekuranganTahun(2026);
  const selectedEndMonth = 11;
  const monthLabel = 'November';
  const year = '2026';

  const months = [
    { value: 1, label: 'januari' },
    { value: 2, label: 'februari' },
    { value: 3, label: 'maret' },
    { value: 4, label: 'april' },
    { value: 5, label: 'mei' },
    { value: 6, label: 'juni' },
    { value: 7, label: 'juli' },
    { value: 8, label: 'agustus' },
    { value: 9, label: 'september' },
    { value: 10, label: 'oktober' },
    { value: 11, label: 'november' },
    { value: 12, label: 'desember' },
  ];

  const calculateCumulativeTotal = (item) => {
    let cumulative = 0;
    for (let i = 1; i <= selectedEndMonth; i++) {
      const month = months.find((m) => m.value === i);
      if (month) {
        cumulative += Number(item[month.label]) || 0;
      }
    }
    return cumulative;
  };

  const list = data.map(item => {
    const days = calculateCumulativeTotal(item);
    if (days <= 0) return null;
    const nominal = days * 500;
    const nama = homeMap[item.nomor_rumah]?.nama || '-';
    return {
      nomor: Number(item.nomor_rumah) || 0,
      text: 'No. ' + item.nomor_rumah + ' - ' + nama + ' | ' + rupiahFormat(nominal)
    };
  }).filter(Boolean);

  list.sort((a, b) => a.nomor - b.nomor);

  const copyText = [
    'Kekurangan bayar jimpitan s/d ' + monthLabel + ' ' + year,
    '',
    ...list.map(t => t.text)
  ].join('\n');

  console.log(copyText);
}
test();
