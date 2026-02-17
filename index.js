import express from "express";

const app = express();
app.use(express.json());

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(text) {
  if (!TOKEN || !CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  });

  if (!resp.ok) console.log("Telegram error:", await resp.text());
}

app.get("/", (req, res) => res.send("ok"));

app.post("/monday/webhook", async (req, res) => {
  // ✅ Monday verification
  if (req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // ✅ Event
  const event = req.body?.event || {};
  const boardId = event.boardId ?? "unknown";
  const itemId = event.pulseId ?? event.itemId ?? "unknown";
  const columnId = event.columnId ?? "unknown";

  const newValue =
    event.value?.label?.text ??
    event.value?.text ??
    (typeof event.value === "string" ? event.value : JSON.stringify(event.value ?? {}));

  const prevValue =
    event.previousValue?.label?.text ??
    event.previousValue?.text ??
    (typeof event.previousValue === "string" ? event.previousValue : "");

  const msg =
    `📌 Monday status update\n` +
    `Board: ${boardId}\n` +
    `Item: ${itemId}\n` +
    `Column: ${columnId}\n` +
    (prevValue ? `From: ${prevValue}\n` : "") +
    `To: ${newValue}`;

  await sendTelegram(msg);
  return res.status(200).json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("listening", port));
