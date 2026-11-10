const fs = require('fs');
const path = require('path');

const TOKEN = "eyJhIjoiNDQ2YjdjZjA4MmQ2ODFmZjM4ZTNjNTM1ZjM2MzFmOTEiLCJ0IjoiNDg3NjhmYmEtNjYwMy00ODkzLTg4MTctYzRlYTc5ZWQyMmM3IiwicyI6Ik9HWm1OVGhsTXpJdFltRTVOeTAwTURNMkxUazROMlF0T1Rnd01XWmtZMlUzWkdNeSJ9";

// ==========================================
// 1. SCRIPT jalankan-di-linux.sh (LF Line Endings)
// ==========================================
const bashScript = `#!/usr/bin/env bash
# ==============================================================
# Script Otomatis Jimpitan untuk Linux Mint (XFCE / Desktop)
# - Menyalin backend & frontend dari Flashdisk/HDD eksternal ke HDD Laptop (~/jimpitan)
# - Memastikan Node.js & Cloudflared tersedia
# - Menjalankan Backend (3000), Frontend (3001), dan Cloudflare Tunnel
# ==============================================================

set -e

SOURCE_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$HOME/jimpitan"
TOKEN="${TOKEN}"

echo "=========================================================="
echo "      SETUP & MENJALANKAN JIMPITAN DI LINUX MINT         "
echo "=========================================================="
echo "Direktori sumber : $SOURCE_DIR"
echo "Direktori target : $TARGET_DIR"
echo ""

# 1. Cek & Copy ke HDD Laptop jika dijalankan dari luar ~/jimpitan
if [ "$SOURCE_DIR" != "$TARGET_DIR" ]; then
    echo ">> [1/5] Menyalin file project ke HDD laptop ($TARGET_DIR)..."
    mkdir -p "$TARGET_DIR"

    # Salin backend & frontend (abaikan node_modules & baileys_auth_info agar cepat & tidak bentrok OS/sesi)
    if command -v rsync >/dev/null 2>&1; then
        rsync -av --exclude 'node_modules' --exclude '.git' --exclude 'baileys_auth_info' "$SOURCE_DIR/backend" "$TARGET_DIR/"
        rsync -av --exclude 'node_modules' --exclude '.git' "$SOURCE_DIR/frontend" "$TARGET_DIR/"
    else
        echo "   (Menggunakan cp...)"
        cp -r "$SOURCE_DIR/backend" "$TARGET_DIR/"
        cp -r "$SOURCE_DIR/frontend" "$TARGET_DIR/"
        rm -rf "$TARGET_DIR/backend/node_modules" "$TARGET_DIR/frontend/node_modules" "$TARGET_DIR/backend/baileys_auth_info"
    fi
    echo "   Selesai disalin ke HDD!"
else
    echo ">> [1/5] Sudah berada di HDD laptop ($TARGET_DIR), lewati penyalinan."
fi

# 2. Cek Prasyarat: Node.js 20+ & npm & curl
echo ""
echo ">> [2/5] Memeriksa Node.js & npm..."
NEED_NODE_INSTALL=false
CURRENT_MAJOR=0

if command -v node >/dev/null 2>&1; then
    NODE_RAW=$(node -v 2>/dev/null || echo "v0")
    CURRENT_MAJOR=$(echo "$NODE_RAW" | sed 's/[^0-9.]//g' | cut -d. -f1)
    echo "   Versi Node.js saat ini: $NODE_RAW"
    if [ -n "$CURRENT_MAJOR" ] && [ "$CURRENT_MAJOR" -lt 20 ]; then
        echo "   ⚠️ Node.js terdeteksi versi $CURRENT_MAJOR (< 20)."
        echo "      Aplikasi ini membutuhkan Node.js versi 20+. Repositori resmi NodeSource akan ditambahkan otomatis."
        NEED_NODE_INSTALL=true
    else
        echo "   ✅ Versi Node.js memenuhi syarat (>= 20)."
    fi
else
    echo "   Node.js belum terinstall di laptop ini."
    NEED_NODE_INSTALL=true
fi

if ! command -v npm >/dev/null 2>&1; then
    NEED_NODE_INSTALL=true
fi

if [ "$NEED_NODE_INSTALL" = true ]; then
    echo "   Menyiapkan instalasi Node.js 20.x dari repositori resmi NodeSource (membutuhkan password sudo)..."
    
    # 1. Pastikan curl, ca-certificates, gnupg terpasang
    if ! command -v curl >/dev/null 2>&1; then
        echo "   Menginstall curl & dependensi pendukung..."
        sudo apt-get update
        sudo apt-get install -y curl ca-certificates gnupg
    fi

    # 2. Hapus nodejs/npm versi distro lawas jika ada (agar tidak bentrok dengan paket NodeSource)
    if [ "$CURRENT_MAJOR" -gt 0 ] && [ "$CURRENT_MAJOR" -lt 20 ]; then
        echo "   Menghapus versi lama ($NODE_RAW) agar tidak terjadi konflik paket..."
        sudo apt-get remove -y nodejs npm 2>/dev/null || true
    fi

    # 3. Tambahkan repositori NodeSource 20.x
    echo "   Menambahkan repositori resmi NodeSource (Node.js 20.x)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

    # 4. Install nodejs (sudah termasuk npm) & build-essential (untuk kompilasi library native)
    echo "   Menginstall Node.js 20 & build tools..."
    sudo apt-get install -y nodejs build-essential

    echo "   ✅ Instalasi Node.js selesai: $(node -v 2>/dev/null) | npm $(npm -v 2>/dev/null)"
fi

NODE_VER=$(node -v)
echo "   Node.js aktif: $NODE_VER"

# 3. Persiapkan dependensi backend
echo ""
echo ">> [3/5] Memeriksa library backend..."
cd "$TARGET_DIR/backend"

if [ ! -d "node_modules" ]; then
    echo "   Menginstall dependensi backend untuk Linux (sqlite3, express, dll)..."
    npm install --omit=dev
elif ! node -e "require('sqlite3')" >/dev/null 2>&1; then
    echo "   Library native sqlite3 belum sesuai dengan versi Node.js saat ini. Menjalankan rebuild..."
    npm rebuild || npm install --omit=dev --force
else
    echo "   Library backend sudah siap."
fi

# 4. Cek & Siapkan Cloudflared untuk Linux
echo ""
echo ">> [4/5] Memeriksa Cloudflared..."
CLOUDFLARED_BIN=""

if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED_BIN="cloudflared"
elif [ -f "$TARGET_DIR/cloudflared" ]; then
    CLOUDFLARED_BIN="$TARGET_DIR/cloudflared"
else
    echo "   Mengunduh binary cloudflared untuk Linux..."
    ARCH="$(uname -m)"
    if [ "$ARCH" = "x86_64" ]; then
        curl -L -o "$TARGET_DIR/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
    else
        curl -L -o "$TARGET_DIR/cloudflared" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-386"
    fi
    chmod +x "$TARGET_DIR/cloudflared"
    CLOUDFLARED_BIN="$TARGET_DIR/cloudflared"
fi

echo "   Cloudflared siap: $CLOUDFLARED_BIN"

# 5. Jalankan Service (Backend, Frontend, Cloudflare Tunnel)
echo ""
echo ">> [5/5] Menyalakan Server & Tunnel..."

# Hentikan proses lama jika ada yang masih jalan
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
pkill -f "cloudflared tunnel run" 2>/dev/null || true
sleep 1

# Start Backend (Port 3000)
cd "$TARGET_DIR/backend"
PORT=3000 node index.js > "$TARGET_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   [+] Backend berjalan (PID: $BACKEND_PID, Port: 3000)"

# Start Frontend (Port 3001 via serve.js yang super ringan)
cd "$TARGET_DIR/frontend"
PORT=3001 node serve.js > "$TARGET_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "   [+] Frontend berjalan (PID: $FRONTEND_PID, Port: 3001)"

# Start Cloudflare Tunnel
"$CLOUDFLARED_BIN" tunnel run --token "$TOKEN" > "$TARGET_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!
echo "   [+] Cloudflare Tunnel berjalan (PID: $TUNNEL_PID)"

sleep 3

echo ""
echo "=========================================================="
echo "          JIMPITAN ONLINE & SIAP DIGUNAKAN!              "
echo "=========================================================="
echo "   Frontend Web   : https://jimpitan-gbk.roniadiatmoko.my.id"
echo "   Backend API    : https://api-jimpitan.roniadiatmoko.my.id"
echo "   Local Frontend : http://localhost:3001"
echo "   Local Backend  : http://localhost:3000"
echo "----------------------------------------------------------"
echo "   Lokasi file di HDD : $TARGET_DIR"
echo "   Log backend        : $TARGET_DIR/backend.log"
echo "   Log frontend       : $TARGET_DIR/frontend.log"
echo "   Log tunnel         : $TARGET_DIR/tunnel.log"
echo "=========================================================="
echo ""
echo "Membuka browser otomatis..."
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://jimpitan-gbk.roniadiatmoko.my.id" >/dev/null 2>&1 || true
fi

echo "Tekan [Ctrl + C] pada jendela ini jika ingin menghentikan server."

# Trap untuk mematikan semua background process saat Ctrl+C
trap "echo ''; echo 'Menghentikan semua server...'; kill $BACKEND_PID $FRONTEND_PID $TUNNEL_PID 2>/dev/null; exit 0" INT TERM

# Tetap jaga terminal tetap hidup
wait
`.replace(/\r\n/g, '\n');

