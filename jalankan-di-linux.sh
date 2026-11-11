#!/usr/bin/env bash
# ==============================================================
# SCRIPT ALL-IN-ONE JIMPITAN V2 (SETUP, UPDATE & JALANKAN)
# Linux Mint / Ubuntu / Debian Desktop
# ==============================================================
# Fungsi:
# 1. Mendeteksi & menginstal dependensi sistem (git, curl, psmisc, Node.js 20+, dll)
# 2. Otomatis clone / git pull dari GitHub baru (backend-jimpitan-v2 & jimpitan-v2)
# 3. Menjaga database lokal (db.sqlite), sesi WhatsApp, dan .env agar tidak hilang
# 4. Otomatis build frontend React jika ada perubahan
# 5. Menyiapkan cloudflared tunnel
# 6. Menjalankan Backend (3000), Frontend (3001), dan Cloudflare Tunnel
# ==============================================================

set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SOURCE_DIR/../backend" ] && [ -d "$SOURCE_DIR/../frontend" ]; then
    TARGET_DIR="$(cd "$SOURCE_DIR/.." && pwd)"
else
    TARGET_DIR="$HOME/jimpitan"
fi
TOKEN="eyJhIjoiNDQ2YjdjZjA4MmQ2ODFmZjM4ZTNjNTM1ZjM2MzFmOTEiLCJ0IjoiNDg3NjhmYmEtNjYwMy00ODkzLTg4MTctYzRlYTc5ZWQyMmM3IiwicyI6Ik9HWm1OVGhsTXpJdFltRTVOeTAwTURNMkxUazROMlF0T1Rnd01XWmtZMlUzWkdNeSJ9"
BACKEND_REPO="https://github.com/roniadiatmoko/backend-jimpitan-v2.git"
FRONTEND_REPO="https://github.com/roniadiatmoko/jimpitan-v2.git"

echo "=========================================================="
echo "       SETUP & UPDATE OTOMATIS JIMPITAN V2 (LINUX)       "
echo "=========================================================="
echo "Direktori Sumber: $SOURCE_DIR"
echo "Direktori Kerja : $TARGET_DIR"
echo ""

mkdir -p "$TARGET_DIR"

# Jika dijalankan dari luar ~/jimpitan (misal Flashdisk), sinkronkan file terbaru ke target
if [ "$SOURCE_DIR" != "$TARGET_DIR" ] && [ -d "$SOURCE_DIR/backend" ] && [ -d "$SOURCE_DIR/frontend" ]; then
    echo ">> [0/6] Terdeteksi dijalankan dari Flashdisk/Media Eksternal..."
    echo "   Menyalin update project terbaru ke HDD laptop ($TARGET_DIR)..."
    if command -v rsync >/dev/null 2>&1; then
        rsync -av --exclude 'node_modules' --exclude 'baileys_auth_info' "$SOURCE_DIR/backend" "$TARGET_DIR/"
        rsync -av --exclude 'node_modules' "$SOURCE_DIR/frontend" "$TARGET_DIR/"
    else
        cp -r "$SOURCE_DIR/backend" "$TARGET_DIR/"
        cp -r "$SOURCE_DIR/frontend" "$TARGET_DIR/"
        rm -rf "$TARGET_DIR/backend/node_modules" "$TARGET_DIR/frontend/node_modules" "$TARGET_DIR/backend/baileys_auth_info"
    fi
    echo "   ✅ File project berhasil disalin ke $TARGET_DIR."
    echo ""
fi

# --------------------------------------------------------------
# 1. PERIKSA & PERBAIKI DEPENDENSI SISTEM LINUX
# --------------------------------------------------------------
echo ">> [1/6] Memeriksa dependensi sistem Linux..."

NEED_APT=false
MISSING_PKGS=""

for pkg in git curl psmisc ca-certificates gnupg build-essential; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1 && ! command -v "$pkg" >/dev/null 2>&1; then
        NEED_APT=true
        MISSING_PKGS="$MISSING_PKGS $pkg"
    fi
done

if [ "$NEED_APT" = true ]; then
    echo "   ⚠️ Terdeteksi paket pendukung yang belum terpasang:$MISSING_PKGS"
    echo "   Memasang paket pendukung melalui apt (membutuhkan password sudo)..."
    sudo apt-get update
    sudo apt-get install -y $MISSING_PKGS
    echo "   ✅ Paket pendukung berhasil dipasang."
