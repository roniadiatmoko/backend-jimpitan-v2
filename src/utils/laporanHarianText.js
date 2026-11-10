const hariList = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];

// Bangun teks laporan jimpitan harian, dipakai oleh kanal WhatsApp maupun Telegram
function buildLaporanHarianText(tanggal, laporanData, presensiRonda, footer, saldoInfo) {
  const namaHari = hariList[new Date(tanggal).getDay()];

  let personilRonda = "Penanggung Jawab Ronda:\n";
  personilRonda += presensiRonda
    .map((item, idx) => `${idx + 1}. ${item.nomor_rumah} - ${item.nama_penghuni}`)
    .join("\n");

  let laporanText = `*Laporan Jimpitan Harian*\n\n`;
  laporanText += `Tanggal: ${namaHari}, ${tanggal}\n\n`;
  laporanText += `${personilRonda}\n`;
  laporanText += `------------------------------------\n`;
  laporanText += `💰 Total Terkumpul: Rp ${Number(laporanData.totalUang || 0).toLocaleString("id-ID")}\n`;
  laporanText += `✅ Terisi: ${laporanData.totalTerisi} rumah\n`;
  laporanText += `📦 Sudah Rapel: ${laporanData.totalRapel} rumah\n`;
  laporanText += `❌ Tidak Terisi: ${laporanData.totalTidakTerisi} rumah\n`;
  if (saldoInfo && typeof saldoInfo.sisa_saldo === "number") {
    laporanText += `🏦 Sisa Saldo Kas: Rp ${Number(saldoInfo.sisa_saldo).toLocaleString("id-ID")}\n`;
  }
  laporanText += `------------------------------------\n\n`;
  laporanText += `*Detail Jimpitan Harian:*\n`;
  laporanData.laporan.forEach((item) => {
    const status =
      item.status_terisi == "Rapel" ? "Sudah Rapel" : item.status_terisi;
    laporanText += `- Rumah ${item.nomor_rumah} (${item.nama_pengisi}): *${status}*\n`;
  });
  laporanText += `------------------------------------\n\n`;
  laporanText += `_${footer}_\n`;

  return laporanText;
}

module.exports = { buildLaporanHarianText };
