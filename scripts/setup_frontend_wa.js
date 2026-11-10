const fs = require('fs');
const path = require('path');

// 1. Update icons.js
const iconsPath = 'e:/jimpitan/frontend/src/shared/components/icons.js';
let iconsCode = fs.readFileSync(iconsPath, 'utf8');
if (!iconsCode.includes('IconWhatsApp')) {
  iconsCode += `\nexport function IconWhatsApp(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
      <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
    </svg>
  );
}\n`;
  fs.writeFileSync(iconsPath, iconsCode, 'utf8');
  console.log('icons.js updated with IconWhatsApp');
}

// 2. Update AdminSidebar.js
const sidebarPath = 'e:/jimpitan/frontend/src/shared/components/AdminSidebar.js';
let sidebarCode = fs.readFileSync(sidebarPath, 'utf8');
if (!sidebarCode.includes('IconWhatsApp')) {
  sidebarCode = sidebarCode.replace(
    '  IconLogout,\n} from "./icons";',
    '  IconLogout,\n  IconWhatsApp,\n} from "./icons";'
  );
  sidebarCode = sidebarCode.replace(
    '  { to: "kekurangan-bayar", label: "Kekurangan Bayar", icon: IconKekurangan },',
    '  { to: "kekurangan-bayar", label: "Kekurangan Bayar", icon: IconKekurangan },\n  { to: "status-whatsapp", label: "Status WhatsApp", icon: IconWhatsApp },'
  );
  fs.writeFileSync(sidebarPath, sidebarCode, 'utf8');
  console.log('AdminSidebar.js updated with Status WhatsApp menu');
}

// 3. Create StatusWhatsApp.js
const waDir = 'e:/jimpitan/frontend/src/features/admin/whatsapp';
if (!fs.existsSync(waDir)) {
  fs.mkdirSync(waDir, { recursive: true });
}

