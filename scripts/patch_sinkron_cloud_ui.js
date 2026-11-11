const fs = require('fs');
const filePath = 'E:/jimpitan/frontend/src/features/admin/cloud-sync/SinkronCloud.js';
let content = fs.readFileSync(filePath, 'utf8');

const target = `          {/* Action Card */}
          <div
            className={\`p-6 rounded-3xl shadow-xl transition text-white \${
              preview.is_local_ahead
                ? "bg-gradient-to-br from-indigo-700 via-indigo-800 to-purple-900 shadow-indigo-900/10"
                : "bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 shadow-emerald-900/10"
            }\`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                    {preview.is_local_ahead ? "Arah: Lokal ➔ Cloud (Push)" : "Arah: Cloud ➔ Lokal (Pull)"}
                  </span>
                </div>
                <h3 className="text-lg font-bold">
                  {preview.is_local_ahead
                    ? "Unggah Data Lokal Terbaru ke Cloud"
                    : "Sinkronkan / Tarik Data dari Cloud"}
                </h3>
                <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                  {preview.is_local_ahead
                    ? "Karena data lokal lebih baru, silakan unggah (push) seluruh tabel SQLite ke Cloud PostgreSQL agar database Cloud selalu up to date."
                    : "Tindakan ini akan menarik seluruh tabel dari PostgreSQL (data warga, jimpitan, rapel, pengeluaran, rekap) ke database lokal SQLite."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {/* Tombol Push ke Cloud */}
                <button
                  onClick={handlePushAll}
                  disabled={pushing || syncing || switching || !preview.connected}
                  className={\`inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-bold rounded-2xl transition shadow-lg disabled:opacity-50 \${
                    preview.is_local_ahead
                      ? "bg-white text-indigo-900 hover:bg-indigo-50 ring-2 ring-white/50"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/30"
                  }\`}
                >
                  {pushing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Mengunggah ke Cloud...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                      📤 Unggah ke Cloud (Push)
                    </>
                  )}
                </button>

                {/* Tombol Tarik dari Cloud (Pull) */}
                <button
                  onClick={handlePullAll}
                  disabled={!preview.can_pull || syncing || pushing || switching || !preview.connected}
                  title={!preview.can_pull ? "Penarikan data dikunci karena data lokal lebih baru dari Cloud" : ""}
                  className={\`inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-bold rounded-2xl transition shadow-lg \${
                    !preview.can_pull
                      ? "bg-black/20 text-white/50 border border-white/10 cursor-not-allowed"
                      : !preview.is_local_ahead
                      ? "bg-white text-emerald-900 hover:bg-emerald-50 ring-2 ring-white/50"
                      : "bg-white/10 hover:bg-white/20 text-white border border-white/30"
                  }\`}
                >
                  {syncing ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Menyinkronkan...
                    </>
                  ) : !preview.can_pull ? (
                    <>
                      <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      🔒 Tarik Dikunci (Lokal Lebih Baru)
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      📥 Tarik dari Cloud (Pull)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>`;

const replacement = `          {/* Action Card */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-emerald-950 text-white p-6 rounded-3xl shadow-xl shadow-slate-950/20">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-1.5 max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white">
                    Sinkronisasi Manual
                  </span>
                  {preview.is_local_ahead && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      Lokal Lebih Baru
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold">
                  {preview.is_local_ahead
                    ? "Tarik Data Cloud atau Unggah Data Lokal"
                    : "Sinkronkan Seluruh Data"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  {preview.is_local_ahead
                    ? "Gunakan 'Tarik & Timpa dari Cloud' untuk membersihkan data uji coba lokal Anda, atau 'Unggah ke Cloud' jika data lokal ini adalah data ronda asli yang belum terunggah."
                    : "Tindakan ini akan menarik seluruh tabel dari PostgreSQL (data warga, jimpitan, rapel, pengeluaran, rekap) ke database lokal SQLite."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {/* Tombol Tarik dari Cloud (Pull) */}
                <button
                  onClick={handlePullAll}
                  disabled={syncing || pushing || switching || !preview.connected}
                  className={\`inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-bold rounded-2xl transition shadow-lg disabled:opacity-50 \${
                    preview.is_local_ahead
                      ? "bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/50"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/30"
                  }\`}
                >
                  {syncing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Menyinkronkan...
                    </>
                  ) : preview.is_local_ahead ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      📥 Tarik &amp; Timpa dari Cloud
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      📥 Tarik Semua Data dari Cloud
                    </>
                  )}
                </button>

                {/* Tombol Push ke Cloud */}
                <button
                  onClick={handlePushAll}
                  disabled={pushing || syncing || switching || !preview.connected}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-bold rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition shadow-lg disabled:opacity-50"
                >
                  {pushing ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Mengunggah...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                      📤 Unggah ke Cloud (Push)
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>\`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Action card updated successfully!');
} else {
  console.error('Target string not found in SinkronCloud.js');
}
