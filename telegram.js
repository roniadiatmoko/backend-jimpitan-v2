// telegram.js — kanal backup Telegram untuk laporan harian + rekap akhir bulan
const fs = require("fs");
const path = require("path");
const os = require("os");
const zlib = require("zlib");
const sqlite3 = require("sqlite3").verbose();
const { lastDayOfMonth, format, parseISO } = require("date-fns");
const { id: localeId } = require("date-fns/locale");

const { ambilLaporanHarian, ambilJimpitanPerBulan, ambilRapelBulanan, ambilPengeluaran } = require("./db");
const { getPresensiRondaByTanggal } = require("./src/features/presensi-ronda/model");
const { getPeriodeSebelumnya, getRekapByPeriode } = require("./src/features/rekap/model");
const { buildLaporanHarianText } = require("./src/utils/laporanHarianText");
const { sendTelegramMessage } = require("./src/utils/telegramSender");

const TELEGRAM_API = "https://api.telegram.org";
const DB_PATH = path.join(__dirname, "db.sqlite");

function formatRupiah(nominal) {
  return `Rp ${Number(nominal || 0).toLocaleString("id-ID")}`;
}

async function kirimPesanTelegram(text) {
  await sendTelegramMessage(text, { parseMode: "Markdown" });
}

async function kirimDokumenTelegram(buffer, filename, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ID_TELEGRAM;
  if (!token || !chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN / ID_TELEGRAM belum diset.");
  }

  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([buffer]), filename);

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  const json = await res.json();
  if (!json.ok) {
    throw new Error(`Telegram sendDocument error: ${json.description}`);
  }
}

// Backup laporan harian ke Telegram, selalu dikirim terlepas dari status WhatsApp
async function kirimLaporanTelegram(tanggal) {
  const presensiRonda = (await getPresensiRondaByTanggal(tanggal)) || [];
  presensiRonda.sort((a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah));

  const laporanData = await ambilLaporanHarian(tanggal);
  if (!laporanData || laporanData.laporan.length === 0) {
    throw new Error(`Tidak ada data jimpitan untuk tanggal ${tanggal}.`);
  }
  laporanData.laporan.sort((a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah));

  let saldoInfo = null;
  try {
    const { getSaldoTerkini } = require("./src/features/rekap/model");
    saldoInfo = await getSaldoTerkini();
  } catch (e) {
    console.warn("Gagal mengambil saldo terkini untuk laporan Telegram:", e.message);
  }

  const laporanText = buildLaporanHarianText(
    tanggal,
    laporanData,
    presensiRonda,
    "Informasi: ini adalah backup laporan otomatis dari aplikasi jimpitan GBK Tempel 2",
    saldoInfo,
  );

  await kirimPesanTelegram(laporanText);
  console.log(">>> Backup laporan harian berhasil dikirim ke Telegram.");
}

function isTanggalTerakhirBulan(tanggal) {
  const tanggalDate = parseISO(tanggal);
  const akhirBulan = lastDayOfMonth(tanggalDate);
  return format(tanggalDate, "yyyy-MM-dd") === format(akhirBulan, "yyyy-MM-dd");
}

async function hitungRekapBulanan(bulan) {
  const [tahun, bulanAngka] = bulan.split("-");
  const [jimpitanRows, rapelRows, pengeluaranRows, periodeSebelumnya] = await Promise.all([
    ambilJimpitanPerBulan(bulan),
    ambilRapelBulanan(bulan),
    ambilPengeluaran(bulan),
    Promise.resolve(getPeriodeSebelumnya(bulanAngka, tahun)),
  ]);

  const pemasukanHarian = jimpitanRows.reduce((sum, row) => sum + row.nominal, 0);
  const pemasukanRapel = rapelRows.reduce((sum, row) => sum + row.nominal, 0);
  const totalPemasukan = pemasukanHarian + pemasukanRapel;
  const totalPengeluaran = pengeluaranRows.reduce((sum, row) => sum + Number(row.nominal), 0);

  const rekapSebelumnya = await getRekapByPeriode(periodeSebelumnya.bulan, periodeSebelumnya.tahun);
  const saldoSebelumnya = rekapSebelumnya ? rekapSebelumnya.sisa_saldo : 0;
  const sisaSaldo = saldoSebelumnya + totalPemasukan - totalPengeluaran;

  return {
    pemasukanHarian,
    pemasukanRapel,
    totalPemasukan,
    totalPengeluaran,
    saldoSebelumnya,
    sisaSaldo,
  };
}

function namaBulanTahunFromBulan(bulan) {
  const tanggalDate = parseISO(`${bulan}-01`);
  return {
    namaBulanTahun: format(tanggalDate, "MMMM yyyy", { locale: localeId }),
    namaFileBulanTahun: format(tanggalDate, "MMMM-yyyy", { locale: localeId }),
  };
}