else
    echo "   ✅ Semua utilitas Linux (git, curl, fuser, build tools) siap."
fi

# --------------------------------------------------------------
# 2. PERIKSA & PERBAIKI NODE.JS (WAJIB >= 20)
# --------------------------------------------------------------
echo ""
echo ">> [2/6] Memeriksa versi Node.js & npm..."

NEED_NODE_INSTALL=false
CURRENT_MAJOR=0

if command -v node >/dev/null 2>&1; then
    NODE_RAW=$(node -v 2>/dev/null || echo "v0")
    CURRENT_MAJOR=$(echo "$NODE_RAW" | sed 's/[^0-9.]//g' | cut -d. -f1)
    echo "   Versi Node.js saat ini: $NODE_RAW"
    if [ -n "$CURRENT_MAJOR" ] && [ "$CURRENT_MAJOR" -lt 20 ]; then
        echo "   ⚠️ Node.js ($NODE_RAW) kurang dari versi 20. Diperlukan upgrade ke Node.js 20 LTS."
        NEED_NODE_INSTALL=true
    else
        echo "   ✅ Versi Node.js memenuhi syarat (>= 20)."
    fi
else
    echo "   ⚠️ Node.js belum terpasang."
    NEED_NODE_INSTALL=true
fi

if ! command -v npm >/dev/null 2>&1; then
    NEED_NODE_INSTALL=true
fi

if [ "$NEED_NODE_INSTALL" = true ]; then
    echo "   Menyiapkan instalasi Node.js 20.x dari repositori resmi NodeSource..."
    if [ "$CURRENT_MAJOR" -gt 0 ] && [ "$CURRENT_MAJOR" -lt 20 ]; then
        sudo apt-get remove -y nodejs npm 2>/dev/null || true
    fi
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs build-essential
    echo "   ✅ Node.js 20 berhasil dipasang: $(node -v) | npm $(npm -v)"
fi

# --------------------------------------------------------------
# 3. PERIKSA & UPDATE REPOSITORI GIT (BACKEND & FRONTEND)
# --------------------------------------------------------------
echo ""
echo ">> [3/6] Memeriksa & sinkronisasi kode dari GitHub..."

# Folder cadangan sementara untuk database & kredensial
BACKUP_DIR="/tmp/jimpitan_credential_bak"
mkdir -p "$BACKUP_DIR"

# A. BACKEND
echo "   [+] Memeriksa repositori Backend..."
if [ -d "$TARGET_DIR/backend/.git" ]; then
    cd "$TARGET_DIR/backend"
    git remote set-url origin "$BACKEND_REPO" 2>/dev/null || true
    echo "       Menarik pembaruan terbaru (git pull)..."
    git fetch origin main || true
    git merge origin/main --ff-only || git pull origin main || true
else
    echo "       Menyiapkan repositori Backend pertama kali..."
    # Amankan file penting jika folder sudah ada
    if [ -f "$TARGET_DIR/backend/.env" ]; then cp "$TARGET_DIR/backend/.env" "$BACKUP_DIR/backend.env"; fi
    if [ -f "$TARGET_DIR/backend/db.sqlite" ]; then cp "$TARGET_DIR/backend/db.sqlite" "$BACKUP_DIR/db.sqlite"; fi
    if [ -d "$TARGET_DIR/backend/baileys_auth_info" ]; then cp -r "$TARGET_DIR/backend/baileys_auth_info" "$BACKUP_DIR/"; fi

    if [ -d "$TARGET_DIR/backend" ]; then
        cd "$TARGET_DIR/backend"
        git init
        git remote add origin "$BACKEND_REPO" 2>/dev/null || git remote set-url origin "$BACKEND_REPO"
        git fetch origin main
        git checkout -f -B main origin/main
    else
        git clone "$BACKEND_REPO" "$TARGET_DIR/backend"
    fi

    # Pulihkan file penting
    if [ -f "$BACKUP_DIR/backend.env" ]; then cp "$BACKUP_DIR/backend.env" "$TARGET_DIR/backend/.env"; fi
    if [ -f "$BACKUP_DIR/db.sqlite" ]; then cp "$BACKUP_DIR/db.sqlite" "$TARGET_DIR/backend/db.sqlite"; fi
    if [ -d "$BACKUP_DIR/baileys_auth_info" ]; then cp -r "$BACKUP_DIR/baileys_auth_info" "$TARGET_DIR/backend/"; fi
