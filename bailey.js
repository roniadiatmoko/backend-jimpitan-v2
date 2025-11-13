// baileys.js (CommonJS, siap untuk Baileys v7)
const P = require("pino");
const NodeCache = require("node-cache");
const qrcode = require("qrcode-terminal");
const { ambilLaporanHarian } = require("./db");

const logger = P({ level: "info" });
const msgRetryCounterCache = new NodeCache();

let sock = null;
let latestQr = null;
let starting = false;
let isConnected = false;
let connectionCallbacks = [];

// ====== API kecil untuk module lain ======
function onBotReady(callback) {
  if (isConnected) callback();
  else connectionCallbacks.push(callback);
}
function getLatestQr() {
  return latestQr;
}

// ====== START BOT ======
async function startBot() {
  if (starting) {
    logger.info("[startBot] already starting, skip");
    return;
  }
  starting = true;

  try {
    // Dynamic import karena Baileys v7 adalah ESM
    const baileys = await import("@whiskeysockets/baileys");
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      makeCacheableSignalKeyStore,
      DisconnectReason,
      fetchLatestBaileysVersion,
      // isPnUser // (opsional; pengganti isJidUser di v7)
    } = baileys;

    const AUTH_PATH = "./baileys_auth_info"; // pastikan writable
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    // Wajib: versi WA web terbaru (tanpa ini sering 405/QR tidak muncul)
    const { version } = await fetchLatestBaileysVersion();

    // IMPORTANT: jangan re-declare sock (pakai variable global)
    sock = makeWASocket({
      version,
      logger,
      browser: ["Ubuntu", "Chrome", "122.0.0"],
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      msgRetryCounterCache,
    });

    // simpan kredensial jika berubah
    sock.ev.on("creds.update", saveCreds);

    // koneksi lifecycle
    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        console.log("[QR] baru — scan dari terminal atau /qr");
        qrcode.generate(qr, { small: true }); // tampilkan di console
      }

      if (connection === "open") {
        isConnected = true;
        latestQr = null;
        console.log("[WA] OPEN ✅ — bot siap");
        connectionCallbacks.forEach((cb) => cb());
        connectionCallbacks = [];
      }

      if (connection === "close") {
        isConnected = false;
        const code =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.statusCode ??
          lastDisconnect?.error?.status ??
          lastDisconnect?.error?.code;

        const isLoggedOut = code === DisconnectReason.loggedOut || code === 401;

        console.log("[WA] CLOSE", { code, isLoggedOut });
        if (!isLoggedOut) {
          setTimeout(() => startBot(), 1500); // reconnect ringan
        } else {
          console.log(
            "Sesi logout. Hapus ./baileys_auth_info lalu scan ulang."
          );
        }
      }
    });

    // (opsional) bantu cari Group JID saat pesan masuk
    // sock.ev.on("messages.upsert", async ({ messages }) => {
    //   const m = messages?.[0];
    //   const jid = m?.key?.remoteJid;
    //   if (jid && !m?.key?.fromMe && jid.endsWith("@g.us")) {
    //     console.log("Group JID terdeteksi:", jid);
    //   }
    // });
  } catch (e) {
    console.error("[startBot] FATAL:", e);
  } finally {
    starting = false;
  }
}

// ====== KIRIM PESAN: TES ======
async function kirimTesWhatsApp(message) {
  try {
    if (!sock || !sock.user) {
      console.log("Bot belum terhubung. Silakan scan QR dulu.");
      return;
    }
    const groupId = process.env.GROUP_ID_TESTING; // contoh: 1203630xxx@g.us
    if (!groupId) {
      console.error("GROUP_ID_TESTING belum diset.");
      return;
    }
    await sock.sendMessage(groupId, { text: message });
    console.log("Pesan WhatsApp berhasil dikirim!");
  } catch (error) {
    console.error("Gagal mengirim pesan WhatsApp:", error);
  }
}

