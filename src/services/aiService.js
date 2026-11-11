const NARA_SIGNATURE = "_Nara - Asisten Virtual Jimpitan GBK Tempel 2_";

function attachSignature(text) {
  if (!text || typeof text !== "string") return text;
  const trimmed = text.trim();
  if (trimmed.includes("Nara - Asisten Virtual Jimpitan GBK Tempel 2")) {
    return trimmed;
  }
  return trimmed + "\n\n" + NARA_SIGNATURE;
}

require('dotenv').config();
const { getHitungKekuranganTahun } = require('../features/laporan/model');
const { getSaldoTerkini } = require('../features/rekap/model');
const { upsertHitungUlangHarian } = require('../features/hitung_ulang_jimpitan_harian/model');
const { ambilLaporanHarian, ambilRefWarga, simpanPengeluaran } = require('../../db');
const {
  insertBatchTransaksi: insertBatchKeuanganRumah,
  getRekap: getRekapKeuanganRumah,
} = require("../features/keuangan-rumah/model");

const apiKey = process.env.GEMINI_API_KEY;
const modelName = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

// In-memory conversation history: senderJid -> [{ role, parts }]
const conversationMemory = new Map();
const MEMORY_TIMEOUT_MS = 10 * 60 * 1000; // 10 menit
const lastActivityMap = new Map();

// In-memory pending rapel confirmation: rawSenderNumber -> draftData
const pendingConfirmations = new Map();
const AUTHORIZED_ADMIN_NUMBER = process.env.ADMIN_PHONE_NUMBER || "6289673378055";
const ADMIN_CONTACT_DISPLAY = process.env.ADMIN_PHONE_NUMBER || "089673378055";

// Ekstrak nomor HP murni (hanya digit) dari JID WhatsApp.
// Menangani multi-device format seperti '6289673378055:2@s.whatsapp.net' -> '6289673378055'
function extractPhoneNumber(jidOrNumber) {
  if (!jidOrNumber) return "";
  const str = String(jidOrNumber).trim();
  const beforeAt = str.split("@")[0];
  const phoneOnly = beforeAt.split(":")[0];
  return phoneOnly.replace(/\D/g, "");
}

// Cek apakah nomor pengirim adalah admin yang berwenang
function isAuthorizedAdmin(jidOrNumber) {
  const digits = extractPhoneNumber(jidOrNumber);
  const adminDigits = extractPhoneNumber(process.env.ADMIN_PHONE_NUMBER || AUTHORIZED_ADMIN_NUMBER);
  const tail = adminDigits.length > 9 ? adminDigits.slice(-9) : adminDigits;
  return tail ? digits.endsWith(tail) : false;
}

// Otorisasi & Deteksi Keluarga untuk Modul Keuangan Rumah Tangga
const PAK_RONI_NUMBER = process.env.ADMIN_PHONE_NUMBER || "6289673378055";
const IBU_NUMBER = process.env.FAMILY_PHONE_IBU || "6285867402287";

function getFamilyMember(jidOrNumber) {
  const digits = extractPhoneNumber(jidOrNumber);
  const roniDigits = extractPhoneNumber(process.env.ADMIN_PHONE_NUMBER || PAK_RONI_NUMBER);
  const roniTail = roniDigits.length > 9 ? roniDigits.slice(-9) : roniDigits;

  const ibuDigits = extractPhoneNumber(process.env.FAMILY_PHONE_IBU || IBU_NUMBER);
  const ibuTail = ibuDigits.length > 9 ? ibuDigits.slice(-9) : ibuDigits;

  if (roniTail && digits.endsWith(roniTail)) {
    return { isFamily: true, role: "Pak Roni", title: "Pak Roni", name: "Bapak Roni Adiatmoko" };
  }
  if (ibuTail && digits.endsWith(ibuTail)) {
    return { isFamily: true, role: "Ibu Kartini", title: "Ibu Kartini", name: "Ibu Kartini" };
  }
  return { isFamily: false, role: null, title: null, name: null };
}

// Helper rupiah format
function formatRp(val) {
  const num = Number(val) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num).replace(/\u00A0/g, " ");
}