fi

# Pastikan .env backend ada
if [ ! -f "$TARGET_DIR/backend/.env" ]; then
    if [ -f "$SOURCE_DIR/backend/.env" ]; then
        echo "       ⚠️ .env backend belum ada di target. Menyalin dari direktori sumber..."
        cp "$SOURCE_DIR/backend/.env" "$TARGET_DIR/backend/.env"
    else
        echo "       ⚠️ .env backend belum ada. Membuat dari .env.example..."
        cp "$TARGET_DIR/backend/.env.example" "$TARGET_DIR/backend/.env"
    fi
fi

# Auto-heal & sinkronisasi variabel penting di .env backend
echo "       [+] Memeriksa kelengkapan variabel di backend/.env..."
ENV_FILE="$TARGET_DIR/backend/.env"
sync_env_var() {
    local key="$1"
    local val="$2"
    if [ -f "$ENV_FILE" ] && ! grep -q "^[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null; then
        echo "           -> Menambahkan parameter konfigurasi: ${key}"
        echo "${key}=\"${val}\"" >> "$ENV_FILE"
    fi
}

sync_env_var "ADMIN_PHONE_NUMBER" "6289673378055"
sync_env_var "FAMILY_PHONE_IBU" "6285867402287"
sync_env_var "KEUANGAN_RUMAH_PINS" "8055,2287,1234"
sync_env_var "ADMIN_USERS" "menterijimpitan:menterijimpitan:Menteri Jimpitan,ketua:kepalasuku:Ketua Paguyuban"
sync_env_var "API_SECRET_KEY" "rahasiakita123"
if [ -n "$TOKEN" ]; then
    sync_env_var "CLOUDFLARE_TUNNEL_TOKEN" "$TOKEN"
fi

# B. FRONTEND
echo "   [+] Memeriksa repositori Frontend..."
FRONTEND_UPDATED=false

if [ -d "$TARGET_DIR/frontend/.git" ]; then
    cd "$TARGET_DIR/frontend"
    git remote set-url origin "$FRONTEND_REPO" 2>/dev/null || true
    OLD_HASH=$(git rev-parse HEAD 2>/dev/null || echo "lama")
    git fetch origin main 2>/dev/null || true
    git merge origin/main --ff-only 2>/dev/null || git pull origin main 2>/dev/null || true
    NEW_HASH=$(git rev-parse HEAD 2>/dev/null || echo "baru")
    if [ "$OLD_HASH" != "$NEW_HASH" ]; then
        FRONTEND_UPDATED=true
    fi
else
    echo "       Menyiapkan repositori Frontend pertama kali..."
    if [ -d "$TARGET_DIR/frontend" ]; then
        cd "$TARGET_DIR/frontend"
        git init 2>/dev/null || true
        git remote add origin "$FRONTEND_REPO" 2>/dev/null || git remote set-url origin "$FRONTEND_REPO" 2>/dev/null || true
        git fetch origin main 2>/dev/null || true
        git checkout -f -B main origin/main 2>/dev/null || true
    else
        git clone "$FRONTEND_REPO" "$TARGET_DIR/frontend" 2>/dev/null || true
    fi
    FRONTEND_UPDATED=true
fi

# Pastikan .env frontend ada
if [ ! -f "$TARGET_DIR/frontend/.env" ]; then
    if [ -f "$SOURCE_DIR/frontend/.env" ]; then
        cp "$SOURCE_DIR/frontend/.env" "$TARGET_DIR/frontend/.env"
    else
        cp "$TARGET_DIR/frontend/.env.example" "$TARGET_DIR/frontend/.env"
    fi
fi

FE_ENV_FILE="$TARGET_DIR/frontend/.env"
sync_fe_env_var() {
    local key="$1"
    local val="$2"
    if [ -f "$FE_ENV_FILE" ] && ! grep -q "^[[:space:]]*${key}=" "$FE_ENV_FILE" 2>/dev/null; then
        echo "${key}=\"${val}\"" >> "$FE_ENV_FILE"
    fi
}
sync_fe_env_var "REACT_APP_API_SECRET_KEY" "rahasiakita123"