// ====== KIRIM LAPORAN ======
async function kirimLaporanWhatsApp(tanggal) {
  try {
    if (!sock || !sock.user) {
      console.log("Bot belum terhubung. Silakan scan QR dulu.");
      return;
    }

    const laporanData = await ambilLaporanHarian(tanggal);
    if (!laporanData || laporanData.laporan.length === 0) {
      console.log(`Tidak ada data jimpitan untuk tanggal ${tanggal}.`);
      return;
    }

    laporanData.laporan.sort(
      (a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah)
    );

    const hariList = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const d = new Date(tanggal);
    const namaHari = hariList[d.getDay()];

    let laporanText = `*Laporan Jimpitan Harian*\n\n`;
    laporanText += `Tanggal: ${namaHari}, ${tanggal}\n`;
    laporanText += `------------------------------------\n`;
    laporanText += `💰 Total Terkumpul: Rp ${laporanData.totalUang.toLocaleString()}\n`;
    laporanText += `✅ Terisi: ${laporanData.totalTerisi} rumah\n`;
    laporanText += `📦 Sudah Rapel: ${laporanData.totalRapel} rumah\n`;
    laporanText += `❌ Tidak Terisi: ${laporanData.totalTidakTerisi} rumah\n`;
    laporanText += `------------------------------------\n\n`;
    laporanText += `*Detail Jimpitan Harian:*\n`;
    laporanData.laporan.forEach((item) => {
      const status =
        item.status_terisi == "Rapel" ? "Sudah Rapel" : item.status_terisi;
      laporanText += `- Rumah ${item.nomor_rumah} (${item.nama_pengisi}): *${status}*\n`;
    });
    laporanText += `------------------------------------\n\n`;
    laporanText += `_Informasi: ini adalah pesan otomatis dari aplikasi jimpitan GBK Tempel 2_\n`;

    const groupId = process.env.GROUP_ID;
    if (!groupId) {
      console.error("GROUP_ID belum diset.");
      return;
    }

    await sock.sendMessage(groupId, { text: laporanText });
    console.log("Laporan WhatsApp berhasil dikirim!");
  } catch (error) {
    console.error("Gagal mengirim laporan WhatsApp:", error);
  }
}

// ====== RESEND ke grup testing ======
async function resendLaporanWhatsApp(tanggal) {
  try {
    if (!sock || !sock.user) {
      console.log("Bot belum terhubung. Silakan scan QR dulu.");
      return;
    }

    const presensiRonda = await getPresensiRondaByTanggal(tanggal);
    if (!presensiRonda || presensiRonda.length === 0) {
      console.log(`Tidak ada data presensi ronda untuk tanggal ${tanggal}.`);
      return;
    }

    presensiRonda.sort((a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah));

    let personilRonda = "Penanggung Jawab Ronda:\n";

    personilRonda += presensiRonda
      .map(
        (item, idx) => `${idx + 1}. ${item.nomor_rumah} - ${item.nama_penghuni}`
      )
      .join("\n");

    const laporanData = await ambilLaporanHarian(tanggal);
    if (!laporanData || laporanData.laporan.length === 0) {
      console.log(`Tidak ada data jimpitan untuk tanggal ${tanggal}.`);
      return;
    }

    laporanData.laporan.sort(
      (a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah)
    );

    const hariList = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const d = new Date(tanggal);
    const namaHari = hariList[d.getDay()];

    let laporanText = `*Laporan Jimpitan Harian*\n\n`;
    laporanText += `Tanggal: ${namaHari}, ${tanggal}\n\n`;
    laporanText += `${personilRonda}\n`;
    laporanText += `------------------------------------\n`;
    laporanText += `💰 Total Terkumpul: Rp ${laporanData.totalUang.toLocaleString()}\n`;
    laporanText += `✅ Terisi: ${laporanData.totalTerisi} rumah\n`;
    laporanText += `📦 Sudah Rapel: ${laporanData.totalRapel} rumah\n`;
    laporanText += `❌ Tidak Terisi: ${laporanData.totalTidakTerisi} rumah\n`;
    laporanText += `------------------------------------\n\n`;
    laporanText += `*Detail Jimpitan Harian:*\n`;
    laporanData.laporan.forEach((item) => {
      const status =
        item.status_terisi == "Rapel" ? "Sudah Rapel" : item.status_terisi;
      laporanText += `- Rumah ${item.nomor_rumah} (${item.nama_pengisi}): *${status}*\n`;
    });
    laporanText += `------------------------------------\n\n`;
    laporanText += `_Informasi: ini adalah pesan otomatis dari ujicoba aplikasi jimpitan GBK Tempel 2_\n`;

    const groupId = process.env.GROUP_ID_TESTING;
    if (!groupId) {
      console.error("GROUP_ID_TESTING belum diset.");
      return;
    }

    await sock.sendMessage(groupId, { text: laporanText });
    console.log("Laporan WhatsApp berhasil dikirim (testing)!");
  } catch (error) {
    console.error("Gagal mengirim laporan WhatsApp (testing):", error);
  }
}

module.exports = {
  startBot,
  onBotReady,
  getLatestQr,
  kirimTesWhatsApp,
  kirimLaporanWhatsApp,
  resendLaporanWhatsApp,
};
