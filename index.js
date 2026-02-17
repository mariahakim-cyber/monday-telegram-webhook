import express from "express";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

// IDs de tus columnas en Monday
const COL_DESCRIPCION = "descripci_n9";
const COL_SOLICITANTE = "solicitante";

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown", // para que *...* salga en negritas
    }),
  });

  if (!resp.ok) console.log("Telegram error:", await resp.text());
}

// Convierte column_value a algo legible
function prettyColumnValue(col) {
  if (!col) return "";
  // col.text suele venir ya human-readable
  if (col.text) return col.text;

  // fallback: intentar leer value
  if (!col.value) return "";
  try {
    const v = JSON.parse(col.value);

    // people/person
    if (Array.isArray(v?.personsAndTeams) && v.personsAndTeams.length) {
      return v.personsAndTeams.map(p => p.name || p.id).join(", ");
    }

    // general fallback
    return JSON.stringify(v);
  } catch {
    return String(col.value);
  }
}

async function fetchMondayItemFields(itemId) {
  if (!MONDAY_API_TOKEN) return { descripcion: "", solicitante: "" };

  const query = `
    query ($itemId: [ID!]) {
      items(ids: $itemId) {
        column_values(ids: ["${COL_DESCRIPCION}", "${COL_SOLICITANTE}"]) {
          id
          text
          value
        }
      }
    }
  `;

  const resp = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_API_TOKEN,
    },
    body: JSON.stringify({ query, variables: { itemId: String(itemId) } }),
  });

  const data = await resp.json();
  const cols = data?.data?.items?.[0]?.column_values || [];

  const descripcionCol = cols.find(c => c.id === COL_DESCRIPCION);
  const solicitanteCol = cols.find(c => c.id === COL_SOLICITANTE);

  return {
    descripcion: prettyColumnValue(descripcionCol),
    solicitante: prettyColumnValue(solicitanteCol),
  };
}

app.get("/", (req, res) => res.send("ok"));
app.get("/monday/webhook", (req, res) => res.status(200).json({ ok: true }));

app.post("/monday/webhook", async (req, res) => {
  // ✅ Monday verification
  if (req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const event = req.body?.event || {};
  const itemId = event.pulseId ?? event.itemId ?? "unknown";

  // valor nuevo del status
  const newValue =
    event.value?.label?.text ??
    event.value?.text ??
    (typeof event.value === "string" ? event.value : "");

  // Traer descripcion + solicitante desde Monday
  let descripcion = "";
  let solicitante = "";
  try {
    const fields = await fetchMondayItemFields(itemId);
    descripcion = fields.descripcion || "";
    solicitante = fields.solicitante || "";
  } catch (e) {
    console.log("Monday fetch error:", e?.message || e);
  }

  const msg =
    `📌 *Mesa de Ayuda: Actualización Nivel de Criticidad*\n` +
    `#️⃣ *Item:* ${itemId}\n` +
    `📝 *Descripción:* ${descripcion || "(vacío)"}\n` +
    `🙋🏽 *Solicitante:* ${solicitante || "(vacío)"}\n` +
    `🚨 *To:* ${newValue || "(sin valor)"}`;

  await sendTelegram(msg);
  return res.status(200).json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("listening", port));
