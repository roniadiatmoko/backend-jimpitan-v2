const fs = require('fs');
const path = require('path');

const appPath = path.join('e:', 'jimpitan', 'frontend', 'src', 'app', 'App.js');
let content = fs.readFileSync(appPath, 'utf8');

// 1. Tambah import rupiahFormat jika belum ada
if (!content.includes('rupiahFormat')) {
  content = content.replace(
    'import { ENDPOINT_BASE_URL, homeList } from "../shared/config.js";',
    'import { ENDPOINT_BASE_URL, homeList } from "../shared/config.js";\nimport { rupiahFormat } from "../shared/helpers/MoneyHeper.js";'
  );
  console.log('Added rupiahFormat import');
}

// 2. Tambah state saldoData dan fetchSaldoTerkini
const saldoStateCode = `
  const [saldoData, setSaldoData] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(true);

  const fetchSaldoTerkini = async () => {
    setLoadingSaldo(true);
    try {
      const res = await fetch(\`\${endPoint}/api/saldo-terkini\`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSaldoData(json.data);
          return;
        }
      }
      // Fallback untuk backend lawas
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
      const fallbackRes = await fetch(\`\${endPoint}/api/rekap/\${currentYear}/\${currentMonth}\`);
      if (fallbackRes.ok) {
        const fallbackJson = await fallbackRes.json();
        setSaldoData({
          sisa_saldo: fallbackJson.data?.sisa_saldo || 0,
          tanggal_terakhir_diupdate: null,
          bulan: \`\${currentYear}-\${currentMonth}\`,
        });
      }
    } catch (err) {
      console.error("Gagal mengambil saldo terkini:", err);
    } finally {
      setLoadingSaldo(false);
    }
  };

  useEffect(() => {
    fetchSaldoTerkini();
  }, [endPoint]);

  const formatTanggalTerakhir = (tglStr) => {
    if (!tglStr) return "-";
    try {
      const cleanDate = tglStr.length >= 10 ? tglStr.substring(0, 10) : tglStr;
      const [y, m, d] = cleanDate.split("-");
      if (y && m && d) {
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        return format(dateObj, "EEEE, d MMMM yyyy", { locale: id });
      }
      return tglStr;
    } catch {
      return tglStr;
    }
  };
`;

if (!content.includes('fetchSaldoTerkini')) {
  content = content.replace(
    'const [endPoint, setEndPoint] = useState(ENDPOINT_BASE_URL);',
    'const [endPoint, setEndPoint] = useState(ENDPOINT_BASE_URL);' + saldoStateCode
  );
  console.log('Added saldo state & fetcher');
}

// 3. Tambah fetchSaldoTerkini() di simpan jimpitan
if (!content.includes('fetchSaldoTerkini();')) {
  content = content.replace(
    'setUangDiambil("");',
    'setUangDiambil("");\n        fetchSaldoTerkini();'
  );
  console.log('Added fetchSaldoTerkini to simpan');
}

// 4. Update Header Card di tampilan harian
const oldHeaderStart = '{/* Header Card */}';
const oldHeaderEnd = '{/* Tanggal Ronda Card */}';

const startIndex = content.indexOf(oldHeaderStart);
const endIndex = content.indexOf(oldHeaderEnd);

if (startIndex !== -1 && endIndex !== -1) {
  const newHeader = `{/* Header Card */}
          <div className="bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white rounded-3xl p-5 sm:p-6 shadow-xl shadow-emerald-900/15 mb-4 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
            <div className="absolute -left-10 -bottom-10 w-32 h-32 bg-teal-400/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 backdrop-blur-md rounded-full text-xs font-medium text-emerald-100">
                  <span>🌙</span> Petugas Ronda Malam
                </div>
                <button
                  type="button"
                  onClick={fetchSaldoTerkini}
                  title="Muat ulang informasi saldo terkini"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-100 hover:text-white bg-white/15 hover:bg-white/25 backdrop-blur-md px-2.5 py-1 rounded-full transition active:scale-95 border border-white/20 cursor-pointer"
                >
                  <svg
                    className={\`w-3 h-3 \${loadingSaldo ? "animate-spin" : ""}\`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2.5"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>{loadingSaldo ? "Memuat..." : "Refresh"}</span>
                </button>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                Nge-Jimpit GBK Tempel 2
              </h1>
              <p className="text-xs text-emerald-100/80 mt-1 mb-4">
                Pencatatan jimpitan harian warga secara transparan dan tertib
              </p>

              {/* Saldo Terkini Glassmorphism Card */}
              <div className="bg-white/15 backdrop-blur-md border border-white/25 rounded-2xl p-4 text-left shadow-lg">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-emerald-200">
                  <span className="flex items-center gap-1.5">
                    <span>💰</span> Sisa Saldo Kas Terkini
                  </span>
                  <span className="bg-emerald-400/25 text-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300/30">
                    Kas RT
                  </span>
                </div>

                <div className="mt-2 flex items-baseline">
                  {loadingSaldo ? (
                    <div className="h-8 w-44 bg-white/20 rounded animate-pulse my-1"></div>
                  ) : (
                    <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      {rupiahFormat(saldoData?.sisa_saldo ?? 0)}
                    </div>
                  )}
                </div>

                <div className="mt-2.5 pt-2.5 border-t border-white/15 flex flex-wrap items-center justify-between gap-1 text-[11px] text-emerald-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-300">📅</span>
                    <span>
                      Terakhir diupdate:{" "}
                      <strong className="text-white font-semibold">
                        {saldoData?.tanggal_terakhir_diupdate
                          ? formatTanggalTerakhir(saldoData.tanggal_terakhir_diupdate)
                          : "-"}
                      </strong>
                    </span>
                  </div>
                  {saldoData?.bulan && (
                    <span className="text-emerald-200/80 text-[10px]">
                      Periode {format(new Date(saldoData.bulan + "-01"), "MMMM yyyy", { locale: id })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          `;

  content = content.substring(0, startIndex) + newHeader + content.substring(endIndex);
  console.log('Replaced Header Card with Saldo Terkini Card');
}

fs.writeFileSync(appPath, content, 'utf8');
console.log('App.js patched successfully!');
