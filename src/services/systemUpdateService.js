const { exec, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const backendDir = path.resolve(__dirname, "../../");
const rootDir = path.resolve(backendDir, "../");
const frontendDir = path.resolve(rootDir, "frontend");

function runCommand(cmd, cwd, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout: timeoutMs, maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return reject({
          error: err.message,
          stdout: stdout ? stdout.trim() : "",
          stderr: stderr ? stderr.trim() : "",
        });
      }
      resolve({
        stdout: stdout ? stdout.trim() : "",
        stderr: stderr ? stderr.trim() : "",
      });
    });
  });
}

function safeGit(cmd, cwd) {
  try {
    return execSync(cmd, { cwd, encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return "-";
  }
}

async function getSystemInfo() {
  const isLinux = process.platform === "linux";

  const backendInfo = {
    branch: safeGit("git branch --show-current", backendDir),
    commit: safeGit("git rev-parse --short HEAD", backendDir),
    commitMessage: safeGit("git log -1 --format=%s", backendDir),
    commitDate: safeGit("git log -1 --format=%cd --date=iso", backendDir),
  };

  const frontendInfo = {
    branch: safeGit("git branch --show-current", frontendDir),
    commit: safeGit("git rev-parse --short HEAD", frontendDir),
    commitMessage: safeGit("git log -1 --format=%s", frontendDir),
    commitDate: safeGit("git log -1 --format=%cd --date=iso", frontendDir),
  };

  // Cek apakah ada remote update
  let updateAvailable = false;
  let remoteBackendCommit = "-";
  let remoteFrontendCommit = "-";

  try {
    execSync("git fetch origin main", { cwd: backendDir, timeout: 7000 });
    const localBack = safeGit("git rev-parse HEAD", backendDir);
    const remoteBack = safeGit("git rev-parse origin/main", backendDir);
    remoteBackendCommit = safeGit("git rev-parse --short origin/main", backendDir);

    execSync("git fetch origin main", { cwd: frontendDir, timeout: 7000 });
    const localFront = safeGit("git rev-parse HEAD", frontendDir);
    const remoteFront = safeGit("git rev-parse origin/main", frontendDir);
    remoteFrontendCommit = safeGit("git rev-parse --short origin/main", frontendDir);

    if (localBack !== remoteBack || localFront !== remoteFront) {
      updateAvailable = true;
    }
  } catch (err) {
    // Abaikan jika offline
  }

  // Cek apakah build frontend tersedia
  const buildExists = fs.existsSync(path.join(frontendDir, "build", "index.html"));

  return {
    platform: process.platform,
    isLinux,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    backend: backendInfo,
    frontend: frontendInfo,
    updateAvailable,
    remoteBackendCommit,
    remoteFrontendCommit,
    buildExists,
    serverTime: new Date().toISOString(),
  };
}

async function executeSelfUpdate() {
  const logs = [];

  const addLog = (step, title, details = "") => {
    logs.push({
      step,
      title,
      details,
      timestamp: new Date().toLocaleTimeString("id-ID"),
    });
    console.log(`[UPDATE STEP ${step}] ${title} ${details ? "- " + details : ""}`);
  };

  try {
    // 1. Git pull Backend
    addLog(1, "Menarik pembaruan BACKEND dari GitHub (git pull origin main)...");
    const backPull = await runCommand("git pull origin main", backendDir);
    addLog(1, "Pembaruan Backend berhasil ditarik", backPull.stdout.split("\n")[0]);

    // 2. npm install Backend
    addLog(2, "Memeriksa dependensi Backend (npm install --omit=dev)...");
    const backNpm = await runCommand("npm install --omit=dev", backendDir, 60000);
    addLog(2, "Dependensi Backend siap", backNpm.stdout ? backNpm.stdout.split("\n")[0] : "OK");

    // 3. Git pull Frontend
    addLog(3, "Menarik pembaruan FRONTEND dari GitHub (git pull origin main)...");
    const frontPull = await runCommand("git pull origin main", frontendDir);
    addLog(3, "Pembaruan Frontend berhasil ditarik", frontPull.stdout.split("\n")[0]);

    // 4. npm install Frontend
    addLog(4, "Memeriksa dependensi Frontend (npm install)...");
    await runCommand("npm install", frontendDir, 90000);
    addLog(4, "Dependensi Frontend selesai diperiksa");

    // 5. npm run build Frontend
    addLog(5, "Membangun ulang (build produksi) Frontend React...");
    const frontBuild = await runCommand("npm run build", frontendDir, 240000);
    addLog(5, "Kompilasi Frontend selesai", frontBuild.stdout ? "Folder build berhasil diperbarui" : "OK");

    // 6. Siapkan restart
    addLog(6, "Menjadwalkan restart server otomatis...");

    // Jadwalkan restart 2.5 detik setelah respons dikirim
    setTimeout(() => {
      console.log(">>> [SYSTEM UPDATE] Me-restart server sekarang...");
      if (process.platform === "linux") {
        try {
          exec("sudo systemctl restart jimpitan-backend jimpitan-frontend");
        } catch {
          process.exit(0);
        }
      } else {
        process.exit(0);
      }
    }, 2500);

    return {
      status: "OK",
      message: "Pembaruan aplikasi berhasil diselesaikan! Server sedang memuat ulang...",
      logs,
      restartInSeconds: 3,
    };
  } catch (err) {
    addLog(99, "Gagal memperbarui aplikasi", err.error || err.stderr || err.message || JSON.stringify(err));
    return {
      status: "ERROR",
      message: "Terjadi kesalahan saat memproses pembaruan aplikasi.",
      error: err.error || err.stderr || err.message,
      logs,
    };
  }
}

module.exports = {
  getSystemInfo,
  executeSelfUpdate,
};
