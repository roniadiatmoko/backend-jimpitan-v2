const fs = require("fs");
const path = require("path");
// baileys.js (CommonJS, siap untuk Baileys v6/v7)
const P = require("pino");
const NodeCache = require("node-cache");
const qrcode = require("qrcode-terminal");
const { ambilLaporanHarian } = require("./db");
const {
  getPresensiRondaByTanggal,
} = require("./src/features/presensi-ronda/model");
const { buildLaporanHarianText } = require("./src/utils/laporanHarianText");

const logger = P({ level: "warn" });
const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, useClones: false });
const messageStore = new NodeCache({ stdTTL: 24 * 3600, useClones: false });

const AUTH_PATH = path.join(__dirname, "baileys_auth_info");

let sock = null;
let latestQr = null;
let starting = false;
let isConnected = false;
let connectionCallbacks = [];

// Helper untuk simpan pesan ke messageStore (diperlukan getMessage saat WhatsApp minta retry)
function saveMessage(m) {
  if (!m || !m.key) return;
  const id = m.key.id;
  const remoteJid = m.key.remoteJid;
  if (id && m.message) {
    messageStore.set(id, m.message);
    if (remoteJid) {
      messageStore.set(`${remoteJid}:${id}`, m.message);
    }
  }
}

// Callback getMessage: kunci mengatasi "Waiting for this message. This may take a while"
async function getMessage(key) {
  if (!key) return undefined;
  const id = key.id;
  const remoteJid = key.remoteJid;
  const found =
    (remoteJid && messageStore.get(`${remoteJid}:${id}`)) ||
    (id && messageStore.get(id));
  return found || undefined;
}

// ====== API kecil untuk module lain ======
// Helper untuk memilih Target Group ID sesuai mode: Dev -> Testing Group, Prod -> Main Group
function getActiveGroupId() {
  const isProd =
    (process.env.ENV === "prod" || process.env.ENV === "production") &&
    process.env.ENABLE_PG_MIRROR === "true";
  return isProd
    ? (process.env.GROUP_ID || process.env.GROUP_ID_TESTING)
    : (process.env.GROUP_ID_TESTING || process.env.GROUP_ID);
}

function onBotReady(callback) {
  if (isConnected) callback();
  else connectionCallbacks.push(callback);
}
function getLatestQr() {
  return latestQr;
}
function getSock() {
  return sock;
}

