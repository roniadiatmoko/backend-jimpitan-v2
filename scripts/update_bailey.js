const fs = require('fs');
const target = 'e:/jimpitan/backend/bailey.js';
let code = fs.readFileSync(target, 'utf8');

const functionsToAdd = `
function getBotStatus() {
  let phoneNumber = null;
  let userName = null;
  if (sock && sock.user) {
    const rawId = sock.user.id || "";
    phoneNumber = rawId.split(":")[0] || rawId.split("@")[0];
    userName = sock.user.name || null;
  }
  const hasAuth = fs.existsSync("./baileys_auth_info");
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
    if (fs.existsSync("./baileys_auth_info")) {
      fs.rmSync("./baileys_auth_info", { recursive: true, force: true });
      console.log("[logoutBot] baileys_auth_info removed.");
    }
  } catch (err) {
    console.error("[logoutBot] Gagal hapus auth info:", err);
  }
  return true;
}

async function restartBot() {
  if (sock) {
    try { sock.end(undefined); } catch (e) {}
    sock = null;
  }
  isConnected = false;
  latestQr = null;
  starting = false;
  await startBot();
  return true;
}
`;

if (!code.includes('const fs = require("fs");')) {
  code = `const fs = require("fs");\n` + code;
}

if (!code.includes('function getBotStatus()')) {
  code = code.replace('module.exports = {', `${functionsToAdd}\nmodule.exports = {`);
  code = code.replace('kirimPesanWhatsApp,', `kirimPesanWhatsApp,\n  getBotStatus,\n  logoutBot,\n  restartBot,`);
}

fs.writeFileSync(target, code, 'utf8');
console.log('bailey.js updated successfully.');