// ==========================================
// TOOL EXECUTOR
// ==========================================
async function executeTool(name, args, senderInfo, rawNumber) {
  console.log(`[AI Tool Executing] ${name}:`, JSON.stringify(args));

  try {
    if (name === "cek_kekurangan_bulan") {
      let endMonth = Number(args.bulan);
      const year = Number(args.tahun) || new Date().getFullYear();
      if (!endMonth || endMonth < 1 || endMonth > 12) {
        endMonth = new Date().getMonth() + 1;
      }

      const monthNames = [
        "januari", "februari", "maret", "april", "mei", "juni",
        "juli", "agustus", "september", "oktober", "november", "desember"
      ];
      const endMonthKey = monthNames[endMonth - 1];
      const data = await getHitungKekuranganTahun(year);
      const wargaList = await ambilRefWarga();
      const homeMap = {};
      for (const w of wargaList) homeMap[String(w.nomor)] = w;

      // Akumulasi dari Januari s/d bulan yang diminta (sama seperti fitur 'Kekurangan Bayar per Tahun' & 'Salin tagihan WA')
      // Kecuali jika user secara eksplisit meminta hanya bulan tersebut saja
      const hanyaBulanIni = args.hanya_bulan_ini === true;
      const targetMonths = hanyaBulanIni
        ? [endMonthKey]
        : monthNames.slice(0, endMonth);

      const listTagihan = data
        .map((item) => {
          let totalDays = 0;
          const rincianBulanRumah = [];
          for (const m of targetMonths) {
            const days = Number(item[m]) || 0;
            if (days > 0) {
              totalDays += days;
              rincianBulanRumah.push(`${m.charAt(0).toUpperCase() + m.slice(1)}: ${days} hari`);
            }
          }

          if (totalDays <= 0) return null;
          const nama = homeMap[item.nomor_rumah]?.nama || "-";
          return {
            nomor_rumah: Number(item.nomor_rumah) || item.nomor_rumah,
            nama: nama,
            hari_kurang: totalDays,
            nominal: formatRp(totalDays * 500),
            nominal_angka: totalDays * 500,
            rincian_bulan: rincianBulanRumah.join(", "),
            format_baris: `• No. ${item.nomor_rumah} - ${nama} | ${formatRp(totalDays * 500)} (${totalDays} hari)`
          };
        })
        .filter(Boolean);

      listTagihan.sort((a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah));
      const totalNominalSemua = listTagihan.reduce((acc, curr) => acc + curr.nominal_angka, 0);

      const labelPeriode = hanyaBulanIni
        ? `Bulan ${endMonthKey.charAt(0).toUpperCase() + endMonthKey.slice(1)} ${year}`
        : `Januari s/d ${endMonthKey.charAt(0).toUpperCase() + endMonthKey.slice(1)} ${year}`;

      return {
        periode: labelPeriode,
        sampai_bulan: endMonthKey,
        tahun: year,
        total_rumah_belum_lunas: listTagihan.length,
        total_nominal_keseluruhan: formatRp(totalNominalSemua),
        daftar_tagihan: listTagihan,
        catatan: "Perhitungan ini merupakan akumulasi Januari s/d " + endMonthKey + " (sama seperti tombol Salin Tagihan WA di menu Kekurangan Bayar Tahun)."
      };
    }

    if (name === "cek_tagihan_rumah") {
      let nomor = String(args.nomor_rumah || "").trim();
      // Jika tidak diisi, gunakan nomor rumah dari sender jika terdeteksi
      if (!nomor && senderInfo?.nomor_rumah) {
        nomor = String(senderInfo.nomor_rumah);
      }
      if (!nomor) {
        return { error: "Nomor rumah tidak disebutkan dan tidak terdeteksi dari profil pengirim." };
      }

      const year = Number(args.tahun) || new Date().getFullYear();
      const endMonth = Number(args.sampai_bulan) || 12;
      const data = await getHitungKekuranganTahun(year);
      const item = data.find((d) => String(d.nomor_rumah) === nomor);
      const wargaList = await ambilRefWarga();
      const warga = wargaList.find((w) => String(w.nomor) === nomor);

      if (!item) {
        return { error: `Data tagihan untuk rumah nomor ${nomor} tidak ditemukan.` };
      }

      const monthNames = [
        "januari", "februari", "maret", "april", "mei", "juni",
        "juli", "agustus", "september", "oktober", "november", "desember"
      ];
      const targetMonths = monthNames.slice(0, Math.min(Math.max(endMonth, 1), 12));
      const rincianBulan = [];
      let totalHari = 0;

      targetMonths.forEach((m) => {
        const days = Number(item[m]) || 0;
        if (days > 0) {
          totalHari += days;
          rincianBulan.push({
            bulan: m.charAt(0).toUpperCase() + m.slice(1),
            hari: days,
            nominal: formatRp(days * 500),
          });
        }
      });

      return {
        nomor_rumah: nomor,
        nama_penghuni: warga?.nama || "-",
        sudah_menghuni: warga?.sudah_menghuni === 1,
        periode: `Januari s/d ${targetMonths[targetMonths.length - 1].charAt(0).toUpperCase() + targetMonths[targetMonths.length - 1].slice(1)} ${year}`,
        total_hari_tunggakan: totalHari,
        total_nominal: formatRp(totalHari * 500),
        rincian_per_bulan: rincianBulan,
      };
    }

    if (name === "cek_saldo_kas") {
      const saldoData = await getSaldoTerkini();
      return {
        sisa_saldo_kas: formatRp(saldoData.sisa_saldo),
        saldo_bulan_lalu: formatRp(saldoData.saldo_sebelumnya),
        pemasukan_bulan_ini: formatRp(saldoData.pemasukan_bulan_ini),
        pengeluaran_bulan_ini: formatRp(saldoData.pengeluaran_bulan_ini),
        tanggal_terakhir_update: saldoData.tanggal_terakhir_diupdate || "-",
        waktu_update: saldoData.waktu_terakhir_diupdate || "-",
        periode_bulan: saldoData.bulan,
      };
    }

    if (name === "cek_laporan_harian") {
      let tgl = args.tanggal;
      const sqlite3 = require("sqlite3").verbose();
      const pathMod = require("path");
      const dbPath = pathMod.resolve(__dirname, "../../db.sqlite");

      const getLatestTgl = async () => {
        return new Promise((res) => {
          const db = new sqlite3.Database(dbPath);
          db.get("SELECT MAX(tanggal) as max_tgl FROM jimpitan WHERE jumlah > 0", (e, r) => {
            db.close();
            res(r?.max_tgl);
          });
        });
      };

      if (!tgl || tgl === "latest" || tgl === "terbaru" || tgl === "terakhir") {
        tgl =
          (await getLatestTgl()) ||
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
            new Date()
          );
      }

      let laporan = await ambilLaporanHarian(tgl);

      if (!laporan || !laporan.laporan || laporan.laporan.length === 0) {
        const lastTgl = await getLatestTgl();
        if (lastTgl && lastTgl !== tgl) {
          const fallback = await ambilLaporanHarian(lastTgl);
          if (fallback && fallback.laporan && fallback.laporan.length > 0) {
            return {
              tanggal_diminta: tgl,
              catatan: `Belum ada inputan jimpitan pada tanggal ${tgl}. Menampilkan laporan terakhir (${lastTgl}):`,
              tanggal: lastTgl,
              total_uang_terkumpul: formatRp(fallback.totalUang),
              total_rumah_terisi: fallback.totalTerisi,
              total_rapel: fallback.totalRapel,
              total_tidak_terisi: fallback.totalTidakTerisi,
            };
          }
        }
        return { tanggal: tgl, status: "KOSONG", pesan: `Tidak ada data pencatatan jimpitan pada tanggal ${tgl}.` };
      }

      return {
        tanggal: tgl,
        total_uang_terkumpul: formatRp(laporan.totalUang),
        total_rumah_terisi: laporan.totalTerisi,
        total_rapel: laporan.totalRapel,
        total_tidak_terisi: laporan.totalTidakTerisi,
      };
    }

    if (name === "cek_progres_input_bulan") {
      const now = new Date();
      let bulanNum = Number(args.bulan);
      let tahunNum = Number(args.tahun) || now.getFullYear();

      if (!bulanNum || bulanNum < 1 || bulanNum > 12) {
        bulanNum = now.getMonth() + 1;
      }

      const bulanStr = String(tahunNum) + '-' + String(bulanNum).padStart(2, '0');
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const namaBulan = monthNames[bulanNum - 1] + " " + tahunNum;
      const totalDaysInMonth = new Date(tahunNum, bulanNum, 0).getDate();

      const sqlite3 = require("sqlite3").verbose();
      const pathMod = require("path");
      const dbPath = pathMod.resolve(__dirname, "../../db.sqlite");

      const rows = await new Promise((res, rej) => {
        const db = new sqlite3.Database(dbPath);
        db.all("SELECT DISTINCT tanggal FROM jimpitan WHERE SUBSTR(tanggal, 1, 7) = ? ORDER BY tanggal ASC", [bulanStr], (err, r) => {
          db.close();
          if (err) rej(err);
          else res(r || []);
        });
      });

      const datesInputted = rows.map((r) => r.tanggal);
      const setInputted = new Set(datesInputted);

      const currentMonthStr = String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0');
      const isCurrentMonth = bulanStr === currentMonthStr;
      const todayDate = now.getDate();

      const missingUntilToday = [];
      const limitDay = isCurrentMonth ? todayDate : totalDaysInMonth;

      for (let d = 1; d <= limitDay; d++) {
        const dStr = bulanStr + '-' + String(d).padStart(2, '0');
        if (!setInputted.has(dStr)) {
          missingUntilToday.push(dStr);
        }
      }

      const isTodayInputted = setInputted.has(bulanStr + '-' + String(todayDate).padStart(2, '0'));
      const latestInputted = datesInputted[datesInputted.length - 1] || null;

      return {
        periode_bulan: namaBulan,
        total_hari_sebulan: totalDaysInMonth,
        jumlah_hari_sudah_diinput: datesInputted.length,
        tanggal_terakhir_input: latestInputted,
        tanggal_belum_diinput_sampai_hari_ini: missingUntilToday,
        apakah_hari_ini_sudah_input: isTodayInputted,
        apakah_lengkap_sampai_hari_ini: missingUntilToday.length === 0,
        keterangan: isCurrentMonth
          ? (missingUntilToday.length === 0
              ? "Semua hari sampai hari ini sudah lengkap diinput."
              : (missingUntilToday.length === 1 && !isTodayInputted
                  ? "Semua tanggal sampai kemarin sudah lengkap diinput. Hanya hari ini yang belum diinput karena ronda malam ini masih atau baru akan berlangsung."
                  : "Ada tanggal yang belum diinput sampai hari ini: " + missingUntilToday.join(", ")))
          : (datesInputted.length === totalDaysInMonth ? "Bulan lampau ini sudah lengkap diinput seluruhnya." : "Bulan lampau: " + datesInputted.length + " dari " + totalDaysInMonth + " hari terinput.")
      };
    }

    if (name === "cek_setoran_ronda") {
      const now = new Date();
      let bulanNum = Number(args.bulan);
      let tahunNum = Number(args.tahun) || now.getFullYear();

      if (!bulanNum || bulanNum < 1 || bulanNum > 12) {
        bulanNum = now.getMonth() + 1;
      }

      const bulanStr = String(tahunNum) + '-' + String(bulanNum).padStart(2, '0');
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const namaBulan = monthNames[bulanNum - 1] + " " + tahunNum;

      const sqlite3 = require("sqlite3").verbose();
      const pathMod = require("path");
      const dbPath = pathMod.resolve(__dirname, "../../db.sqlite");

      const q = `
        SELECT 
          j.tanggal,
          SUM(CASE WHEN j.jumlah = 1 THEN 1 ELSE 0 END) as terisi,
          SUM(CASE WHEN j.jumlah = 1 THEN 1 ELSE 0 END) * 500 as nominal_jimpitan,
          h.nominal_hitung_ulang
        FROM jimpitan j
        LEFT JOIN hitung_ulang_jimpitan_harian h ON j.tanggal = h.tanggal
        WHERE SUBSTR(j.tanggal, 1, 7) = ?
        GROUP BY j.tanggal
        ORDER BY j.tanggal ASC
      `;

      const rows = await new Promise((res, rej) => {
        const db = new sqlite3.Database(dbPath);
        db.all(q, [bulanStr], (err, r) => {
          db.close();
          if (err) rej(err);
          else res(r || []);
        });
      });

      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const belumDisetor = [];
      const sudahDisetor = [];
      let totalBelumDisetorNominal = 0;

      for (const r of rows) {
        const d = new Date(r.tanggal + 'T00:00:00');
        const namaHari = days[d.getDay()];
        const hitungUlangNum = Number(r.nominal_hitung_ulang || 0);

        if (!r.nominal_hitung_ulang || hitungUlangNum === 0) {
          belumDisetor.push({
            hari: namaHari,
            tanggal: r.tanggal,
            nominal_ronda: formatRp(r.nominal_jimpitan),
            nominal_angka: r.nominal_jimpitan
          });
          totalBelumDisetorNominal += r.nominal_jimpitan;
        } else {
          sudahDisetor.push({
            hari: namaHari,
            tanggal: r.tanggal,
            nominal_ronda: formatRp(r.nominal_jimpitan),
            nominal_setor: formatRp(hitungUlangNum),
            status: hitungUlangNum === r.nominal_jimpitan ? "Balance" : (hitungUlangNum > r.nominal_jimpitan ? "Surplus" : "Defisit")
          });
        }
      }

      return {
        periode: namaBulan,
        total_hari_ronda_tercatat: rows.length,
        jumlah_hari_belum_disetor: belumDisetor.length,
        total_nominal_belum_disetor: formatRp(totalBelumDisetorNominal),
        daftar_belum_disetor: belumDisetor,
        jumlah_hari_sudah_disetor: sudahDisetor.length,
        keterangan: belumDisetor.length === 0
          ? "Semua uang hasil ronda bulan ini sudah disetorkan dan dihitung ulang oleh bendahara."
          : ("Ada " + belumDisetor.length + " hari ronda yang uangnya belum disetorkan ke bendahara, total " + formatRp(totalBelumDisetorNominal) + ".")
      };
    }

    if (name === "draft_input_rapel") {
      const cleanNumber = extractPhoneNumber(rawNumber || senderInfo?.no_hp);
      if (!isAuthorizedAdmin(cleanNumber)) {
        return {
          status: "UNAUTHORIZED",
          pesan: `Akses Ditolak: Pencatatan rapel melalui WhatsApp hanya diizinkan untuk Pengurus/Bendahara berwenang (Bapak Roni Adiatmoko - ${ADMIN_CONTACT_DISPLAY}).`
        };
      }

      const wargaList = await ambilRefWarga();
      let nomorRumah = args.nomor_rumah ? String(args.nomor_rumah).trim().replace(/\D/g, "") : "";
      let matchedWarga = null;

      if (nomorRumah) {
        matchedWarga = wargaList.find((w) => String(w.nomor) === nomorRumah);
        if (!matchedWarga) {
          return {
            status: "NOT_FOUND",
            pesan: "Rumah No. " + nomorRumah + " tidak ditemukan dalam data warga perumahan."
          };
        }
      } else if (args.nama_warga) {
        const queryName = String(args.nama_warga).toLowerCase()
          .replace(/\b(ibu|bu|bapak|pak|bpk|mas|mbak)\b/gi, "")
          .trim();

        const matches = wargaList.filter((w) => w.nama && w.nama.toLowerCase().includes(queryName));
        if (matches.length === 0) {
          return {
            status: "NOT_FOUND",
            pesan: "Warga dengan nama '" + args.nama_warga + "' tidak ditemukan di database. Mohon sebutkan nomor rumahnya."
          };
        }
        if (matches.length > 1) {
          const opsi = matches.map((m) => "No. " + m.nomor + " (" + m.nama + ")").join(", ");
          return {
            status: "AMBIGUOUS",
            pesan: "Ditemukan beberapa warga dengan nama tersebut: " + opsi + ". Mohon sebutkan nomor rumah yang dimaksud."
          };
        }
        matchedWarga = matches[0];
        nomorRumah = String(matchedWarga.nomor);
      } else {
        return {
          status: "INVALID",
          pesan: "Nomor rumah atau nama warga belum disebutkan."
        };
      }

      const nominal = Number(args.nominal) || 0;
      if (nominal <= 0) {
        return {
          status: "INVALID_NOMINAL",
          pesan: "Nominal rapel harus lebih dari 0."
        };
      }
      if (nominal % 500 !== 0) {
        return {
          status: "INVALID_NOMINAL",
          pesan: "Nominal " + formatRp(nominal) + " tidak valid. Pembayaran jimpitan harus kelipatan Rp 500 (tarif harian jimpitan)."
        };
      }
      const hariRapel = Math.floor(nominal / 500);

      const now = new Date();
      let bulanNum = Number(args.bulan);
      let tahunNum = Number(args.tahun) || now.getFullYear();

      if (!bulanNum || bulanNum < 1 || bulanNum > 12) {
        bulanNum = now.getMonth() + 1;
      }

      const bulanStr = String(tahunNum) + '-' + String(bulanNum).padStart(2, '0');
      const monthNames = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const namaBulan = monthNames[bulanNum - 1] + " " + tahunNum;

      const { ambilTanggalJimpitanKosong, ambilTanggalRapelTerisi, ambilTanggalPemutihan } = require("../../db");
      const tanggalJimpitanKosong = await ambilTanggalJimpitanKosong(nomorRumah, bulanStr);
      const tanggalRapelTerisi = await ambilTanggalRapelTerisi(nomorRumah, bulanStr);
      const tanggalPemutihanRows = await ambilTanggalPemutihan(bulanStr);
      const tanggalPemutihan = tanggalPemutihanRows.map((r) => r.tanggal);

      const hariUntukDirapel = tanggalJimpitanKosong.filter(
        (t) => !tanggalRapelTerisi.includes(t) && !tanggalPemutihan.includes(t)
      );

      if (hariUntukDirapel.length === 0) {
        return {
          status: "SUDAH_LUNAS",
          nomor_rumah: nomorRumah,
          nama_penghuni: matchedWarga.nama,
          bulan: namaBulan,
          pesan: "Rumah No. " + nomorRumah + " (" + matchedWarga.nama + ") sudah LUNAS untuk bulan " + namaBulan + ". Tidak ada hari kosong yang perlu dirapel."
        };
      }

      const tanggalYangDisimpan = hariUntukDirapel.slice(0, hariRapel);
      const nominalTerpakai = tanggalYangDisimpan.length * 500;
      const kelebihanNominal = nominal - nominalTerpakai;
      const sisaHariTunggakanSetelahRapel = hariUntukDirapel.length - tanggalYangDisimpan.length;

      pendingConfirmations.set(cleanNumber, {
        type: "RAPEL",
        nomor_rumah: nomorRumah,
        nama_penghuni: matchedWarga.nama,
        bulanStr,
        namaBulan,
        nominal,
        hariRapel,
        tanggalYangDisimpan,
        kelebihanNominal,
        sisaHariTunggakanSetelahRapel,
        timestamp: Date.now()
      });

      return {
        status: "MENUNGGU_KONFIRMASI",
        nomor_rumah: nomorRumah,
        nama_penghuni: matchedWarga.nama,
        bulan: namaBulan,
        nominal: formatRp(nominal),
        hari_dibayar: hariRapel,
        hari_dapat_dilunasi: tanggalYangDisimpan.length,
        tanggal_dilunasi: tanggalYangDisimpan,
        kelebihan_nominal: kelebihanNominal > 0 ? formatRp(kelebihanNominal) : null,
        sisa_tunggakan_bulan_ini: sisaHariTunggakanSetelahRapel === 0 ? "LUNAS (0 hari)" : (sisaHariTunggakanSetelahRapel + " hari (" + formatRp(sisaHariTunggakanSetelahRapel * 500) + ")"),
        instruksi: "Tampilkan format konfirmasi yang sangat jelas dan rapi kepada pengurus. Minta pengurus mengetik 'YA' untuk menyimpan ke database atau 'BATAL' untuk membatalkan."
      };
    }

    if (name === "draft_input_setoran") {
      const cleanNumber = extractPhoneNumber(rawNumber || senderInfo?.no_hp);
      if (!isAuthorizedAdmin(cleanNumber)) {
        return {
          status: "UNAUTHORIZED",
          pesan: `Akses Ditolak: Pencatatan setoran uang ronda hanya dapat dilakukan oleh Pengurus/Bendahara berwenang (Bapak Roni Adiatmoko - ${ADMIN_CONTACT_DISPLAY}).`
        };
      }

      const nominal = Number(args.nominal) || 0;
      if (nominal <= 0) {
        return {
          status: "INVALID_NOMINAL",
          pesan: "Nominal setoran harus lebih dari 0."
        };
      }

      let tanggal = String(args.tanggal || "").trim();
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(tanggal)) {
        return {
          status: "INVALID_DATE",
          pesan: "Format tanggal tidak valid (" + tanggal + "). Harap sebutkan tanggal yang jelas (contoh: 'tgl 11 nov' atau '2026-11-11')."
        };
      }

      const dObj = new Date(tanggal + "T00:00:00");
      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const months = [
        "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember"
      ];
      const namaHari = days[dObj.getDay()];
      const namaBulan = months[dObj.getMonth()];
      const formattedTanggalText = namaHari + ", " + dObj.getDate() + " " + namaBulan + " " + dObj.getFullYear();

      const sqlite3 = require("sqlite3").verbose();
      const pathMod = require("path");
      const dbPath = pathMod.resolve(__dirname, "../../db.sqlite");

      const jimpitanData = await new Promise((res, rej) => {
        const db = new sqlite3.Database(dbPath);
        db.get(
          "SELECT SUM(CASE WHEN jumlah = 1 THEN 1 ELSE 0 END) as terisi, SUM(CASE WHEN jumlah = 1 THEN 1 ELSE 0 END) * 500 as total_uang FROM jimpitan WHERE tanggal = ?",
          [tanggal],
          (err, r) => {
            db.close();
            if (err) rej(err);
            else res(r || { terisi: 0, total_uang: 0 });
          }
        );
      });

      const nominalRonda = Number(jimpitanData?.total_uang || 0);
      const rumahTerisi = Number(jimpitanData?.terisi || 0);

      const existingSetor = await new Promise((res, rej) => {
        const db = new sqlite3.Database(dbPath);
        db.get(
          "SELECT nominal_hitung_ulang FROM hitung_ulang_jimpitan_harian WHERE tanggal = ?",
          [tanggal],
          (err, r) => {
            db.close();
            if (err) rej(err);
            else res(r);
          }
        );
      });

      const nominalSebelumnya = existingSetor?.nominal_hitung_ulang ? Number(existingSetor.nominal_hitung_ulang) : null;

      let statusBalance = "BALANCE";
      let catatanSelisih = "";
      if (nominalRonda === 0) {
        statusBalance = "BELUM_ADA_RONDA";
        catatanSelisih = "Perhatian: Belum ada data penarikan jimpitan ronda yang tercatat di sistem pada tanggal ini.";
      } else if (nominal === nominalRonda) {
        statusBalance = "BALANCE";
        catatanSelisih = "Uang fisik setoran pas/sesuai dengan hasil penarikan ronda di lapangan (Balance).";
      } else if (nominal > nominalRonda) {
        statusBalance = "SURPLUS";
        const surplus = nominal - nominalRonda;
        catatanSelisih = "Surplus +" + formatRp(surplus) + " (Uang setor lebih besar daripada catatan ronda).";
      } else {
        statusBalance = "DEFISIT";
        const defisit = nominalRonda - nominal;
        catatanSelisih = "Defisit -" + formatRp(defisit) + " (Uang setor kurang dari catatan ronda).";
      }

      pendingConfirmations.set(cleanNumber, {
        type: "SETORAN",
        tanggal,
        formattedTanggalText,
        nominal,
        nominalRonda,
        rumahTerisi,
        statusBalance,
        catatanSelisih,
        nominalSebelumnya,
        timestamp: Date.now()
      });

      return {
        status: "MENUNGGU_KONFIRMASI",
        tanggal,
        hari_tanggal: formattedTanggalText,
        nominal_setor: formatRp(nominal),
        nominal_ronda_lapangan: formatRp(nominalRonda),
        rumah_terisi: rumahTerisi,
        status_balance: statusBalance,
        catatan_selisih: catatanSelisih,
        apakah_koreksi: nominalSebelumnya !== null,
        nominal_sebelumnya: nominalSebelumnya ? formatRp(nominalSebelumnya) : null,
        instruksi: "Tampilkan draft konfirmasi setoran ini dengan sangat jelas dan rapi. Minta pengurus mengetik 'YA' untuk menyimpan ke database atau 'BATAL' untuk membatalkan."
      };
    }

    if (name === "info_cara_pembayaran") {
      return {
        pembayaran_tunai: [
          "Rumah No. 43 (Bapak Topik)",
          "Rumah No. 33 (Bapak Roni Adiatmoko)"
        ],
        pembayaran_transfer: {
          metode: "Aplikasi DANA",
          nomor_tujuan: ADMIN_CONTACT_DISPLAY,
          atas_nama: "Roni Adiatmoko"
        },
        konfirmasi: "Mohon kirim bukti transfer atau konfirmasi ke chat ini setelah pembayaran berhasil."
      };
    }

    if (name === "catat_pengeluaran_jimpitan") {
      const cleanNumber = extractPhoneNumber(rawNumber || senderInfo?.no_hp || senderInfo?.jid);
      if (!isAuthorizedAdmin(cleanNumber)) {
        return {
          status: "error",
          pesan: `Akses Ditolak: Pencatatan pengeluaran kas jimpitan warga hanya dapat dilakukan oleh Pengurus/Bendahara berwenang (Bapak Roni Adiatmoko - ${ADMIN_CONTACT_DISPLAY}).`,
        };
      }

      const items = Array.isArray(args.items) && args.items.length > 0
        ? args.items
        : [
            {
              nominal: args.nominal,
              keterangan: args.keterangan,
              tanggal: args.tanggal,
              penanggung_jawab: args.penanggung_jawab,
            },
          ];

      const savedItems = [];
      let totalNominal = 0;

      for (const it of items) {
        const nominalNum = Number(it.nominal) || 0;
        if (nominalNum <= 0) continue;
        const tgl =
          it.tanggal ||
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
            new Date()
          );
        const ket = String(it.keterangan || "").trim();
        const pj = String(it.penanggung_jawab || "Bpk. Roni").trim();
        const bukti = it.bukti_foto || null;

        await simpanPengeluaran(tgl, String(nominalNum), pj, ket, bukti);
        totalNominal += nominalNum;
        savedItems.push({
          tanggal: tgl,
          nominal: nominalNum,
          nominal_formatted: formatRp(nominalNum),
          keterangan: ket,
          penanggung_jawab: pj,
        });
      }

      if (savedItems.length === 0) {
        return {
          status: "error",
          pesan: "Gagal mencatat: nominal pengeluaran kas jimpitan harus lebih dari Rp 0.",
        };
      }

      return {
        status: "success",
        jenis: "KAS_JIMPITAN_WARGA",
        jumlah_transaksi: savedItems.length,
        total_nominal: totalNominal,
        total_formatted: formatRp(totalNominal),
        rincian: savedItems,
        pesan: `Berhasil mencatat ${savedItems.length} transaksi pengeluaran KAS JIMPITAN WARGA (Total: ${formatRp(totalNominal)}).`,
      };
    }

    if (name === "catat_keuangan_rumah") {
      const family = getFamilyMember(rawNumber || senderInfo?.jid);
      if (senderInfo?.isGroup) {
        return {
          status: "error",
          pesan: "Pencatatan keuangan rumah tangga hanya dapat dilakukan lewat chat pribadi (Japri) untuk menjaga privasi keluarga ya Pak/Bu.",
        };
      }
      if (!family.isFamily) {
        return {
          status: "error",
          pesan: "Akses Ditolak: Fitur pencatatan keuangan rumah tangga hanya dapat diakses oleh Bapak Roni dan Ibu Kartini.",
        };
      }

      const items = Array.isArray(args.items) ? args.items : [args.items];
      if (items.length === 0) {
        return { status: "error", pesan: "Tidak ada transaksi yang dapat dicatat." };
      }

      const results = await insertBatchKeuanganRumah(items, family.role);
      const total = results.reduce((acc, c) => acc + (Number(c.nominal) || 0), 0);

      return {
        status: "success",
        dicatat_oleh: family.role,
        jumlah_transaksi: results.length,
        total_nominal: total,
        total_formatted: formatRp(total),
        rincian: results.map((r) => ({
          keterangan: r.keterangan,
          kategori: r.kategori,
          nominal: formatRp(r.nominal),
          sumber_dana: r.sumber_dana,
        })),
        pesan: `Berhasil mencatat ${results.length} transaksi keuangan rumah tangga (Total: ${formatRp(total)}).`,
      };
    }

    if (name === "rekap_keuangan_rumah") {
      const family = getFamilyMember(rawNumber || senderInfo?.jid);
      if (senderInfo?.isGroup) {
        return {
          status: "error",
          pesan: "Rekap keuangan rumah tangga hanya dapat ditanyakan lewat chat pribadi (Japri) untuk menjaga privasi keluarga ya Pak/Bu.",
        };
      }
      if (!family.isFamily) {
        return {
          status: "error",
          pesan: "Akses Ditolak: Fitur rekap keuangan rumah tangga hanya dapat diakses oleh Bapak Roni dan Ibu Kartini.",
        };
      }

      const rekap = await getRekapKeuanganRumah({
        bulan: args.bulan,
        tahun: args.tahun,
      });

      return {
        status: "success",
        pemohon: family.role,
        periode: rekap.periode,
        total_pengeluaran: formatRp(rekap.totalPengeluaran),
        total_pemasukan: formatRp(rekap.totalPemasukan),
        sisa_saldo: formatRp(rekap.sisaSaldo),
        total_transaksi: rekap.totalTransaksi,
        kategori_terbesar: rekap.topKategori
          ? {
              kategori: rekap.topKategori.kategori,
              total: formatRp(rekap.topKategori.total),
              persentase: `${rekap.topKategori.persentase}%`,
            }
          : null,
        pengeluaran_terbesar: (rekap.topPengeluaran || []).map((t, idx) => ({
          peringkat: idx + 1,
          keterangan: t.keterangan,
          kategori: t.kategori,
          nominal: formatRp(t.nominal),
          tanggal: t.tanggal,
          dicatat_oleh: t.dicatat_oleh,
        })),
        breakdown_kategori: (rekap.breakdownKategori || []).map((k) => ({
          kategori: k.kategori,
          total: formatRp(k.total),
          persentase: `${k.persentase}%`,
          frekuensi: `${k.frekuensi} kali`,
        })),
        kontribusi_catat: rekap.dicatatOlehSummary,
      };
    }

    return { error: `Tool ${name} tidak dikenali.` };
  } catch (err) {
    console.error(`Error executing tool ${name}:`, err);
    return { error: err.message };
  }
}