// Kirim rekap total pemasukan (harian & rapel), pengeluaran, dan sisa saldo bulan (yyyy-MM) ke Telegram
async function kirimRekapTelegram(bulan) {
  const { namaBulanTahun } = namaBulanTahunFromBulan(bulan);
  const rekap = await hitungRekapBulanan(bulan);

  let rekapText = `*Rekap Saldo Bulanan*\n\n`;
  rekapText += `Bulan: ${namaBulanTahun}\n`;
  rekapText += `------------------------------------\n`;
  rekapText += `💰 Pemasukan Harian: ${formatRupiah(rekap.pemasukanHarian)}\n`;
  rekapText += `📦 Pemasukan Rapel: ${formatRupiah(rekap.pemasukanRapel)}\n`;
  rekapText += `🧾 Total Pemasukan: ${formatRupiah(rekap.totalPemasukan)}\n`;
  rekapText += `💸 Pengeluaran: ${formatRupiah(rekap.totalPengeluaran)}\n`;
  rekapText += `🏦 Saldo Bulan Lalu: ${formatRupiah(rekap.saldoSebelumnya)}\n`;
  rekapText += `✅ Sisa Saldo: ${formatRupiah(rekap.sisaSaldo)}\n`;
  rekapText += `------------------------------------\n\n`;
  rekapText += `_Rekap otomatis akhir bulan dari aplikasi jimpitan GBK Tempel 2_\n`;

  await kirimPesanTelegram(rekapText);
  console.log(">>> Rekap bulanan berhasil dikirim ke Telegram.");
}

// Export db.sqlite untuk bulan (yyyy-MM) tertentu ke Telegram, nama file DB_<NamaBulan>-<Tahun>.sqlite
async function kirimDatabaseTelegram(bulan) {
  const { namaBulanTahun, namaFileBulanTahun } = namaBulanTahunFromBulan(bulan);

  const dbBuffer = fs.readFileSync(DB_PATH);
  const namaFileDb = `DB_${namaFileBulanTahun}.sqlite`;
  await kirimDokumenTelegram(dbBuffer, namaFileDb, `Backup database bulan ${namaBulanTahun}`);
  console.log(">>> Export database berhasil dikirim ke Telegram.");
}

// Kirim rekap bulanan + export db.sqlite ke Telegram, hanya jika tanggal adalah hari terakhir bulan
async function kirimRekapBulananJikaAkhirBulan(tanggal) {
  if (!isTanggalTerakhirBulan(tanggal)) return;

  const bulan = format(parseISO(tanggal), "yyyy-MM");
  await kirimRekapTelegram(bulan);
  await kirimDatabaseTelegram(bulan);
}


/**
 * Membuat snapshot database SQLite yang aman menggunakan SQLite VACUUM INTO
 * Dilanjutkan dengan kompresi GZIP untuk menghemat ukuran & kuota kirim
 */
async function createSafeDatabaseSnapshot() {
  const tempBackup = path
    .join(os.tmpdir(), `backup_temp_${Date.now()}.sqlite`)
    .replace(/\\/g, "/");
  const db = new sqlite3.Database(DB_PATH);

  try {
    await new Promise((resolve, reject) => {
      db.run(`VACUUM INTO '${tempBackup}'`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const rawBuffer = fs.readFileSync(tempBackup);
    const gzBuffer = zlib.gzipSync(rawBuffer);

    return {
      gzBuffer,
      rawSize: rawBuffer.length,
      gzSize: gzBuffer.length,
    };
  } finally {
    db.close();
    if (fs.existsSync(tempBackup)) {
      try {
        fs.unlinkSync(tempBackup);
      } catch (_) {}
    }
  }
}

/**
 * Kirim file backup database (.sqlite.gz) ke Telegram setiap selesai ronda harian
 * atau saat admin meminta backup manual
 */
async function kirimBackupDatabaseTelegram(tanggal) {
  const tglStr = tanggal || format(new Date(), "yyyy-MM-dd");
  const { gzBuffer, rawSize, gzSize } = await createSafeDatabaseSnapshot();

  const filename = `jimpitan_backup_${tglStr}.sqlite.gz`;
  const rawKB = (rawSize / 1024).toFixed(0);
  const gzKB = (gzSize / 1024).toFixed(0);
  const timeStr = format(new Date(), "dd-MM-yyyy HH:mm:ss");

  const caption =
    `📦 *Backup Database Harian (Off-Site Telegram)*\n` +
    `------------------------------------\n` +
    `📅 *Tanggal Ronda:* ${tglStr}\n` +
    `⏰ *Waktu Backup:* ${timeStr}\n` +
    `💾 *Ukuran File:* ${gzKB} KB (Asli: ${rawKB} KB, GZIP)\n` +
    `🔒 *Snapshot:* SQLite Online VACUUM (Anti-Corrupt)\n` +
    `------------------------------------\n` +
    `_Otomatis terkirim setelah petugas ronda menginput data jimpitan harian._`;

  await kirimDokumenTelegram(gzBuffer, filename, caption);
  console.log(`>>> Backup database (${filename}) berhasil dikirim ke Telegram.`);
  return {
    status: "OK",
    message: `Backup database (${filename}) berhasil dikirim ke Telegram.`,
    filename,
    raw_size_bytes: rawSize,
    gz_size_bytes: gzSize,
    sent_at: new Date().toISOString(),
  };
}

module.exports = {
  kirimPesanTelegram,
  kirimDokumenTelegram,
  kirimLaporanTelegram,
  kirimRekapTelegram,
  kirimDatabaseTelegram,
  kirimRekapBulananJikaAkhirBulan,
  kirimBackupDatabaseTelegram,
  createSafeDatabaseSnapshot,
};
