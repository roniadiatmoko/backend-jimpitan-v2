const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");
const { pino } = require("pino");
const NodeCache = require("node-cache");
const qrcode = require("qrcode-terminal"); // Import library qrcode-terminal
const { ambilLaporanHarian } = require("./db");

// Gunakan cache untuk meningkatkan performa
const msgRetryCounterCache = new NodeCache();
const logger = pino({ level: "info" }); // Aktifkan log pino agar terlihat prosesnya

let sock;
let isConnected = false;
let connectionCallbacks = [];

// Function to notify when bot is ready
function onBotReady(callback) {
  if (isConnected) {
    callback();
  } else {
    connectionCallbacks.push(callback);
  }
}

// Fungsi untuk memulai koneksi ke WhatsApp
async function startBot() {
  console.log(">>> Fungsi startBot dipanggil...");

  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");

  sock = makeWASocket({
    logger,
    printQRInTerminal: false, // Opsi ini sudah tidak digunakan
    browser: ["Replit", "Safari", "1.0.0"],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache,
  });

  // Simpan kredensial saat ada perubahan
  sock.ev.on("creds.update", saveCreds);

  // Tangani event koneksi
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    // CARA BARU UNTUK MENAMPILKAN QR CODE DENGAN qrcode-terminal
    if (qr) {
      console.log("Silakan scan QR Code ini untuk menghubungkan bot:");
      qrcode.generate(qr, { small: true }); // Tampilkan QR code di terminal
    }

    if (connection === "close") {
      isConnected = false;
      const shouldReconnect = lastDisconnect.error?.output?.statusCode !== 401;
      console.log(
        "Koneksi terputus. Mencoba terhubung kembali...",
        lastDisconnect.error,
      );
      if (shouldReconnect) {
        startBot();
      }
    } else if (connection === "open") {
      isConnected = true;
      console.log("Koneksi berhasil! Bot siap digunakan.");
      
      // Trigger all waiting callbacks
      connectionCallbacks.forEach(callback => callback());
      connectionCallbacks = [];
    }
  });

  // FUNGSI BARU: Mendengarkan pesan untuk mendapatkan ID grup
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];
    if (!message.key.fromMe) {
      const jid = jidNormalizedUser(message.key.remoteJid);

      // Periksa apakah pesan berasal dari grup
      if (jid.endsWith("@g.us")) {
        console.log("------------------------------------");
        console.log(">> Ditemukan ID Grup:");
        console.log(
          ">> Salin ID ini dan tempelkan di Replit Secrets sebagai GROUP_ID",
        );
        console.log(">>", jid);
        console.log("------------------------------------");
      }
    }
  });
}

// Fungsi utama yang akan dipanggil dari index.js untuk mengirim laporan
async function kirimLaporanWhatsApp(tanggal) {
  try {
    if (!sock || !sock.user) {
      console.log(
        "Bot WhatsApp belum terhubung. Silakan scan QR code terlebih dahulu.",
      );
      return;
    }

    const laporanData = await ambilLaporanHarian(tanggal);
    if (!laporanData || laporanData.laporan.length === 0) {
      console.log(`Tidak ada data jimpitan untuk tanggal ${tanggal}.`);
      return;
    }

    // Mengurutkan data berdasarkan nomor rumah secara numerik
    laporanData.laporan.sort(
      (a, b) => parseInt(a.nomor_rumah) - parseInt(b.nomor_rumah),
    );

    // Format pesan laporan
    let laporanText = `*Laporan Jimpitan Harian*\n\n`;
    laporanText += `Tanggal: ${tanggal}\n`;
    laporanText += `------------------------------------\n`;
    laporanText += `💰 Total Terkumpul: Rp ${laporanData.totalUang.toLocaleString()}\n`;
    laporanText += `✅ Terisi: ${laporanData.totalTerisi} rumah\n`;
    laporanText += `❌ Tidak Terisi: ${laporanData.totalTidakTerisi} rumah(Untuk yang sudah rapel bulanan mohon abaikan)\n`;
    laporanText += `------------------------------------\n\n`;
    laporanText += `*Detail Jimpitan Harian:*\n`;

    laporanData.laporan.forEach((item) => {
      laporanText += `- Rumah ${item.nomor_rumah} (${item.nama_pengisi}): *${item.status_terisi}*\n`;
    });

    laporanText += `------------------------------------\n\n`;
    laporanText += `_Informasi: ini adalah pesan otomatis dari ujicoba aplikasi jimpitan GBK Tempel 2_\n`;

    const groupId = process.env.GROUP_ID;
    if (!groupId) {
      console.error(
        "Environment variable GROUP_ID tidak ditemukan. Mohon tambahkan di Replit Secrets.",
      );
      return;
    }

    // Kirim laporan ke grup
    await sock.sendMessage(groupId, { text: laporanText });
    console.log("Laporan WhatsApp berhasil dikirim!");
  } catch (error) {
    console.error("Gagal mengirim laporan WhatsApp:", error);
  }
}

// Ekspor fungsi
module.exports = {
  startBot,
  kirimLaporanWhatsApp,
  onBotReady,
};
