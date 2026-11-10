const fs = require('fs');
const target = 'e:/jimpitan/frontend/src/features/admin/whatsapp/StatusWhatsApp.js';
let code = fs.readFileSync(target, 'utf8');

// 1. Add state for chat tester
if (!code.includes('testChatPrompt')) {
  code = code.replace(
    '  const [lastChecked, setLastChecked] = useState(null);\n  const timerRef = useRef(null);',
    '  const [lastChecked, setLastChecked] = useState(null);\n  const timerRef = useRef(null);\n  const [testChatPrompt, setTestChatPrompt] = useState("");\n  const [testChatReply, setTestChatReply] = useState(null);\n  const [chatLoading, setChatLoading] = useState(false);'
  );
}

// 2. Add handleSendTestChat
const chatFn = `
  const handleSendTestChat = async (queryText) => {
    const q = queryText || testChatPrompt;
    if (!q || !q.trim()) return;
    setChatLoading(true);
    setTestChatReply(null);
    try {
      const res = await fetch(\`\${ENDPOINT_BASE_URL}/api/whatsapp/chat-test\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const json = await res.json();
      if (json.status === "OK") {
        setTestChatReply(json.reply);
      } else {
        throw new Error(json.message || "Gagal mendapatkan balasan AI");
      }
    } catch (err) {
      setTestChatReply("❌ Error: " + err.message);
    } finally {
      setChatLoading(false);
    }
  };
`;

if (!code.includes('handleSendTestChat')) {
  code = code.replace(
    '  return (\n    <div className="space-y-6 max-w-5xl mx-auto">',
    `${chatFn}\n  return (\n    <div className="space-y-6 max-w-5xl mx-auto">`
  );
}

// 3. Add AI Tester Card before the closing </div>
const chatCard = `
          {/* Card Uji Coba Simulasi Chat AI */}
          <Card className="p-6 border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/20 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white text-lg shadow-sm">
                  🤖
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Simulasi & Uji Coba Chat AI</h3>
                  <p className="text-xs text-muted">
                    Uji coba bagaimana AI menjawab pertanyaan warga secara interaktif.
                  </p>
                </div>
              </div>
              <Badge tone="success" className="self-start sm:self-auto">
                Gemini 3.5 Flash-Lite Active
              </Badge>
            </div>

            {/* Quick Chips */}
            <div className="mb-4">
              <span className="text-xs font-semibold text-muted block mb-2">Contoh Pertanyaan Cepat:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  "tampilkan kekurangan jimpitan bulan november",
                  "berapa tagihan rumah nomor 20?",
                  "berapa saldo kas jimpitan sekarang?",
                  "cara bayar jimpitan kemana?",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTestChatPrompt(preset);
                      handleSendTestChat(preset);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition active:scale-95 cursor-pointer"
                  >
                    <span>💬</span>
                    <span>{preset}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat Input */}
            <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-4">
              <input
                type="text"
                value={testChatPrompt}
                onChange={(e) => setTestChatPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendTestChat()}
                placeholder="Ketik pertanyaan untuk bot AI (contoh: 'tampilkan kekurangan november')..."
                className="flex-1 rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
              <Button
                variant="primary"
                onClick={() => handleSendTestChat()}
                disabled={chatLoading || !testChatPrompt.trim()}
                className="!bg-emerald-600 hover:!bg-emerald-700 !text-white flex items-center justify-center gap-2 text-sm px-5 py-2.5 shadow-sm"
              >
                {chatLoading ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    <span>Sedang Berpikir...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Tanya AI</span>
                  </>
                )}
              </Button>
            </div>

            {/* Chat Result Box */}
            {testChatReply && (
              <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-emerald-700 uppercase tracking-wide">
                  <span>🤖</span>
                  <span>Balasan WhatsApp Otomatis:</span>
                </div>
                <div className="rounded-lg bg-surface/70 p-4 text-xs font-mono text-ink whitespace-pre-wrap leading-relaxed border border-line">
                  {testChatReply}
                </div>
              </div>
            )}
          </Card>
`;

if (!code.includes('Simulasi & Uji Coba Chat AI')) {
  code = code.replace(
    '        </>\n      )}\n    </div>',
    `        </>\n      )}\n${chatCard}\n    </div>`
  );
  fs.writeFileSync(target, code, 'utf8');
  console.log('StatusWhatsApp.js updated with AI tester card.');
} else {
  console.log('Already added.');
}