// ====== START BOT ======
async function startBot() {
  if (starting) {
    logger.info("[startBot] already starting, skip");
    return;
  }
  if (sock && isConnected) {
    logger.info("[startBot] already connected, skip");
    return;
  }
  starting = true;

  try {
    const baileys = await import("@whiskeysockets/baileys");
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      makeCacheableSignalKeyStore,
      DisconnectReason,
      fetchLatestBaileysVersion,
      Browsers,
    } = baileys;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
    const { version } = await fetchLatestBaileysVersion();

    // Pastikan socket lama ditutup bersih jika ada
    if (sock) {
      try {
        sock.ev.removeAllListeners();
        sock.end(undefined);
      } catch (e) {}
      sock = null;
    }

    sock = makeWASocket({
      version,
      logger,
      browser: Browsers.ubuntu("Chrome"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      msgRetryCounterCache,
      getMessage,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 60000,
      generateHighQualityLinkPreview: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        latestQr = qr;
        console.log("[QR] baru — scan dari terminal atau dashboard /whatsapp");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        isConnected = true;
        latestQr = null;
        console.log("[WA] OPEN ✅ — bot siap & terhubung stabil");
        connectionCallbacks.forEach((cb) => cb());
        connectionCallbacks = [];
        return;
      }

      if (connection === "close") {
        isConnected = false;

        const code =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.statusCode ??
          lastDisconnect?.error?.status ??
          lastDisconnect?.error?.code;

        const reasonEntry = Object.entries(DisconnectReason).find(
          ([, v]) => v === code,
        );
        const reason = reasonEntry?.[0] || "unknown";

        console.log("[WA] CLOSE", { code, reason });

        sock = null;

        // 1) LOGGED OUT / 401 → Bersihkan sesi corrupted agar bisa scan ulang langsung
        if (code === DisconnectReason.loggedOut || code === 401) {
          console.log(
            "❌ Sesi logout / kedaluwarsa (401). Membersihkan data sesi lama...",
          );
          try {
            if (fs.existsSync(AUTH_PATH)) {
              fs.rmSync(AUTH_PATH, { recursive: true, force: true });
            }
          } catch (e) {
            console.error("Gagal membersihkan auth path:", e);
          }
          latestQr = null;
          // Otomatis start lagi agar QR code baru langsung tersedia di dashboard
          setTimeout(() => startBot(), 2000);
          return;
        }

        // 2) CONNECTION REPLACED / 440 → Ada koneksi lain, jangan loop reconnect
        if (code === DisconnectReason.connectionReplaced || code === 440) {
          console.log(
            "⚠️ Connection replaced (440). Ada sesi WhatsApp aktif lain. Menunggu 5 detik...",
          );
          setTimeout(() => startBot(), 5000);
          return;
        }

        // 3) RESTART REQUIRED / 515 → Boleh reconnect
        if (code === DisconnectReason.restartRequired || code === 515) {
          console.log("🔁 Restart required oleh WhatsApp, reconnect...");
          setTimeout(() => startBot(), 1500);
          return;
        }

        // 4) ERROR / NETWORK LAIN → Reconnect biasa
        console.log("🔁 Koneksi terputus (umum), coba reconnect...");
        setTimeout(() => startBot(), 2500);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        if (!messages || !messages.length) return;

        // Simpan setiap pesan masuk ke messageStore untuk keperluan retry WhatsApp
        for (const msgItem of messages) {
          saveMessage(msgItem);
        }

        const m = messages[0];
        if (!m || !m.message) return;
        if (m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        if (!remoteJid || remoteJid === "status@broadcast") return;

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.imageMessage?.caption ||
          "";

        const cleanText = text.trim();
        if (!cleanText) return;

        const isGroup = remoteJid.endsWith("@g.us");
        const senderJid = isGroup ? (m.key.participant || m.participant || remoteJid) : remoteJid;
        const pushName = m.pushName || "";
        const senderPn = m.key?.participantPn || m.key?.remoteJidAlt || m.participantPn || "";

        if (isGroup) {
          const lower = cleanText.toLowerCase();
          const isTriggered =
            lower.includes("@bot") ||
            lower.includes("jimpitan") ||
            lower.includes("kas ") ||
            lower.includes("tagihan") ||
            lower.includes("kekurangan") ||
            lower.includes("rapel") ||
            lower.includes("setor") ||
            lower.includes("hitung ulang") ||
            lower.includes("bayar") ||
            lower.includes("nara") ||
            lower === "ya" ||
            lower === "oke" ||
            lower === "ok" ||
            lower === "simpan" ||
            lower === "batal";
          if (!isTriggered) return;
        }

        console.log(`[WA Chat Masuk dari ${remoteJid} (Sender: ${senderJid}, PN: ${senderPn || "-"}, PushName: ${pushName || "-"})]: "${cleanText}"`);

        // Typing indicator
        try {
          await sock.sendPresenceUpdate("composing", remoteJid);
        } catch (e) {}

        const { prosesPesanDenganAI } = require("./src/services/aiService");
        const reply = await prosesPesanDenganAI(cleanText, remoteJid, senderJid, {
          pushName,
          senderPn,
          isGroup
        });

        try {
          await sock.sendPresenceUpdate("paused", remoteJid);
        } catch (e) {}

        let finalReply =
          reply ||
          "Halo! Nara belum menemukan data untuk pertanyaan tersebut 🙏😊. Coba tanyakan hal berikut ya:\n• *cek saldo jimpitan*\n• *laporan jimpitan kemarin*\n• *cek tagihan rumah [nomor]*";

        if (!finalReply.includes("Nara - Asisten Virtual Jimpitan GBK Tempel 2")) {
          finalReply = finalReply.trim() + "\n\n_Nara - Asisten Virtual Jimpitan GBK Tempel 2_";
        }

        const sendOptions = isGroup ? { quoted: m } : {};
        const sent = await sock.sendMessage(remoteJid, { text: finalReply }, sendOptions);
        if (sent) {
          saveMessage(sent);
        }
        console.log(`[WA AI Reply Berhasil Dikirim ke ${remoteJid}]`);
      } catch (err) {
        console.error("[WA AI Error handling message]:", err);
      }
    });
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
    const groupId = process.env.GROUP_ID_TESTING;
    if (!groupId) {
      console.error("GROUP_ID_TESTING belum diset.");
      return;
    }
    const sent = await sock.sendMessage(groupId, { text: message });
    if (sent) saveMessage(sent);
    console.log("Pesan WhatsApp berhasil dikirim!");
  } catch (error) {
    console.error("Gagal mengirim pesan WhatsApp:", error);
  }
}

// ====== KIRIM PESAN KE NOMOR INDIVIDU DENGAN DELAY ======
async function kirimPesanWhatsApp(pesan, no_hp) {
  try {
    if (!sock || !sock.user) {
      console.log("Bot belum terhubung. Menjalankan startBot dan menunggu koneksi...");
      startBot();
      await new Promise((resolve) => onBotReady(resolve));
    }

    let raw = String(no_hp || "").replace(/[^0-9]/g, "");
    if (!raw) throw new Error("Nomor telepon tidak valid");
    if (raw.startsWith("0")) raw = `62${raw.slice(1)}`;
    const jid = raw.includes("@") ? raw : `${raw}@s.whatsapp.net`;

    console.log(`Menunggu 15 detik sebelum mengirim pesan ke ${jid}...`);
    await new Promise((r) => setTimeout(r, 15000));

    const sent = await sock.sendMessage(jid, { text: pesan });
    if (sent) saveMessage(sent);
    console.log("Pesan WhatsApp berhasil dikirim ke", jid);
    return true;
  } catch (error) {
    console.error("Gagal mengirim pesan WhatsApp:", error);
    throw error;
  }
}

