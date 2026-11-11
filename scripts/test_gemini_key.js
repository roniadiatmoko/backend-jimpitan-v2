require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY belum diset di file .env");
}

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [
          { text: "Halo! Jawab dalam 1 kalimat ceria: siapa kamu?" }
        ]
      }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (json.candidates && json.candidates[0]) {
    console.log('Gemini Responded:');
    console.log(json.candidates[0].content.parts[0].text);
  } else {
    console.error('Gemini Error:', JSON.stringify(json, null, 2));
  }
}

test();
