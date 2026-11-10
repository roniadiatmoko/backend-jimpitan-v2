const fs = require('fs');
const target = 'e:/jimpitan/backend/bailey.js';
let code = fs.readFileSync(target, 'utf8');

const listenerCode = `
    // ====== LISTENER PESAN MASUK & AI INTERACTIVE BOT ======
    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        const m = messages?.[0];
        if (!m || !m.message) return;
        if (m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        if (!remoteJid) return;

        // Jangan proses status broadcast (story)
        if (remoteJid === "status@broadcast") return;

        const text =
          m.message.conversation ||
          m.message.extendedTextMessage?.text ||
          m.message.imageMessage?.caption ||
          "";

        const cleanText = text.trim();
        if (!cleanText) return;

        const isGroup = remoteJid.endsWith("@g.us");
        if (isGroup) {
          const lower = cleanText.toLowerCase();
          const isTriggered =
            lower.includes("@bot") ||
            lower.includes("jimpitan") ||
            lower.includes("kas ") ||
            lower.includes("tagihan") ||
            lower.includes("kekurangan");
          if (!isTriggered) return;
        }

        console.log(\`[WA Chat Masuk dari \${remoteJid}]: "\${cleanText}"\`);

        // Typing indicator
        try {
          await sock.sendPresenceUpdate("composing", remoteJid);
        } catch (e) {}

        const { prosesPesanDenganAI } = require("./src/services/aiService");
        const reply = await prosesPesanDenganAI(cleanText, remoteJid);

        try {
          await sock.sendPresenceUpdate("paused", remoteJid);
        } catch (e) {}

        if (reply) {
          await sock.sendMessage(remoteJid, { text: reply }, { quoted: m });
          console.log(\`[WA AI Reply Berhasil Dikirim ke \${remoteJid}]\`);
        }
      } catch (err) {
        console.error("[WA AI Error handling message]:", err);
      }
    });
`;

if (!code.includes('prosesPesanDenganAI')) {
  code = code.replace(
    '// (opsional) bantu cari Group JID saat pesan masuk',
    `${listenerCode}\n    // (opsional) bantu cari Group JID saat pesan masuk`
  );
  fs.writeFileSync(target, code, 'utf8');
  console.log('bailey.js wired with AI listener successfully.');
} else {
  console.log('Already wired.');
}