// ====== KIRIM LAPORAN ======
async function kirimLaporanWhatsApp(tanggal) {
  try {
    if (!sock || !sock.user) {
      console.log("Bot belum terhubung. Silakan scan QR dulu.");
      return;
    }

    const presensiRonda = await getPresensiRondaByTanggal(tanggal);
    if (!presensiRonda || presensiRonda.length === 0) {
      console.log(`Tidak ada data presensi ronda untuk tanggal ${tanggal}.`);
    } else {
      presensiRonda.sort(
        (a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah),
      );
    }

    const laporanData = await ambilLaporanHarian(tanggal);
    if (!laporanData || laporanData.laporan.length === 0) {
      console.log(`Tidak ada data jimpitan untuk tanggal ${tanggal}.`);
      return;
    }

    laporanData.laporan.sort(
      (a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah),
    );

    let saldoInfo = null;
    try {
      const { getSaldoTerkini } = require("./src/features/rekap/model");
      saldoInfo = await getSaldoTerkini();
    } catch (e) {
      console.warn("Gagal mengambil saldo terkini untuk laporan WA:", e.message);
    }

    const laporanText = buildLaporanHarianText(
      tanggal,
      laporanData,
      presensiRonda,
      "Informasi: ini adalah pesan otomatis dari aplikasi jimpitan GBK Tempel 2",
      saldoInfo,
    );

    const isProd = process.env.ENV === "prod" || process.env.ENV === "production";
    const groupId = getActiveGroupId();
    if (!groupId) {
      console.error("Target WhatsApp Group ID belum diset di .env.");
      return;
    }
    console.log(`[WA] Mengirim laporan (${isProd ? "PROD -> Grup Utama" : "DEV -> Grup Testing"}: ${groupId})...`);

    const sent = await sock.sendMessage(groupId, { text: laporanText });
    if (sent) saveMessage(sent);
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
    } else {
      presensiRonda.sort(
        (a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah),
      );
    }

    const laporanData = await ambilLaporanHarian(tanggal);
    if (!laporanData || laporanData.laporan.length === 0) {
      console.log(`Tidak ada data jimpitan untuk tanggal ${tanggal}.`);
      return;
    }

    laporanData.laporan.sort(
      (a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah),
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

    let saldoInfo = null;
    try {
      const { getSaldoTerkini } = require("./src/features/rekap/model");
      saldoInfo = await getSaldoTerkini();
    } catch (e) {
      console.warn("Gagal mengambil saldo terkini untuk resend WA:", e.message);
    }

    const laporanText = buildLaporanHarianText(
      tanggal,
      laporanData,
      presensiRonda,
      "Informasi: ini adalah pesan otomatis dari ujicoba aplikasi jimpitan GBK Tempel 2",
      saldoInfo,
    );

    const groupId = process.env.GROUP_ID_TESTING;
    if (!groupId) {
      console.error("GROUP_ID_TESTING belum diset.");
      return;
    }

    const sent = await sock.sendMessage(groupId, { text: laporanText });
    if (sent) saveMessage(sent);
    console.log("Laporan WhatsApp berhasil dikirim (testing)!");
  } catch (error) {
    console.error("Gagal mengirim laporan WhatsApp (testing):", error);
  }
}

function getBotStatus() {
  let phoneNumber = null;
  let userName = null;
  if (sock && sock.user) {
    const rawId = sock.user.id || "";
    phoneNumber = rawId.split(":")[0] || rawId.split("@")[0];
    userName = sock.user.name || null;
  }
  const hasAuth = fs.existsSync(AUTH_PATH);
  return {
    connected: isConnected,
    starting: starting,
    hasAuth: hasAuth,
    qr: latestQr || null,
    user: phoneNumber ? { phone: phoneNumber, name: userName } : null,
  };
}

async function logoutBot() {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (e) {
    console.warn("[logoutBot] error:", e.message);
  }
  sock = null;
  isConnected = false;
  latestQr = null;
  starting = false;
  try {
    if (fs.existsSync(AUTH_PATH)) {
      fs.rmSync(AUTH_PATH, { recursive: true, force: true });
      console.log("[logoutBot] baileys_auth_info removed.");
    }
  } catch (err) {
    console.error("[logoutBot] Gagal hapus auth info:", err);
  }
  return true;
}

async function restartBot() {
  if (sock) {
    try {
      sock.ev.removeAllListeners();
      sock.end(undefined);
    } catch (e) {}
    sock = null;
  }
  isConnected = false;
  latestQr = null;
  starting = false;
  await startBot();
  return true;
}

module.exports = {
  startBot,
  onBotReady,
  getLatestQr,
  getSock,
  kirimTesWhatsApp,
  kirimLaporanWhatsApp,
  getActiveGroupId,
  resendLaporanWhatsApp,
  kirimPesanWhatsApp,
  getBotStatus,
  logoutBot,
  restartBot,
};