echo "   ✅ Kode Backend & Frontend siap."

# --------------------------------------------------------------
# 4. PASANG & PERBAIKI DEPENDENSI NPM (BACKEND & FRONTEND)
# --------------------------------------------------------------
echo ""
echo ">> [4/6] Memeriksa library & modul Node.js..."

# A. Backend npm
cd "$TARGET_DIR/backend"
if [ ! -d "node_modules" ]; then
    echo "   Memasang dependensi backend (npm install)..."
    npm install --omit=dev
elif ! node -e "require('sqlite3')" >/dev/null 2>&1; then
    echo "   ⚠️ Native sqlite3 perlu rebuild untuk environment Linux ini..."
    npm rebuild sqlite3 || npm install --omit=dev --force
else
    echo "   Library backend siap."
fi

# Inisialisasi skema database & akun pengurus (tabel users)
echo "   Memverifikasi tabel database & akun pengurus..."
node -e "require('./db')" >/dev/null 2>&1 || true

# B. Frontend build
cd "$TARGET_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "   Memasang dependensi frontend..."
    npm install
    FRONTEND_UPDATED=true
fi

if [ "$FRONTEND_UPDATED" = true ] || [ ! -d "$TARGET_DIR/frontend/build" ]; then
    echo "   Mengompilasi bundle antarmuka web (npm run build)..."
    npm run build
    echo "   ✅ Kompilasi frontend selesai."
else
    echo "   Bundle build frontend sudah siap."
fi

# --------------------------------------------------------------
# 5. PERIKSA CLOUDFLARED
# --------------------------------------------------------------
echo ""
echo ">> [5/6] Memeriksa Cloudflared Tunnel..."
CLOUDFLARED_BIN=""

if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED_BIN="cloudflared"
elif [ -f "$TARGET_DIR/cloudflared" ]; then
    CLOUDFLARED_BIN="$TARGET_DIR/cloudflared"
else
    echo "   Mengunduh binary Cloudflared untuk Linux..."
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

# --------------------------------------------------------------
# 6. MENYALAKAN SERVER (BACKEND, FRONTEND, TUNNEL)
# --------------------------------------------------------------
echo ""
echo ">> [6/6] Menjalankan Server Jimpitan..."

# Matikan proses lama jika ada
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3001/tcp 2>/dev/null || true
pkill -f "cloudflared tunnel run" 2>/dev/null || true
sleep 1

# Start Backend (Port 3000)
cd "$TARGET_DIR/backend"
PORT=3000 node index.js > "$TARGET_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "   [+] Backend aktif (PID: $BACKEND_PID, Port: 3000)"

# Start Frontend (Port 3001 via serve.js)
cd "$TARGET_DIR/frontend"
PORT=3001 node serve.js > "$TARGET_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "   [+] Frontend aktif (PID: $FRONTEND_PID, Port: 3001)"

# Start Cloudflare Tunnel
"$CLOUDFLARED_BIN" tunnel run --token "$TOKEN" > "$TARGET_DIR/tunnel.log" 2>&1 &
TUNNEL_PID=$!
echo "   [+] Cloudflare Tunnel aktif (PID: $TUNNEL_PID)"

sleep 2

echo ""
echo "=========================================================="
echo "          JIMPITAN V2 BERJALAN & SIAP DIGUNAKAN!         "
echo "=========================================================="
echo "   Publik Web     : https://jimpitan-gbk.roniadiatmoko.my.id"
echo "   Publik API     : https://api-jimpitan.roniadiatmoko.my.id"
echo "   Lokal Web      : http://localhost:3001"
echo "   Lokal API      : http://localhost:3000"
echo "----------------------------------------------------------"
echo "   Direktori File : $TARGET_DIR"
echo "   Log Backend    : $TARGET_DIR/backend.log"
echo "   Log Frontend   : $TARGET_DIR/frontend.log"
echo "   Log Tunnel     : $TARGET_DIR/tunnel.log"
echo "=========================================================="
echo ""

if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://jimpitan-gbk.roniadiatmoko.my.id" >/dev/null 2>&1 || true
fi

echo "Tekan [Ctrl + C] untuk mematikan server."
trap "echo ''; echo 'Mematikan server...'; kill $BACKEND_PID $FRONTEND_PID $TUNNEL_PID 2>/dev/null; exit 0" INT TERM
wait