// ==========================================
// 2. DESKTOP LAUNCHER Jalankan_Jimpitan.desktop
// ==========================================
const desktopEntry = `[Desktop Entry]
Version=1.0
Type=Application
Name=Jalankan Jimpitan
Comment=Salin ke HDD Laptop dan Jalankan Server Jimpitan + Cloudflare Tunnel
Exec=bash -c 'DIR="$(dirname "%k")"; cd "$DIR" && chmod +x ./jalankan-di-linux.sh && ./jalankan-di-linux.sh; read -p "Tekan Enter untuk keluar..."'
Icon=system-run
Terminal=true
Categories=Utility;Application;
`.replace(/\r\n/g, '\n');

// ==========================================
// 3. SCRIPT SERVICE install-service-otomatis.sh (Bonus Auto-start)
// ==========================================
const serviceScript = `#!/usr/bin/env bash
# ==============================================================
# Script Opsional: Pasang Jimpitan sebagai systemd service
# Agar otomatis jalan setiap kali laptop Linux dinyalakan
# ==============================================================

set -e

TARGET_DIR="$HOME/jimpitan"
TOKEN="${TOKEN}"
USER_NAME="$(whoami)"

if [ ! -d "$TARGET_DIR" ]; then
    echo "Folder $TARGET_DIR belum ada. Silakan jalankan ./jalankan-di-linux.sh terlebih dahulu."
    exit 1
fi

echo "Membuat service systemd untuk Jimpitan..."

sudo bash -c "cat << 'EOF' > /etc/systemd/system/jimpitan-backend.service
[Unit]
Description=Jimpitan Backend API
After=network.target

[Service]
Type=simple
User=\${USER_NAME}
WorkingDirectory=\${TARGET_DIR}/backend
Environment=PORT=3000
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

sudo bash -c "cat << 'EOF' > /etc/systemd/system/jimpitan-frontend.service
[Unit]
Description=Jimpitan Frontend Static Server
After=network.target

[Service]
Type=simple
User=\${USER_NAME}
WorkingDirectory=\${TARGET_DIR}/frontend
Environment=PORT=3001
ExecStart=/usr/bin/node serve.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable --now jimpitan-backend
sudo systemctl enable --now jimpitan-frontend

# Pasang cloudflared service resmi
if command -v cloudflared >/dev/null 2>&1; then
    sudo cloudflared service install "\${TOKEN}" || true
elif [ -f "$TARGET_DIR/cloudflared" ]; then
    sudo cp "$TARGET_DIR/cloudflared" /usr/local/bin/cloudflared
    sudo cloudflared service install "\${TOKEN}" || true
fi

echo ""
echo "=========================================================="
echo " Selamat! Jimpitan sudah terpasang sebagai SYSTEM SERVICE. "
echo " Sekarang aplikasi akan otomatis aktif setiap laptop hidup "
echo " tanpa perlu membuka terminal atau klik apapun!           "
echo "=========================================================="
`.replace(/\r\n/g, '\n');

