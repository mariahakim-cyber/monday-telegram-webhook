import express from "express";

const app = express();
app.use(express.json({ type: "*/*" }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

// IDs de columnas en Monday
const COL_DESCRIPCION = "descripci_n9";
const COL_SOLICITANTE = "solicitante";
const COL_PROYECTO = "lookup_mktwbpyv";

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!resp.ok) {
    console.log("Telegram error:", await resp.text());
  }
}

function prettyColumnValue(col) {
  if (!col) return "";

  if (col.text) return col.text;

  if (col.display_value) return col.display_value;

  if (!col.value) return "";

  try {
    const v = JSON.parse(col.value);

    if (Array.isArray(v?.personsAndTeams) && v.personsAndTeams.length) {
      return v.personsAndTeams.map(p => p.name || p.id).join(", ");
    }

    if (typeof v?.display_value === "string" && v.display_value) {
      return v.display_value;
    }

    if (Array.isArray(v?.display_value) && v.display_value.length) {
      return v.display_value.join(", ");
    }

    if (Array.isArray(v?.linkedPulseIds) && v.linkedPulseIds.length) {
      return v.linkedPulseIds.map(p => p.linkedPulseId || p.id).join(", ");
    }

    return JSON.stringify(v);
  } catch {
    return String(col.value);
  }
}

async function fetchMondayItemFields(itemId) {
  if (!MONDAY_API_TOKEN) {
    return { descripcion: "", solicitante: "", proyecto: "" };
  }

  const query = `
    query ($itemId: [ID!]) {
      items(ids: $itemId) {
        column_values(ids: ["${COL_DESCRIPCION}", "${COL_SOLICITANTE}", "${COL_PROYECTO}"]) {
          id
          text
          value
          ... on MirrorValue {
            display_value
          }
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
    body: JSON.stringify({
      query,
      variables: { itemId: String(itemId) },
    }),
  });

  const data = await resp.json();
  const cols = data?.data?.items?.[0]?.column_values || [];

  const descripcionCol = cols.find(c => c.id === COL_DESCRIPCION);
  const solicitanteCol = cols.find(c => c.id === COL_SOLICITANTE);
  const proyectoCol = cols.find(c => c.id === COL_PROYECTO);

  return {
    descripcion: prettyColumnValue(descripcionCol),
    solicitante: prettyColumnValue(solicitanteCol),
    proyecto: prettyColumnValue(proyectoCol),
  };
}

app.get("/", (req, res) => res.send("ok"));
app.get("/monday/webhook", (req, res) => res.status(200).json({ ok: true }));

app.post("/monday/webhook", async (req, res) => {
  if (req.body?.challenge) {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  const event = req.body?.event || {};
  const itemId = event.pulseId ?? event.itemId ?? "unknown";

  const newValue =
    event.value?.label?.text ??
    event.value?.text ??
    (typeof event.value === "string" ? event.value : "");

  let descripcion = "";
  let solicitante = "";
  let proyecto = "";

  try {
    const fields = await fetchMondayItemFields(itemId);
    descripcion = fields.descripcion || "";
    solicitante = fields.solicitante || "";
    proyecto = fields.proyecto || "";
  } catch (e) {
    console.log("Monday fetch error:", e?.message || e);
  }

  const msg =
    `📌 *Mesa de Ayuda: Actualización Nivel de Criticidad*\n` +
    `📂 *Proyecto:* ${proyecto || "(vacío)"}\n` +
    `#️⃣ *Item:* ${itemId}\n` +
    `📝 *Descripción:* ${descripcion || "(vacío)"}\n` +
    `🙋🏽 *Solicitante:* ${solicitante || "(vacío)"}\n` +
    `🚨 *To:* ${newValue || "(sin valor)"}`;

  await sendTelegram(msg);
  return res.status(200).json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("listening", port));