const statusWaComponent = `import { useState, useEffect, useRef } from "react";
import Swal from "sweetalert2";
import { ENDPOINT_BASE_URL } from "../../../shared/config";
import Card from "../../../shared/components/ui/Card";
import Button from "../../../shared/components/ui/Button";
import Badge from "../../../shared/components/ui/Badge";
import Spinner from "../../../shared/components/ui/Spinner";

export default function StatusWhatsApp() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [status, setStatus] = useState({
    connected: false,
    starting: false,
    hasAuth: false,
    qr: null,
    qr_url: null,
    user: null,
  });
  const [lastChecked, setLastChecked] = useState(null);
  const timerRef = useRef(null);

  const fetchStatus = async (autoStart = true) => {
    try {
      const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/whatsapp/status?auto_start=\${autoStart}\`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === "OK" && json.data) {
          setStatus(json.data);
          setLastChecked(new Date());
        }
      }
    } catch (err) {
      console.warn("Gagal mengecek status WhatsApp:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus(true);

    // Polling status setiap 4 detik jika belum terhubung agar scan QR langsung terdeteksi
    timerRef.current = setInterval(() => {
      fetchStatus(false);
    }, 4000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleStartOrRefresh = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/whatsapp/start\`, { method: "POST" });
      const json = await res.json();
      if (json.status === "OK") {
        setStatus(json.data || status);
        Swal.fire({
          icon: "info",
          title: "Bot Dimulai",
          text: "Sedang menghubungkan ke server WhatsApp...",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      Swal.fire("Gagal", "Gagal memulai bot WhatsApp: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    const confirm = await Swal.fire({
      title: "Putuskan WhatsApp?",
      text: "Sesi WhatsApp bot akan dikeluarkan (logout). Anda harus scan QR ulang untuk menghubungkan kembali.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Ya, Putuskan!",
      cancelButtonText: "Batal",
    });

    if (!confirm.isConfirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/whatsapp/logout\`, { method: "POST" });
      const json = await res.json();
      if (json.status === "OK") {
        Swal.fire("Berhasil", "Sesi WhatsApp telah diputuskan.", "success");
        fetchStatus(false);
      }
    } catch (err) {
      Swal.fire("Gagal", "Gagal logout WhatsApp: " + err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleKirimTes = async () => {
    const { value: formValues } = await Swal.fire({
      title: "Kirim Pesan Tes WhatsApp",
      html:
        '<div class="text-left space-y-3">' +
        '<div><label class="text-xs font-semibold text-gray-600 block mb-1">Nomor Tujuan (Opsional, kosongkan untuk grup testing):</label>' +
        '<input id="swal-phone" class="swal2-input !mt-0 !w-full !text-sm" placeholder="Contoh: 089673378055"></div>' +
        '<div><label class="text-xs font-semibold text-gray-600 block mb-1">Pesan:</label>' +
        '<textarea id="swal-msg" class="swal2-textarea !mt-0 !w-full !text-sm" rows="3" placeholder="Tulis pesan tes..."></textarea></div>' +
        '</div>',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Kirim Pesan",
      cancelButtonText: "Batal",
      preConfirm: () => {
        return {
          phone: document.getElementById("swal-phone").value,
          message: document.getElementById("swal-msg").value,
        };
      },
    });

    if (!formValues) return;

    setActionLoading(true);
    try {
      const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/whatsapp/test\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_phone: formValues.phone || undefined,
          message: formValues.message || undefined,
        }),
      });
      const json = await res.json();
      if (json.status === "OK") {
        Swal.fire("Terkirim!", "Pesan tes berhasil dikirim via WhatsApp.", "success");
      } else {
        throw new Error(json.message || "Gagal mengirim pesan tes");
      }
    } catch (err) {
      Swal.fire("Gagal", err.message, "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Status WhatsApp</h1>
          <p className="text-sm text-muted">
            Pantau status koneksi WhatsApp Bot untuk pengiriman laporan harian dan broadcast warga.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => fetchStatus(false)}
            disabled={actionLoading || loading}
            className="flex items-center gap-1.5 text-xs py-2 px-3"
          >
            <span>🔄</span>
            <span>Segarkan Status</span>
          </Button>

          {status.connected ? (
            <Button
              variant="danger"
              onClick={handleLogout}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-xs py-2 px-3 !bg-red-600 hover:!bg-red-700 !text-white"
            >
              <span>🚪</span>
              <span>Putuskan (Logout)</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleStartOrRefresh}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-xs py-2 px-3"
            >
              <span>⚡</span>
              <span>Mulai Ulang Bot</span>
            </Button>
          )}
        </div>
      </div>

      {loading && <Spinner label="Memeriksa status koneksi WhatsApp..." />}

      {!loading && (
        <>
          {/* Card Status Utama */}
          <div
            className={\`rounded-2xl border p-6 shadow-sm transition-all \${
              status.connected
                ? "border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40"
                : "border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-orange-50/30"
            }\`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start sm:items-center gap-4">
                <div
                  className={\`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-inner \${
                    status.connected
                      ? "bg-emerald-600 text-white shadow-emerald-700/30"
                      : "bg-amber-500 text-white shadow-amber-600/30 animate-pulse"
                  }\`}
                >
                  {status.connected ? "✅" : "⚠️"}
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-ink">
                      {status.connected ? "WhatsApp Terhubung" : "WhatsApp Belum Terhubung"}
                    </h2>
                    <Badge tone={status.connected ? "success" : "warning"}>
                      {status.connected ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted">
                    {status.connected
                      ? "Bot aktif dan siap mengirimkan notifikasi jimpitan harian serta pesan broadcast."
                      : "Bot belum terhubung dengan akun WhatsApp. Silakan tautkan perangkat melalui QR code di bawah."}
                  </p>
                </div>
              </div>

              {status.connected && (
                <Button
                  variant="success"
                  onClick={handleKirimTes}
                  disabled={actionLoading}
                  className="flex items-center gap-2 self-start md:self-auto !bg-emerald-600 hover:!bg-emerald-700 !text-white text-sm py-2.5 px-4 shadow-sm"
                >
                  <span>✉️</span>
                  <span>Kirim Pesan Tes</span>
                </Button>
              )}
            </div>

            {/* Detail Akun Jika Terhubung */}
            {status.connected && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-emerald-100">
                <div className="rounded-xl bg-white/80 border border-emerald-100 p-3.5">
                  <span className="text-xs text-muted block">Nomor WhatsApp Bot</span>
                  <span className="text-base font-semibold text-ink">
                    {status.user?.phone ? \`+\${status.user.phone}\` : "Nomor Terdaftar"}
                  </span>
                </div>
                <div className="rounded-xl bg-white/80 border border-emerald-100 p-3.5">
                  <span className="text-xs text-muted block">Nama Perangkat / Akun</span>
                  <span className="text-base font-semibold text-ink">
                    {status.user?.name || "Jimpitan Bot"}
                  </span>
                </div>
                <div className="rounded-xl bg-white/80 border border-emerald-100 p-3.5">
                  <span className="text-xs text-muted block">Pemeriksaan Terakhir</span>
                  <span className="text-xs font-medium text-ink mt-0.5 block">
                    {lastChecked ? lastChecked.toLocaleTimeString("id-ID") : "-"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Bagian Jika BELUM TERHUBUNG: QR Code & Panduan Interaktif */}
          {!status.connected && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Kolom QR Code (5 col) */}
              <div className="lg:col-span-5">
                <Card className="text-center p-6 flex flex-col items-center">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-4">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    Menunggu Pemindaian QR
                  </div>

                  <div className="p-3 bg-white border-2 border-dashed border-gray-300 rounded-2xl shadow-sm mb-4 inline-block">
                    {status.qr_url ? (
                      <img
                        src={status.qr_url}
                        alt="QR Code WhatsApp"
                        className="w-64 h-64 mx-auto rounded-lg"
                      />
                    ) : (
                      <div className="w-64 h-64 flex flex-col items-center justify-center bg-gray-50 rounded-lg text-muted p-4">
                        <Spinner label="Memuat QR code baru..." />
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted mb-4 max-w-xs">
                    QR code otomatis diperbarui oleh WhatsApp. Jika tidak bisa discan, klik tombol di bawah untuk meminta QR baru.
                  </p>

                  <Button
                    variant="secondary"
                    onClick={handleStartOrRefresh}
                    disabled={actionLoading}
                    className="text-xs py-2 px-4 flex items-center gap-2"
                  >
                    <span>🔄</span>
                    <span>Muat Ulang QR Baru</span>
                  </Button>
                </Card>
              </div>

              {/* Kolom Panduan Cara Mengaktifkan (7 col) */}
              <div className="lg:col-span-7">
                <Card className="p-6">
                  <h3 className="text-lg font-bold text-ink mb-2 flex items-center gap-2">
                    <span>📱</span>
                    <span>Panduan Cara Mengaktifkan WhatsApp Bot</span>
                  </h3>
                  <p className="text-sm text-muted mb-6">
                    Ikuti langkah mudah berikut pada ponsel yang nomornya akan digunakan sebagai nomor bot jimpitan:
                  </p>

                  <div className="space-y-4">
                    {[
                      {
                        step: "1",
                        title: "Buka WhatsApp di HP",
                        desc: "Buka aplikasi WhatsApp di smartphone Anda seperti biasa.",
                      },
                      {
                        step: "2",
                        title: "Buka Menu Perangkat Tertaut",
                        desc: (
                          <>
                            • <strong>Android:</strong> Ketuk ikon titik tiga (<strong>⋮</strong>) di kanan atas $\\rightarrow$ pilih <strong>Perangkat tertaut</strong> (<em>Linked devices</em>).<br />
                            • <strong>iPhone:</strong> Buka tab <strong>Pengaturan</strong> (<em>Settings</em>) di kanan bawah $\\rightarrow$ pilih <strong>Perangkat tertaut</strong>.
                          </>
                        ),
                      },
                      {
                        step: "3",
                        title: "Tautkan Perangkat",
                        desc: "Ketuk tombol warna hijau bertuliskan 'Tautkan Perangkat' (Link a device). Buka kunci sidik jari/pola HP jika diminta.",
                      },
                      {
                        step: "4",
                        title: "Pindai / Scan QR Code",
                        desc: "Arahkan kamera HP ke gambar QR Code yang tampil di layar sebelah kiri.",
                      },
                      {
                        step: "5",
                        title: "Selesai & Otomatis Terhubung",
                        desc: "Tunggu 2 hingga 5 detik. Begitu tersambung, halaman ini akan otomatis berubah warna menjadi hijau (ONLINE)!",
                      },
                    ].map((item) => (
                      <div key={item.step} className="flex items-start gap-3.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white text-xs font-bold shadow-sm">
                          {item.step}
                        </div>
                        <div className="flex-1 pt-0.5">
                          <h4 className="text-sm font-semibold text-ink">{item.title}</h4>
                          <div className="text-xs text-muted mt-0.5 leading-relaxed">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-5 border-t border-line bg-surface/50 -mx-6 -mb-6 p-6 rounded-b-xl">
                    <h4 className="text-xs font-bold text-ink uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <span>💡</span>
                      <span>Catatan & Pemecahan Masalah</span>
                    </h4>
                    <ul className="text-xs text-muted list-disc list-inside space-y-1">
                      <li>Nomor yang ditautkan bisa menggunakan nomor pribadi atau nomor khusus ronda/RT.</li>
                      <li>Jika WhatsApp Web pernah ditautkan di komputer lain dan nyangkut, silakan klik tombol <strong>"Mulai Ulang Bot"</strong>.</li>
                      <li>Pastikan ponsel tetap memiliki akses internet agar pesan notifikasi selalu terkirim lancar.</li>
                    </ul>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
`;

fs.writeFileSync(path.join(waDir, 'StatusWhatsApp.js'), statusWaComponent, 'utf8');
console.log('StatusWhatsApp.js created successfully.');

// 4. Update App.js routes
const appPath = 'e:/jimpitan/frontend/src/app/App.js';
let appCode = fs.readFileSync(appPath, 'utf8');
if (!appCode.includes('StatusWhatsApp')) {
  appCode = appCode.replace(
    'import RefWarga from "../features/admin/warga/RefWarga.js";',
    'import RefWarga from "../features/admin/warga/RefWarga.js";\nimport StatusWhatsApp from "../features/admin/whatsapp/StatusWhatsApp.js";'
  );
  appCode = appCode.replace(
    '<Route path="ref-warga" element={<RefWarga />} />',
    '<Route path="ref-warga" element={<RefWarga />} />\n            <Route path="status-whatsapp" element={<StatusWhatsApp />} />'
  );
  fs.writeFileSync(appPath, appCode, 'utf8');
  console.log('App.js updated with StatusWhatsApp route.');
}

console.log('Frontend setup complete.');
