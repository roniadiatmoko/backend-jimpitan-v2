let messageQueue = Promise.resolve();
let nextAllowedAt = 0;

const minimumIntervalMs = 1100;
const retryDelaysMs = [1000, 3000, 8000];

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function sendTelegramMessage(text, { parseMode } = {}) {
  const task = messageQueue.then(async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.ID_TELEGRAM;
    if (!token || !chatId) {
      throw new Error("TELEGRAM_BOT_TOKEN / ID_TELEGRAM belum diset.");
    }

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      const waitMs = Math.max(0, nextAllowedAt - Date.now());
      if (waitMs > 0) await delay(waitMs);

      let response;
      let result;
      try {
        response = await fetch(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              ...(parseMode ? { parse_mode: parseMode } : {}),
            }),
          },
        );
        result = await response.json();
      } catch (error) {
        if (attempt >= retryDelaysMs.length) throw error;
        nextAllowedAt = Date.now() + retryDelaysMs[attempt];
        continue;
      }

      if (response.ok && result.ok) {
        nextAllowedAt = Date.now() + minimumIntervalMs;
        return result.result;
      }

      const retryAfter = Number(result.parameters?.retry_after);
      if (
        response.status === 429 &&
        retryAfter > 0 &&
        attempt < retryDelaysMs.length
      ) {
        nextAllowedAt = Date.now() + retryAfter * 1000;
        continue;
      }

      throw new Error(
        result.description || `Telegram HTTP ${response.status}`,
      );
    }
  });

  messageQueue = task.catch(() => {});
  return task;
}

module.exports = { sendTelegramMessage };