// ==========================================
// 4. PANDUAN PENGGUNAAN (PANDUAN_LINUX.txt)
// ==========================================
const readmeTxt = `===================================================================
 PANDUAN MENJALANKAN JIMPITAN DI LAPTOP LINUX MINT XFCE
===================================================================

Cara 1: Sekali Klik (Paling Mudah)
----------------------------------
1. Colokkan Flashdisk/HDD eksternal ini ke laptop Linux Mint.
2. Buka folder "jimpitan".
3. Klik kanan pada file "jalankan-di-linux.sh" -> Properties -> tab "Permissions".
   Pastikan opsi "Allow executing file as program" dicentang.
4. Klik 2x pada "jalankan-di-linux.sh" dan pilih "Run in Terminal".
   (Atau klik 2x pada ikon "Jalankan Jimpitan.desktop").
5. Script akan otomatis:
   - Menyalin backend & frontend ke HDD laptop (~/jimpitan).
   - Memeriksa Node.js (jika belum ada atau masih versi < 20, script otomatis menambahkan repositori resmi NodeSource 20.x dan menginstallnya).
   - Mengunduh cloudflared jika belum ada.
   - Menjalankan Backend (3000), Frontend (3001), dan Tunnel Cloudflare.
   - Membuka browser ke https://jimpitan-gbk.roniadiatmoko.my.id.

Cara 2: Lewat Terminal
----------------------
Buka Terminal di Linux Mint, lalu ketik:
   cd /media/$USER/*/jimpitan
   bash jalankan-di-linux.sh

Cara 3: Otomatis Jalan Setiap Laptop Dinyalakan (Opsional)
---------------------------------------------------------
Jika laptop jadul ini difungsikan sebagai mini-server rumahan:
Setelah menjalankan Cara 1 atau 2 sekali, Anda bisa pasang service otomatis:
   cd ~/jimpitan
   bash install-service-otomatis.sh
Maka setiap kali laptop dinyalakan, server jimpitan & tunnel langsung online!

Catatan:
- Pastikan mematikan cloudflared di laptop Windows lama sebelum menyalakan di Linux Mint.
===================================================================
`;

// Tulis semua file ke folder e:/jimpitan/
fs.writeFileSync('e:/jimpitan/jalankan-di-linux.sh', bashScript, { encoding: 'utf8', mode: 0o755 });
fs.writeFileSync('e:/jimpitan/Jalankan Jimpitan.desktop', desktopEntry, { encoding: 'utf8', mode: 0o755 });
fs.writeFileSync('e:/jimpitan/install-service-otomatis.sh', serviceScript, { encoding: 'utf8', mode: 0o755 });
fs.writeFileSync('e:/jimpitan/PANDUAN_LINUX.txt', readmeTxt, { encoding: 'utf8' });

console.log('Semua file konfigurasi & script Linux berhasil dibuat di e:/jimpitan/');
