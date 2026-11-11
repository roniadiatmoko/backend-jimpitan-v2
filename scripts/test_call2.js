require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const tools = [{
    functionDeclarations: [{
      name: "cek_kekurangan_bulan",
      description: "Mengecek kekurangan bayar bulan tertentu",
      parameters: {
        type: "OBJECT",
        properties: {
          bulan: { type: "INTEGER" }
        },
        required: ["bulan"]
      }
    }]
  }];

  // 1. Initial call
  const call1Res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "tampilkan kekurangan bulan november" }] }],
      tools,
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    })
  });

  const call1Json = await call1Res.json();
  console.log("Call 1 parts:", JSON.stringify(call1Json.candidates[0].content.parts, null, 2));

  const modelParts = call1Json.candidates[0].content.parts;
  const fnCall = modelParts.find(p => p.functionCall)?.functionCall;

  // 2. Follow-up call passing the exact model parts
  const call2Res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: "tampilkan kekurangan bulan november" }] },
        { role: "model", parts: modelParts },
        {
          role: "user",
          parts: [{
            functionResponse: {
              name: fnCall.name,
              response: {
                total_rumah: 2,
                daftar: [
                  { rumah: "1", nama: "Bp. Hartono", nominal: "Rp 5.500" },
                  { rumah: "2", nama: "Bp. Yuli", nominal: "Rp 4.500" }
                ]
              }
            }
          }]
        }
      ],
      tools,
      generationConfig: {
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    })
  });

  const call2Json = await call2Res.json();
  console.log("Call 2 response:", JSON.stringify(call2Json, null, 2));
}

test();
