#!/usr/bin/env bash
# ==============================================================
# SCRIPT UPDATE OTOMATIS JIMPITAN UNTUK LINUX MINT / SERVER
# ==============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/../backend" ] && [ -d "$SCRIPT_DIR/../frontend" ]; then
    ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
elif [ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/frontend" ]; then
    ROOT_DIR="$SCRIPT_DIR"
else
    ROOT_DIR="$HOME/jimpitan"
fi

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "=========================================================="
echo "       MEMULAI UPDATE OTOMATIS APLIKASI JIMPITAN          "
echo "=========================================================="
echo "Waktu       : $(date)"
echo "Root folder : $ROOT_DIR"
echo ""

# 1. Update Backend dari GitHub
echo ">> [1/5] Menarik update BACKEND dari GitHub (git pull origin main)..."
cd "$BACKEND_DIR"
git pull origin main
echo "   Commit backend saat ini: $(git rev-parse --short HEAD)"
echo ""

# 2. Update Dependensi Backend
echo ">> [2/5] Memeriksa & menginstall dependensi BACKEND..."
npm install --omit=dev
echo "   Dependensi backend siap."

# Pastikan parameter .env backend lengkap & ter-update
ENV_FILE="$BACKEND_DIR/.env"
sync_env_var() {
    local key="$1"
    local val="$2"
    if [ -f "$ENV_FILE" ] && ! grep -q "^[[:space:]]*${key}=" "$ENV_FILE" 2>/dev/null; then
        echo "   [+] Menambahkan parameter konfigurasi baru: ${key}"
        echo "${key}=\"${val}\"" >> "$ENV_FILE"
    fi
}
sync_env_var "ADMIN_PHONE_NUMBER" "6289673378055"
sync_env_var "FAMILY_PHONE_IBU" "6285867402287"
sync_env_var "KEUANGAN_RUMAH_PINS" "8055,2287,1234"
sync_env_var "ADMIN_USERS" "menterijimpitan:menterijimpitan:Menteri Jimpitan,ketua:kepalasuku:Ketua Paguyuban"
sync_env_var "API_SECRET_KEY" "rahasiakita123"
echo ""

# 3. Update Frontend dari GitHub
echo ">> [3/5] Menarik update FRONTEND dari GitHub (git pull origin main)..."
cd "$FRONTEND_DIR"
git pull origin main
echo "   Commit frontend saat ini: $(git rev-parse --short HEAD)"
echo ""

# 4. Install Dependensi & Build Frontend Produksi
echo ">> [4/5] Menginstall dependensi & MEMBANGUN ULANG (BUILD) FRONTEND..."
npm install
npm run build
echo "   Kompilasi frontend/build berhasil selesai!"
echo ""

# 5. Restart Service / Proses
echo ">> [5/5] Me-restart server service..."
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet jimpitan-backend 2>/dev/null; then
    echo "   Me-restart service systemd (jimpitan-backend & jimpitan-frontend)..."
    sudo systemctl restart jimpitan-backend jimpitan-frontend || true
else
    echo "   Me-restart proses node mandiri..."
    fuser -k 3000/tcp 2>/dev/null || true
    fuser -k 3001/tcp 2>/dev/null || true
    sleep 1
    cd "$BACKEND_DIR"
    PORT=3000 node index.js > "$ROOT_DIR/backend.log" 2>&1 &
    cd "$FRONTEND_DIR"
    PORT=3001 node serve.js > "$ROOT_DIR/frontend.log" 2>&1 &
fi

echo ""
echo "=========================================================="
echo "       UPDATE APLIKASI SELESAI DENGAN SUKSES!             "
echo "=========================================================="
