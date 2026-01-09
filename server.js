import express from "express";

const app = express();
app.use(express.json());

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Google Sheets Web App
const SHEETS_WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;

// Vapi
const VAPI_TOKEN = process.env.VAPI_TOKEN;
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

// ===== CORS =====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function isE164(phone) {
  return typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone.trim());
}

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Request failed");
  return data;
}

// ===== 1) Save lead to Google Sheets =====
app.post("/api/lead", async (req, res) => {
  try {
    if (!SHEETS_WEBAPP_URL) return res.status(500).json({ error: "Missing SHEETS_WEBAPP_URL" });

    const lead = req.body || {};
    const required = ["name", "business", "location", "email", "phone", "need"];
    for (const k of required) {
      if (!lead[k] || String(lead[k]).trim() === "") {
        return res.status(400).json({ error: `Missing field: ${k}` });
      }
    }
    if (!isE164(lead.phone)) return res.status(400).json({ error: "Invalid phone. Use E.164 like +14155552671" });

    // Always ensure timestamp/source exist
    const payload = {
      ts: lead.ts || new Date().toISOString(),
      lang: lead.lang || "en",
      name: lead.name,
      business: lead.business,
      location: lead.location,
      email: lead.email,
      phone: lead.phone,
      need: lead.need,
      message: lead.message || "",
      source: lead.source || "inis-landing"
    };

    const out = await postJSON(SHEETS_WEBAPP_URL, payload);
    return res.json({ ok: true, sheets: out });
  } catch (e) {
    return res.status(500).json({ error: "Failed to write lead to Sheets", details: String(e) });
  }
});

// ===== 2) Call me now (Vapi outbound) =====
app.post("/api/call-me", async (req, res) => {
  try {
    if (!VAPI_TOKEN || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
      return res.status(500).json({ error: "Missing Vapi config (VAPI_TOKEN / VAPI_ASSISTANT_ID / VAPI_PHONE_NUMBER_ID)" });
    }
    const phone = req.body?.phone;
    if (!isE164(phone)) return res.status(400).json({ error: "Invalid phone. Use E.164 like +14155552671" });

    const payload = {
      assistantId: VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number: phone.trim() }
    };

    const r = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${VAPI_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: "Vapi call failed", details: data });

    return res.json({ ok: true, vapi: data });
  } catch (e) {
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
});

app.listen(PORT, () => console.log(`INIS API running on port ${PORT}`));
