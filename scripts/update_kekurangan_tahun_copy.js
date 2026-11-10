const fs = require('fs');
const path = require('path');

const targetFile = 'e:/jimpitan/frontend/src/features/admin/laporan/kekurangan-bayar/KekuranganBayarTahun.js';
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Ensure Swal is imported
if (!content.includes('import Swal from "sweetalert2";')) {
  content = content.replace(
    'import Spinner from "../../../../shared/components/ui/Spinner";',
    'import Spinner from "../../../../shared/components/ui/Spinner";\nimport Swal from "sweetalert2";'
  );
}

// 2. Remove duplicate useEffect if present
const duplicateEffect = `  useEffect(() => {
    if (showDetailModal && selectedDetail) {
      fetchRefWarga(selectedDetail.nomor_rumah);
    } else {
      setRefWarga(null);
      setRefError("");
    }
  }, [showDetailModal, selectedDetail]);`;

if (content.includes(duplicateEffect)) {
  content = content.replace(duplicateEffect, '');
}

// 3. Add handleCopyTagihanWa function
const handleCopyTagihanWaCode = `  const handleCopyTagihanWa = async () => {
    const monthObj = months.find((m) => m.value === selectedEndMonth);
    const monthLabel = monthObj ? monthObj.label : "";

    const listTagihan = filteredData
      .map((item) => {
        const days = calculateCumulativeTotal(item);
        if (days <= 0) return null;
        const nominal = days * 500;
        const nama = homeMap[item.nomor_rumah]?.nama || "-";
        const formattedNominal = rupiahFormat(nominal)
          .replace(/\\u00A0/g, " ")
          .replace(/,00$/, "");
        return {
          nomor: Number(item.nomor_rumah) || 0,
          text: \`No. \${item.nomor_rumah} - \${nama} | \${formattedNominal}\`,
        };
      })
      .filter(Boolean);

    listTagihan.sort((a, b) => a.nomor - b.nomor);

    if (listTagihan.length === 0) {
      Swal.fire({
        title: "Tidak Ada Tagihan",
        text: \`Tidak ada warga yang memiliki tagihan s/d \${monthLabel} \${year} untuk filter ini.\`,
        icon: "info",
      });
      return;
    }

    const copyText = [
      \`Kekurangan bayar jimpitan s/d \${monthLabel} \${year}\`,
      "",
      ...listTagihan.map((t) => t.text),
    ].join("\\n");

    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(copyText);
        success = true;
      }
    } catch (e) {
      console.warn("navigator.clipboard failed, trying fallback:", e);
    }

    if (!success) {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = copyText;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand("copy");
        textArea.remove();
      } catch (err) {
        console.error("Fallback copy failed:", err);
      }
    }

    if (success) {
      Swal.fire({
        title: "Berhasil Disalin!",
        text: \`Data tagihan (\${listTagihan.length} rumah) s/d \${monthLabel} \${year} telah disalin ke clipboard.\`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
    } else {
      Swal.fire("Gagal", "Gagal menyalin teks ke clipboard.", "error");
    }
  };
`;

if (!content.includes('handleCopyTagihanWa')) {
  content = content.replace(
    '  const handleCopyMessage = async () => {',
    `${handleCopyTagihanWaCode}\n  const handleCopyMessage = async () => {`
  );
}

// 4. Update Filter area to include the Salin Tagihan WA button
const oldFilterSectionRegex = /<div className="flex flex-wrap items-center gap-4">[\s\S]*?<div className="flex items-center gap-2">[\s\S]*?{\[[\s\S]*?\]\.map\(\(option\) => \([\s\S]*?<\/div>[\s\S]*?<\/div>/;

const newFilterSection = `<div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink mr-2">Filter Status:</span>
            {[
              { value: "all", label: "Semua" },
              { value: "menghuni", label: "Menghuni" },
              { value: "belum", label: "Belum Dihuni" },
            ].map((option) => (
              <label
                key={option.value}
                className={\`inline-flex items-center rounded-full border px-3 py-2 text-sm cursor-pointer transition \${
                  statusFilter === option.value
                    ? "bg-accent text-white border-accent"
                    : "bg-white text-ink border-line hover:bg-surface"
                }\`}
              >
                <input
                  type="radio"
                  name="statusFilter"
                  value={option.value}
                  checked={statusFilter === option.value}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>

          <Button
            variant="success"
            onClick={handleCopyTagihanWa}
            className="flex items-center gap-2 !bg-emerald-600 hover:!bg-emerald-700 !text-white text-sm py-2 px-3.5 shadow-sm"
            title="Salin rekap tagihan jimpitan sesuai filter untuk WhatsApp"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
            <span>Salin Tagihan WA</span>
          </Button>
        </div>`;

content = content.replace(oldFilterSectionRegex, newFilterSection);

// 5. Update Total sampai bulan table header with a quick copy button
const oldThRegex = /<th className="px-3 py-3">\s*<div className="flex flex-col gap-1">\s*<span>Total sampai bulan<\/span>[\s\S]*?<\/select>\s*<\/div>\s*<\/th>/;

const newTh = `<th className="px-3 py-3">
                  <div className="flex flex-col items-center gap-1.5">
                    <span>Total sampai bulan</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={selectedEndMonth}
                        onChange={(e) =>
                          setSelectedEndMonth(Number(e.target.value))
                        }
                        className="w-24 rounded border border-line bg-white px-2 py-1 text-xs text-ink normal-case"
                      >
                        {months.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleCopyTagihanWa}
                        className="inline-flex items-center justify-center p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
                        title="Salin rekap tagihan s/d bulan ini ke WA"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                </th>`;

content = content.replace(oldThRegex, newTh);

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully updated KekuranganBayarTahun.js');