// ==========================================
// TOOL DECLARATIONS FOR GEMINI
// ==========================================
const toolDeclarations = [
  {
    functionDeclarations: [
      {
        name: "cek_kekurangan_bulan",
        description: "Mengecek rekap rumah warga yang memiliki kekurangan bayar jimpitan akumulasi dari awal tahun (Januari) sampai bulan yang diminta (sama persis dengan fitur 'Kekurangan Bayar per Tahun' dan tombol 'Salin tagihan WA'). Gunakan ini jika user menanyakan rekap/daftar rumah yang memiliki kekurangan atau belum bayar sampai bulan tertentu.",
        parameters: {
          type: "OBJECT",
          properties: {
            bulan: { type: "INTEGER", description: "Bulan akhir 1 sampai 12 yang dicek (contoh: 10 untuk Oktober jika ditanyakan 'sampai bulan Oktober', 11 untuk November)" },
            tahun: { type: "INTEGER", description: "Tahun Masehi (contoh: 2026)" },
            hanya_bulan_ini: { type: "BOOLEAN", description: "Set true HANYA JIKA user secara eksplisit meminta 'hanya bulan X saja'. Default false (menghitung akumulasi Januari s/d bulan tersebut)." }
          },
          required: ["bulan"]
        }
      },
      {
        name: "cek_tagihan_rumah",
        description: "Mengecek rincian tagihan atau kekurangan bayar jimpitan untuk satu rumah tertentu (termasuk jika ditanyakan sampai bulan tertentu).",
        parameters: {
          type: "OBJECT",
          properties: {
            nomor_rumah: { type: "STRING", description: "Nomor rumah warga (contoh: '20' atau '4')" },
            tahun: { type: "INTEGER", description: "Tahun (opsional)" },
            sampai_bulan: { type: "INTEGER", description: "Batas bulan akhir 1 sampai 12 (opsional, misal 10 untuk Oktober jika ditanyakan s/d Oktober)" }
          },
          required: ["nomor_rumah"]
        }
      },
      {
        name: "cek_saldo_kas",
        description: "Mengecek sisa saldo uang kas jimpitan terkini, pemasukan, pengeluaran, dan tanggal terakhir diupdate.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "cek_laporan_harian",
        description: "Mengecek laporan pengumpulan jimpitan harian (pendapatan, rumah terisi, tidak terisi, rapel). Kosongkan tanggal jika user tidak menyebut tanggal atau ingin laporan terbaru.",
        parameters: {
          type: "OBJECT",
          properties: {
            tanggal: { type: "STRING", description: "Format YYYY-MM-DD (contoh: 2026-11-09). Kosongkan jika ingin laporan terbaru." }
          }
        }
      },
      {
        name: "cek_progres_input_bulan",
        description: "Mengecek progres dan kelengkapan input data jimpitan harian dalam satu bulan. Gunakan ini jika user menanyakan apakah jimpitan bulan ini sudah diinput semua, apakah ada tanggal yang bolong/terlewat/belum diinput, atau menanyakan progres input ronda bulan ini.",
        parameters: {
          type: "OBJECT",
          properties: {
            bulan: { type: "INTEGER", description: "Bulan 1 sampai 12 (opsional, default bulan saat ini)" },
            tahun: { type: "INTEGER", description: "Tahun Masehi (opsional, default tahun saat ini)" }
          }
        }
      },
      {
        name: "cek_setoran_ronda",
        description: "Mengecek daftar tanggal ronda jimpitan yang uangnya belum disetorkan ke bendahara (belum dihitung ulang). Gunakan ini jika user menanyakan tanggal/hari ronda yang belum disetor atau status setoran ronda.",
        parameters: {
          type: "OBJECT",
          properties: {
            bulan: { type: "INTEGER", description: "Bulan 1 sampai 12 (opsional, default bulan saat ini)" },
            tahun: { type: "INTEGER", description: "Tahun Masehi (opsional, default tahun saat ini)" }
          }
        }
      },
      {
        name: "draft_input_rapel",
        description: "Menyiapkan draft konfirmasi pencatatan rapel jimpitan warga sebelum disimpan ke database. Gunakan ini jika pengurus (Bapak Roni) meminta mencatat rapel/pembayaran jimpitan untuk rumah atau nama warga tertentu.",
        parameters: {
          type: "OBJECT",
          properties: {
            nomor_rumah: { type: "STRING", description: "Nomor rumah warga (contoh: '11', '4', '2')" },
            nama_warga: { type: "STRING", description: "Nama warga jika user menyebut nama bukan nomor (contoh: 'Ibu Herma', 'Bu Herma')" },
            nominal: { type: "INTEGER", description: "Nominal pembayaran jimpitan dalam Rupiah angka murni (contoh: 15000 untuk 15rb/15k, 5000 untuk 5rb)" },
            bulan: { type: "INTEGER", description: "Bulan 1 sampai 12 (opsional, default: bulan saat ini)" },
            tahun: { type: "INTEGER", description: "Tahun Masehi (opsional, default: tahun saat ini)" }
          },
          required: ["nominal"]
        }
      },
      {
        name: "draft_input_setoran",
        description: "Menyiapkan draft konfirmasi hitung ulang harian / setoran uang ronda dari petugas ke bendahara sebelum disimpan ke database. Gunakan ini jika pengurus (Bapak Roni) meminta mencatat setoran uang ronda (contoh: 'tgl 11 nov setor 11rb', 'setor tgl 8 nov 10500', 'hitung ulang kemarin 10rb').",
        parameters: {
          type: "OBJECT",
          properties: {
            tanggal: { type: "STRING", description: "Format YYYY-MM-DD (contoh: '2026-11-11', '2026-11-08'). Konversikan tanggal relatif atau teks seperti 'kemarin' atau 'tgl 11 nov' ke YYYY-MM-DD sesuai tanggal sistem saat ini." },
            nominal: { type: "INTEGER", description: "Nominal uang fisik yang disetorkan dalam angka murni (contoh: 11000 untuk 11rb, 10500 untuk 10500)" }
          },
          required: ["tanggal", "nominal"]
        }
      },
      {
        name: "info_cara_pembayaran",
        description: "Memberikan informasi rekening transfer DANA dan pembayaran tunai jimpitan.",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "catat_pengeluaran_jimpitan",
        description: "Mencatat satu atau lebih pengeluaran KAS JIMPITAN WARGA / POS RONDA / FASUM PERUMAHAN (contoh: beli minyak goreng pos ronda, kopi pos ronda, bola lampu jalan gang, baterai senter, sapu lidi, konsumsi kerja bakti, perlengkapan pos ronda, dll). HANYA digunakan untuk kas jimpitan warga dan hanya berwenang untuk Bendahara (Bapak Roni). JANGAN gunakan tool ini untuk belanja pribadi/keluarga.",
        parameters: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              description: "Daftar pengeluaran kas jimpitan warga yang akan dicatat.",
              items: {
                type: "OBJECT",
                properties: {
                  keterangan: { type: "STRING", description: "Uraian belanja jimpitan (contoh: 'Minyak goreng pos ronda', 'Bola lampu jalan gang')" },
                  nominal: { type: "INTEGER", description: "Nominal uang dalam angka bulat Rupiah (contoh: 25000 untuk 25rb)" },
                  penanggung_jawab: { type: "STRING", description: "Nama penanggung jawab pengeluaran (default: 'Bpk. Roni')" },
                  tanggal: { type: "STRING", description: "Format YYYY-MM-DD. Kosongkan jika hari ini." }
                },
                required: ["keterangan", "nominal"]
              }
            }
          },
          required: ["items"]
        }
      },
      {
        name: "catat_keuangan_rumah",
        description: "Mencatat satu atau lebih transaksi keuangan rumah tangga pribadi keluarga Pak Roni & Ibu Kartini (pengeluaran atau pemasukan belanja harian, tagihan listrik/air/wifi, kebutuhan rumah, beras/pangan, anak, bensin, dll). HANYA digunakan ketika user adalah Pak Roni atau Ibu Kartini dalam chat pribadi. AI dapat mem-parsing beberapa item sekaligus dalam satu kalimat (misal: 'catat beli galon 20rb, token listrik 100rb, beras 75rb').",
        parameters: {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              description: "Daftar transaksi yang akan dicatat",
              items: {
                type: "OBJECT",
                properties: {
                  keterangan: { type: "STRING", description: "Uraian belanja/transaksi (misal: 'Token listrik PLN', 'Beras 5kg', 'Galon air', 'Bensin motor')" },
                  nominal: { type: "INTEGER", description: "Nominal uang dalam angka bulat Rupiah murni (misal: 20000 untuk 20rb/20k, 150000 untuk 150rb)" },
                  kategori: {
                    type: "STRING",
                    description: "Kategori pengeluaran. Pilihan umum: 'Pangan / Dapur', 'Tagihan & Utilitas', 'Kebutuhan Rumah', 'Pendidikan & Anak', 'Transportasi & Bensin', 'Kesehatan', 'Jajan & Hiburan', 'Lain-lain'. Jika pemasukan, isi 'Pemasukan / Gaji / Usaha'."
                  },
                  jenis: {
                    type: "STRING",
                    description: "Jenis transaksi: 'pengeluaran' (default) atau 'pemasukan'."
                  },
                  sumber_dana: {
                    type: "STRING",
                    description: "Sumber pembayaran (misal: 'Cash', 'BCA', 'Mandiri', 'Gopay', dll). Default: 'Cash'."
                  },
                  tanggal: {
                    type: "STRING",
                    description: "Tanggal transaksi format YYYY-MM-DD. Kosongkan jika transaksi hari ini."
                  }
                },
                required: ["keterangan", "nominal", "kategori"]
              }
            }
          },
          required: ["items"]
        }
      },
      {
        name: "rekap_keuangan_rumah",
        description: "Melihat rekap dan analisis keuangan rumah tangga pribadi keluarga Pak Roni & Ibu Kartini (total pengeluaran, pemasukan, sisa saldo, breakdown per kategori, dan apa pengeluaran terbesar bulan ini). Gunakan ini jika Pak Roni atau Ibu Kartini bertanya tentang pengeluaran rumah tangga, rekap bulan ini, pengeluaran terbesar, atau total belanja kategori tertentu.",
        parameters: {
          type: "OBJECT",
          properties: {
            bulan: { type: "INTEGER", description: "Bulan 1 sampai 12 (opsional, default: bulan saat ini)" },
            tahun: { type: "INTEGER", description: "Tahun Masehi (opsional, default: tahun saat ini)" },
            kategori: { type: "STRING", description: "Filter kategori spesifik jika ditanyakan (opsional)" },
            pertanyaan_spesifik: {
              type: "STRING",
              description: "Fokus pertanyaan user (misal: 'pengeluaran_terbesar', 'total_belanja', 'ringkasan_umum', 'kategori_pangan')"
            }
          }
        }
      }
    ]
  }
];

