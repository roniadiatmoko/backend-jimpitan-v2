require('dotenv').config();
const { getHitungKekuranganTahun } = require('../src/features/laporan/model');
const db = require('../db');

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

async function executeTool(name, args) {
  console.log(`[Tool Call] ${name} with args:`, args);

  if (name === "cek_kekurangan_bulan") {
    const month = Number(args.bulan) || (new Date().getMonth() + 1);
    const year = Number(args.tahun) || new Date().getFullYear();
    const monthNames = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
    const monthKey = monthNames[month - 1] || "november";

    const data = await getHitungKekuranganTahun(year);
    const wargaList = await db.ambilRefWarga();
    const homeMap = {};
    for (const w of wargaList) homeMap[String(w.nomor)] = w;

    const listTagihan = data
      .map(item => {
        const days = Number(item[monthKey]) || 0;
        if (days <= 0) return null;
        const nama = homeMap[item.nomor_rumah]?.nama || "-";
        return {
          nomor_rumah: item.nomor_rumah,
          nama: nama,
          hari_kurang: days,
          nominal: days * 500,
        };
      })
      .filter(Boolean);

    listTagihan.sort((a, b) => Number(a.nomor_rumah) - Number(b.nomor_rumah));

    return {
      bulan: monthKey,
      tahun: year,
      total_rumah_belum_lunas: listTagihan.length,
      daftar_tagihan: listTagihan.slice(0, 30), // ambil daftar
    };
  }

  if (name === "cek_tagihan_rumah") {
    const nomor = String(args.nomor_rumah || "").trim();
    const year = Number(args.tahun) || new Date().getFullYear();
    const data = await getHitungKekuranganTahun(year);
    const item = data.find(d => String(d.nomor_rumah) === nomor);
    const warga = await db.ambilRefWargaByNomor(nomor);

    if (!item) {
      return { status: "NOT_FOUND", message: `Rumah nomor ${nomor} tidak ditemukan.` };
    }

    const monthNames = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
    const rincianBulan = [];
    let totalHari = 0;

    monthNames.forEach((m, idx) => {
      const days = Number(item[m]) || 0;
      if (days > 0) {
        totalHari += days;
        rincianBulan.push({ bulan: m, hari: days, nominal: days * 500 });
      }
    });

    return {
      nomor_rumah: nomor,
      nama: warga?.nama || "-",
      sudah_menghuni: warga?.sudah_menghuni === 1,
      total_hari: totalHari,
      total_nominal: totalHari * 500,
      rincian: rincianBulan,
    };
  }

  if (name === "info_cara_pembayaran") {
    return {
      tunai: [
        "Rumah No. 43 (Bapak Topik)",
        "Rumah No. 33 (Bapak Roni)"
      ],
      transfer: {
        metode: "DANA",
        nomor: "089673378055",
        atas_nama: "Roni Adiatmoko"
      },
      catatan: "Mohon konfirmasi ke pengurus setelah melakukan pembayaran."
    };
  }

  return { error: `Tool ${name} not found` };
}

async function testPrompt(userQuery) {
  console.log(`\n========================================`);
  console.log(`User Query: "${userQuery}"`);
  console.log(`========================================`);

  const tools = [
    {
      functionDeclarations: [
        {
          name: "cek_kekurangan_bulan",
          description: "Mengecek daftar rumah warga yang memiliki kekurangan bayar jimpitan pada bulan dan tahun tertentu.",
          parameters: {
            type: "OBJECT",
            properties: {
              bulan: { type: "INTEGER", description: "Bulan 1 sampai 12 (misal 11 untuk November)" },
              tahun: { type: "INTEGER", description: "Tahun (misal 2026)" }
            },
            required: ["bulan"]
          }
        },
        {
          name: "cek_tagihan_rumah",
          description: "Mengecek rincian tagihan atau kekurangan jimpitan untuk satu nomor rumah tertentu.",
          parameters: {
            type: "OBJECT",
            properties: {
              nomor_rumah: { type: "STRING", description: "Nomor rumah (contoh: '20' atau '1')" }
            },
            required: ["nomor_rumah"]
          }
        },
        {
          name: "info_cara_pembayaran",
          description: "Memberikan informasi rekening dan cara pembayaran jimpitan.",
          parameters: {
            type: "OBJECT",
            properties: {}
          }
        }
      ]
    }
  ];

  const systemPrompt = `Anda adalah Asisten Virtual Resmi Pengurus Jimpitan Perumahan Griya Bhina Karya Tempel 2.
Tugas Anda membantu warga dan pengurus seputar jimpitan, tagihan, dan pembayaran dengan ramah, sopan, dan santun.
Gunakan format teks WhatsApp:
- Gunakan *bold* untuk poin penting atau nominal uang.
- Gunakan bullet point (•) untuk rincian.
- Tambahkan emoji yang relevan (🏠, 💰, 📋, 🙏) agar pesan menarik dan mudah dibaca.
- Jawab dalam Bahasa Indonesia yang wajar dan bersahabat.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let contents = [
    {
      role: "user",
      parts: [{ text: userQuery }]
    }
  ];

  // Call 1: Kirim query ke Gemini
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools,
    })
  });

  let json = await res.json();

  if (!json.candidates || !json.candidates[0]) {
    console.error("Gemini Error:", JSON.stringify(json, null, 2));
    return;
  }

  const part = json.candidates[0].content.parts[0];

  // Jika Gemini memutuskan panggil function
  if (part.functionCall) {
    const fnName = part.functionCall.name;
    const fnArgs = part.functionCall.args || {};
    const toolResult = await executeTool(fnName, fnArgs);

    // Call 2: Kirim balik hasil function ke Gemini untuk disusun rapi
    contents.push({
      role: "model",
      parts: [{ functionCall: part.functionCall }]
    });

    contents.push({
      role: "function",
      parts: [
        {
          functionResponse: {
            name: fnName,
            response: { result: toolResult }
          }
        }
      ]
    });

    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools,
      })
    });

    json = await res.json();
    const finalText = json.candidates[0].content.parts[0].text;
    console.log("\n[AI WhatsApp Reply]:\n" + finalText);
  } else if (part.text) {
    console.log("\n[AI Direct Reply]:\n" + part.text);
  }
}

async function run() {
  await testPrompt("tampilkan kekurangan jimpitan bulan november");
  await testPrompt("berapa tagihan rumah nomor 20?");
  await testPrompt("cara bayar jimpitan kemana ya?");
}

run();