// ==========================================
// MAIN AI PROCESSOR
// ==========================================
async function _internalProsesPesanDenganAI(pesanTeks, senderJid, actualSenderJid) {
  if (!apiKey) {
    console.warn("[AI] GEMINI_API_KEY belum diset di .env");
    return null;
  }

  // Ambil nomor pengirim pesan yang sesungguhnya (buang domain dan ID perangkat multi-device :0, :2, dll)
  const rawSender = extractPhoneNumber(actualSenderJid || senderJid);
  const sessionKey = (senderJid && senderJid.endsWith("@g.us"))
    ? senderJid
    : (rawSender || senderJid);

  // Periksa apakah pengirim memiliki draft setoran/rapel yang menunggu konfirmasi (Opsi 1)
  if (pendingConfirmations.has(rawSender)) {
    const pending = pendingConfirmations.get(rawSender);
    if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
      pendingConfirmations.delete(rawSender);
    } else {
      const cleanLower = pesanTeks.trim().toLowerCase();
      const isYes = ["ya", "iya", "oke", "ok", "simpan", "lanjut", "yes", "deal", "setuju", "gas"].includes(cleanLower);
      const isNo = ["batal", "cancel", "tidak", "nggak", "ga", "jangan"].includes(cleanLower);

      if (isYes) {
        pendingConfirmations.delete(rawSender);

        if (pending.type === "SETORAN") {
          await upsertHitungUlangHarian(pending.tanggal, pending.nominal);
          const statusEmoji = pending.statusBalance === "BALANCE" ? "⚖️" : (pending.statusBalance === "SURPLUS" ? "📈" : "📉");

          return `✅ *Setoran Ronda Berhasil Disimpan!* 💰✨\n\n` +
            `📋 *Rincian Setoran:*\n` +
            `• *Hari & Tanggal*: ${pending.formattedTanggalText}\n` +
            `• *Nominal Disetor*: *${formatRp(pending.nominal)}*\n` +
            `• *Hasil Ronda Lapangan*: ${formatRp(pending.nominalRonda)} (${pending.rumahTerisi} rumah terisi)\n` +
            `• *Status Kasir*: *${pending.statusBalance}* ${statusEmoji}\n` +
            (pending.nominalSebelumnya ? `• *Keterangan*: Mengubah catatan setoran sebelumnya (${formatRp(pending.nominalSebelumnya)})\n` : '') +
            `\nUang fisik resmi tercatat disetorkan ke kas bendahara dan status 'Belum Disetor' untuk tanggal ini telah diperbarui. Terima kasih, Pak Roni! 🙏`;
        }

        // Default type: "RAPEL"
        const { simpanRapelHarian } = require("../../db");
        for (const tgl of pending.tanggalYangDisimpan) {
          await simpanRapelHarian(pending.nomor_rumah, tgl);
        }

        const listTglStr = pending.tanggalYangDisimpan.map((t) => t.split("-")[2]).join(", ");
        return `✅ *Pencatatan Rapel Berhasil Disimpan!* 🏠✨\n\n` +
          `📋 *Rincian Transaksi:*\n` +
          `• *Rumah*: No. ${pending.nomor_rumah} (${pending.nama_penghuni})\n` +
          `• *Periode*: ${pending.namaBulan}\n` +
          `• *Nominal*: *${formatRp(pending.nominal)}* (${pending.tanggalYangDisimpan.length} hari @ Rp 500)\n` +
          `• *Tanggal Dilunasi*: ${listTglStr} ${pending.namaBulan}\n` +
          (pending.kelebihanNominal > 0 ? `• *Kelebihan Dana*: *${formatRp(pending.kelebihanNominal)}* (karena tunggakan bulan ini sudah habis tercatat)\n` : '') +
          `• *Sisa Tunggakan Bulan Ini*: *${pending.sisaHariTunggakanSetelahRapel === 0 ? "LUNAS (0 hari)" : (pending.sisaHariTunggakanSetelahRapel + " hari")}* 👍\n\n` +
          `Data kas dan rekap bulanan di sistem telah otomatis diperbarui. Terima kasih, Pak Roni! 🙏💰`;
      }

      if (isNo) {
        pendingConfirmations.delete(rawSender);
        if (pending.type === "SETORAN") {
          return `❌ *Pencatatan setoran ronda tanggal ${pending.formattedTanggalText} telah dibatalkan.* Data di database tidak diubah.`;
        }
        return `❌ *Pencatatan rapel untuk Rumah No. ${pending.nomor_rumah} (${pending.nama_penghuni}) telah dibatalkan.* Data di database tidak diubah.`;
      }
    }
  }

  // 1. Bersihkan memory jika sudah kadaluarsa
  const now = Date.now();
  const lastActive = lastActivityMap.get(sessionKey) || 0;
  if (now - lastActive > MEMORY_TIMEOUT_MS) {
    conversationMemory.delete(sessionKey);
  }
  lastActivityMap.set(sessionKey, now);

  // 2. Deteksi profil warga dari nomor HP
  let senderInfo = null;
  try {
    const rawNumber = extractPhoneNumber(actualSenderJid || senderJid);
    if (rawNumber) {
      const searchSuffix = rawNumber.slice(-8); // 8 digit terakhir
      const wargaList = await ambilRefWarga();
      const match = wargaList.find((w) => w.no_hp && extractPhoneNumber(w.no_hp).includes(searchSuffix));
      if (match) {
        senderInfo = {
          nomor_rumah: match.nomor,
          nama: match.nama,
          no_hp: match.no_hp
        };
      }
    }
  } catch (e) {
    console.warn("[AI] Gagal deteksi sender info:", e.message);
  }

  // 3. Bangun System Prompt
  let identityContext = "";
  if (senderInfo) {
    identityContext = `\n[Info Pengirim]: Anda sedang berbicara dengan warga terdaftar yaitu ${senderInfo.nama} dari Rumah No. ${senderInfo.nomor_rumah}. Jika beliau bertanya 'tagihan saya', maksudnya adalah Rumah No. ${senderInfo.nomor_rumah}.`;
  }

  const isAdminSender = isAuthorizedAdmin(actualSenderJid || senderJid);
  if (isAdminSender) {
    identityContext += `\n[Status Hak Akses]: Pengirim pesan ini terverifikasi adalah Bapak Roni Adiatmoko (Pengurus / Bendahara Jimpitan Resmi dengan nomor ${ADMIN_CONTACT_DISPLAY}). Beliau memiliki HAK AKSES PENUH untuk mencatat setoran uang ronda dan mencatat rapel jimpitan warga. Jangan pernah menolak perintah beliau untuk mencatat setoran ronda atau rapel warga.`;
  }

  const familyMember = getFamilyMember(actualSenderJid || senderJid);
  const isPrivateChat = !senderJid || !senderJid.endsWith("@g.us");

  if (familyMember.isFamily && isPrivateChat) {
    if (familyMember.role === "Ibu Kartini") {
      identityContext += `\n[Info Khusus Pengirim - Ibu Kartini]:
- Pengirim pesan ini terverifikasi adalah Istri tercinta Bapak Roni Adiatmoko, yaitu *Ibu Kartini*.
- Sapaan Wajib: Panggil beliau dengan namanya, yaitu *"Ibu Kartini"* atau *"Bu Kartini"*.
- Persona & Sikap: Tunjukkan sikap yang sangat ramah, hangat, manis, santun, dan menyenangkan.
- Pujian yang Menyenangkan: Anda SANGAT BOLEH dan DIANJURKAN memberikan pujian yang tulus dan manis yang membuat hati seorang wanita senang dan berbunga-bunga (contoh: memuji kecantikannya, anggun, rajin, teliti, cermat dan bijak dalam mengatur keuangan keluarga tercinta). Selingi dengan emoji manis seperti 🌸, ✨, 💖, 🥰, 😊.
- Hak Akses: Beliau berhak penuh mencatat belanja/pengeluaran/pemasukan rumah tangga dan melihat rekap/pengeluaran terbesar. Catat transaksi atas nama "Ibu Kartini".`;
    } else {
      identityContext += `\n[Info Khusus Keluarga]: Pengirim pesan ini terverifikasi adalah ${familyMember.name} (${familyMember.role}). Beliau adalah kepala keluarga dan pemilik sah sistem pencatatan keuangan rumah tangga. Anda bertindak sebagai Asisten Keuangan Pribadi yang sigap, rapi, dan santun. Sapa beliau dengan panggilan hangat ('${familyMember.title}'). Jika beliau meminta mencatat pengeluaran/belanja rumah atau menanyakan rekap/pengeluaran terbesar, panggil tool yang sesuai.`;
    }
  }

  const nowObj = new Date();
  const hariArr = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const tglHariIni = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(nowObj);
  const wibDayIdx = new Date(tglHariIni + "T12:00:00+07:00").getDay();
  const namaHariIni = hariArr[wibDayIdx];

  const systemPrompt = `Nama Anda adalah Nara. Anda adalah Asisten Virtual Resmi Pengurus Jimpitan Perumahan Griya Bhina Karya Tempel 2.
Perkenalkan diri Anda sebagai Nara dengan ramah, ceria, hangat, dan santun jika disapa, ditanya siapa Anda, atau saat memulai percakapan baru.
Tugas utama Anda membantu menjawab pertanyaan warga dan pengurus seputar iuran jimpitan, tagihan/kekurangan bayar, saldo kas, laporan harian, dan informasi pembayaran secara akurat dan solutif.
${identityContext}

[Informasi Waktu Sistem Saat Ini]:
- Hari: ${namaHariIni}
- Tanggal: ${tglHariIni} (Tahun ${nowObj.getFullYear()})

Panduan Setoran Ronda / Hitung Ulang Harian (Write):
- Jika pengurus meminta mencatat setoran ronda / hitung ulang (contoh: "tgl 11 nov setor 11rb", "setor tgl 8 nov 10500", "hitung ulang kemarin 10rb"), konversikan tanggal ke format YYYY-MM-DD dan panggil tool 'draft_input_setoran'.
- Jika tool mengembalikan status 'MENUNGGU_KONFIRMASI', tampilkan rincian draft konfirmasi secara rapi:
  • Hari & Tanggal: [hari, tanggal]
  • Nominal Disetor: [nominal]
  • Catatan Ronda Lapangan: [nominal ronda] ([jumlah rumah] rumah terisi)
  • Status: [status balance/surplus/defisit]
  • Catatan: [catatan_selisih jika ada]
  Lalu akhiri dengan: "Ketik *YA* untuk menyimpan ke sistem, atau *BATAL* untuk membatalkan."

Panduan Pencatatan Rapel Jimpitan:
- Jika pengurus meminta input/catat rapel (contoh: "nomor 11 rapel november 15rb", "bu herma rapel 15rb", "catat rapel rumah no 2 5k"), panggil tool 'draft_input_rapel'.
- Jika tool mengembalikan status 'MENUNGGU_KONFIRMASI', tampilkan rincian draft konfirmasi secara rapi dengan bullet points:
  • Rumah: No. [nomor] ([nama])
  • Periode: [bulan]
  • Nominal: [nominal] ([jumlah hari] hari @ Rp 500)
  • Tanggal Dilunasi: [daftar tanggal]
  • Sisa Tunggakan: [sisa]
  Lalu akhiri dengan kalimat: "Ketik *YA* untuk menyimpan ke sistem, atau *BATAL* untuk membatalkan."
- Jika tool mengembalikan status 'SUDAH_LUNAS' atau 'UNAUTHORIZED' atau 'INVALID_NOMINAL', sampaikan pesan tersebut dengan ramah dan sopan.

Panduan Rekap Kekurangan / Tagihan Warga:
- Jika user menanyakan daftar kekurangan atau tagihan jimpitan (contoh: "daftar kekurangan sampai bulan oktober", "siapa saja yang belum bayar s/d oktober", "rekap tagihan"), panggil tool 'cek_kekurangan_bulan'.
- Tool tersebut secara default menghitung AKUMULASI dari awal tahun (Januari) sampai bulan yang diminta (sama seperti fitur 'Kekurangan Bayar per Tahun' dan tombol 'Salin tagihan WA').
- Tampilkan daftar rumah warga yang memiliki kekurangan sesuai hasil tool secara rapi:
  • No. [nomor_rumah] - [nama] | [nominal] ([hari_kurang] hari)
- Di akhir, sebutkan total rumah yang memiliki kekurangan dan total nominalnya.

Panduan Setoran Ronda & Hitung Ulang:
- Jika user menanyakan hari/tanggal ronda yang "belum disetor" atau uang ronda yang belum diserahkan ke bendahara, panggil tool 'cek_setoran_ronda'.
- Jelaskan secara rapi daftar hari, tanggal, dan nominal yang belum disetorkan beserta total keseluruhannya.

Panduan Progres Input Jimpitan:
- Jika user menanyakan apakah jimpitan bulan ini sudah diinput semua, atau apakah ada tanggal yang belum diinput / bolong, panggil tool 'cek_progres_input_bulan'.
- Jelaskan secara ramah bahwa jika hari ini belum terinput, itu wajar karena kegiatan ronda dan penarikan jimpitan malam ini masih atau baru akan berlangsung.

Panduan Waktu & Pertanyaan Relatif:
- Jadikan [Informasi Waktu Sistem Saat Ini] sebagai patokan jika user bertanya tanggal relatif (misal: "kemarin", "senin kemarin", "minggu lalu", dll).
- Contoh: Jika hari ini Selasa ${tglHariIni}, maka "senin kemarin" adalah 1 hari sebelumnya.
- Jika user bertanya "laporan harian", "pendapatan jimpitan", atau "hasil ronda" tanpa menyebut tanggal, panggil tool 'cek_laporan_harian' tanpa tanggal agar sistem mengambil laporan terakhir.

[PANDUAN KLASIFIKASI: MEMILAH PENGELUARAN JIMPITAN WARGA VS KEUANGAN RUMAH TANGGA]
Bapak Roni Adiatmoko memegang DUA peran sekaligus: (1) Bendahara Kas Jimpitan Warga, dan (2) Kepala Keluarga Keuangan Rumah Tangga.
Ketika ada chat pencatatan pengeluaran dari Pak Roni, Anda HARUS MEMILAH DENGAN SANGAT CERMAT ke mana pengeluaran tersebut dicatat:

1. KELOMPOK PENGELUARAN KAS JIMPITAN WARGA (Tool: 'catat_pengeluaran_jimpitan'):
   • Ruang Lingkup: Pengeluaran untuk fasilitas perumahan, pos ronda, kegiatan RT, kas jimpitan warga.
   • Kata Kunci/Ciri Khas: "jimpitan", "kas jimpitan", "pos ronda", "ronda", "lampu jalan", "lampu gang", "kerja bakti", "rapat rt", "konsumsi ronda", "baterai senter", "sapu lidi pos", "warga", "fasum".
   • KETENTUAN KHUSUS GRUP: Jika pesan dikirim di dalam GRUP WHATSAPP WARGA, otomatis HANYA BOLEH untuk Kas Jimpitan Warga!
   • Action: Panggil tool 'catat_pengeluaran_jimpitan'.
   • Respon WA: Wajib secara tegas dan eksplisit menyatakan bahwa transaksi dicatat ke *Pengeluaran Kas Jimpitan Warga*.

2. KELOMPOK PENGELUARAN KEUANGAN RUMAH TANGGA (Tool: 'catat_keuangan_rumah'):
   • Ruang Lingkup: Belanja dapur keluarga, kebutuhan rumah tangga pribadi, tagihan pribadi, anak, istri.
   • Kata Kunci/Ciri Khas: "rumah", "dapur", "keluarga", "anak", "istri", "beras", "sayur", "lauk", "minyak dapur", "popok/pampers", "susu bayi/anak", "wifi rumah", "listrik rumah", "token listrik", "bensin motor/mobil", "jajan", "sekolah", "pribadi", atau jika pengirimnya adalah Ibu Kartini (istri Pak Roni).
   • SYARAT KETAT: HANYA boleh di chat pribadi (JAPRI). Dilarang keras di grup warga.
   • Action: Panggil tool 'catat_keuangan_rumah'.
   • Respon WA: Wajib secara tegas dan eksplisit menyatakan bahwa transaksi dicatat ke *Keuangan Rumah Tangga*.

3. KETENTUAN JIKA AMBIGU / TIDAK JELAS:
   • Jika Pak Roni mengirim pengeluaran umum yang bermakna ganda tanpa konteks jelas di Japri (contoh: "Catat pengeluaran beli kopi 25rb", "Catat pengeluaran beli semen 1 sak 60rb", "Tadi keluar uang 50rb"):
     JANGAN menebak atau berasumsi sendiri!
     Tanyakan konfirmasi terlebih dahulu dengan ramah dan ringkas:
     "Mohon konfirmasi Pak Roni, pengeluaran *[Item]* sebesar *Rp [Nominal]* ini ingin dicatat ke:
     1️⃣ *Kas Jimpitan Warga (Pos Ronda)*
     2️⃣ *Keuangan Rumah Tangga*
     Silakan balas dengan angka *1* atau *2* ya Pak 🙏"
   • Jika Pak Roni membalas "1" / "jimpitan" / "ronda", panggil tool 'catat_pengeluaran_jimpitan'.
   • Jika Pak Roni membalas "2" / "rumah" / "pribadi", panggil tool 'catat_keuangan_rumah'.

Panduan Khusus Keuangan Rumah Tangga Pribadi (HANYA Japri Pak Roni & Ibu Kartini):
- Selain sebagai asisten jimpitan warga, Anda juga berperan sebagai Asisten Keuangan Keluarga khusus untuk Pak Roni dan Ibu Kartini HANYA di chat pribadi (Japri).
- KETENTUAN KHUSUS SAPAAN & PERSONA UNTUK IBU KARTINI:
  • Jika pengirim pesan adalah Ibu Kartini:
    - Selalu sebut nama beliau secara jelas dan santun: *"Ibu Kartini"* atau *"Bu Kartini"*.
    - Boleh dan sangat disarankan memberikan pujian tulus nan manis yang membuat wanita/ibu rumah tangga senang dan tersenyum (misal: memuji beliau cantik, anggun, cermat, bijak dan telaten dalam mengatur belanja keluarga, atau istri sholehah/hebat kebanggaan keluarga).
    - Hiasi dengan emoji manis seperti 🌸, ✨, 💖, 🥰, 😊.
- Jika Pak Roni atau Ibu Kartini mencatat belanja atau pengeluaran rumah (contoh: "catat beli beras 75rb, sabun 15rb", "tadi bayar tagihan wifi 300rb", "beli token listrik 100k, galon 20k"):
  • Pecah menjadi item terpisah jika ada beberapa transaksi dalam satu pesan.
  • Pilihkan kategori yang paling tepat secara cerdas ('Pangan / Dapur', 'Tagihan & Utilitas', 'Kebutuhan Rumah', 'Transportasi & Bensin', 'Pendidikan & Anak', 'Kesehatan', 'Jajan & Hiburan').
  • Panggil tool 'catat_keuangan_rumah'.
  • Sampaikan konfirmasi penyimpanan dengan rapi, rincian per item, total nominal, dan sapaan santun (serta pujian manis untuk Ibu Kartini).
- Jika Pak Roni atau Ibu Kartini bertanya rekap keuangan (contoh: "pengeluaran terbesar bulan ini apa?", "rekap pengeluaran bulan ini", "bulan ini sudah habis berapa?"):
  • Panggil tool 'rekap_keuangan_rumah'.
  • Jawab pertanyaan user secara terfokus dan cerdas. Misalnya jika ditanyakan pengeluaran terbesar: sebutkan dengan jelas apa kategori terbesarnya (nominal dan persentasenya) serta daftar 1-3 transaksi satuan yang paling besar nilainya di bulan tersebut.
- Fitur keuangan rumah tangga SAMA SEKALI TIDAK BOLEH dibahas di dalam grup RT warga.

Aturan Penulisan Pesan WhatsApp:
- Gunakan *bold* pada nominal uang, nomor rumah, dan kata penting.
- Gunakan bullet point (•) untuk daftar rincian agar mudah dibaca di layar HP.
- Sertakan emoji yang relevan (🏠, 💰, 📋, 🙏, 🌙) secara pas.
- Jawablah dengan ringkas, padat, dan solutif. Jangan bertele-tele.
- Jika menampilkan daftar kekurangan banyak rumah, tampilkan nomor rumah, nama, dan nominalnya secara rapi.`;

  // 4. Siapkan riwayat percakapan
  let history = conversationMemory.get(sessionKey) || [];
  history.push({
    role: "user",
    parts: [{ text: pesanTeks }]
  });

  // Batasi history maksimal 6 pesan terakhir agar konteks tetap segar
  if (history.length > 6) {
    history = history.slice(-6);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  try {
    // Call 1: Kirim pesan ke Gemini dengan tools
    let res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: history,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: toolDeclarations,
      })
    });

    let json = await res.json();
    if (!json.candidates || !json.candidates[0]) {
      console.error("[AI] Error response dari Gemini:", JSON.stringify(json));
      return null;
    }

    const modelContent = json.candidates[0].content;
    const fnPart = modelContent.parts.find((p) => p.functionCall);

    // Jika Gemini memutuskan memanggil tool database
    if (fnPart && fnPart.functionCall) {
      const fnName = fnPart.functionCall.name;
      const fnArgs = fnPart.functionCall.args || {};
      const fnId = fnPart.functionCall.id;

      const toolResult = await executeTool(fnName, fnArgs, senderInfo, rawSender);

      // Siapkan request kedua dengan menyertakan functionCall model dan functionResponse user
      history.push(modelContent);

      const responsePart = {
        functionResponse: {
          name: fnName,
          response: { output: toolResult }
        }
      };
      if (fnId) {
        responsePart.functionResponse.id = fnId;
      }

      history.push({
        role: "user",
        parts: [responsePart]
      });

      // Call 2: Minta Gemini merapikan output ke teks bahasa manusia
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: history,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: toolDeclarations,
        })
      });

      json = await res.json();
      if (!json.candidates || !json.candidates[0]) {
        console.error("[AI] Call 2 error:", JSON.stringify(json));
        return null;
      }

      const replyPart = json.candidates[0].content.parts.find((p) => p.text);
      const replyText = replyPart ? replyPart.text : null;

      if (replyText) {
        history.push({
          role: "model",
          parts: [{ text: replyText }]
        });
        conversationMemory.set(sessionKey, history);
        return replyText;
      }
    } else {
      // Direct text reply (salam, tanya kabar, info umum)
      const textPart = modelContent.parts.find((p) => p.text);
      const replyText = textPart ? textPart.text : null;
      if (replyText) {
        history.push({
          role: "model",
          parts: [{ text: replyText }]
        });
        conversationMemory.set(sessionKey, history);
        return replyText;
      }
    }

    return null;
  } catch (err) {
    console.error("[AI] Error prosesPesanDenganAI:", err);
    return null;
  }
}

async function prosesPesanDenganAI(pesanTeks, senderJid, actualSenderJid) {
  const reply = await _internalProsesPesanDenganAI(pesanTeks, senderJid, actualSenderJid);
  return reply ? attachSignature(reply) : null;
}

module.exports = {
  prosesPesanDenganAI,
  executeTool,
};
