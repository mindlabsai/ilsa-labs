// /api/ilsa/[action].js  — Vercel serverless handler for ILSA server tools.
// Three actions: capture_lead, request_demo, log_unanswered.
// ElevenLabs calls these as webhooks. Auth is a shared secret in x-ilsa-secret.

const crypto = require("node:crypto");

const SECRET = process.env.ILSA_WEBHOOK_SECRET;          // shared secret configured in the ElevenLabs tool
const NOTIFY_URL = process.env.ILSA_NOTIFY_URL;          // Slack incoming webhook, or swap for email/CRM
const SHEET_URL = process.env.ILSA_SHEET_WEBHOOK;        // optional: Apps Script / Sheets endpoint for a simple ledger

const LABS = new Set(["ASTON", "37T", "teo", "InnerLayer", "Texlex", "ILSA Labs", "none"]);
const SEGMENTS = new Set(["clinician", "developer", "creator", "org", "investor", "press", "unknown"]);

const schemas = {
  capture_lead: {
    required: ["name", "contact", "interest"],
    optional: ["lab", "segment", "summary"],
  },
  request_demo: {
    required: ["name", "contact", "lab"],
    optional: ["organisation", "preferred_time", "segment", "summary"],
  },
  log_unanswered: {
    required: ["question"],
    optional: ["lab", "segment"],
  },
};

function verify(req) {
  if (!SECRET) return false;
  const got = String(req.headers["x-ilsa-secret"] || "");
  const a = Buffer.from(got);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function clean(s, max = 500) {
  return String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function validate(action, body) {
  const schema = schemas[action];
  if (!schema) return { error: "unknown action" };
  const out = {};
  for (const k of schema.required) {
    if (!body[k]) return { error: `missing ${k}` };
    out[k] = clean(body[k]);
  }
  for (const k of schema.optional) if (body[k] != null) out[k] = clean(body[k], k === "summary" ? 1500 : 500);
  if (out.lab && !LABS.has(out.lab)) out.lab = "none";
  if (out.segment && !SEGMENTS.has(out.segment)) out.segment = "unknown";
  return { data: out };
}

async function post(url, payload) {
  if (!url) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function slackText(action, d) {
  const head = { capture_lead: "New lead via ILSA", request_demo: "Demo request via ILSA", log_unanswered: "ILSA couldn't answer" }[action];
  const lines = Object.entries(d).map(([k, v]) => `*${k}:* ${v}`);
  return { text: `${head}\n${lines.join("\n")}` };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!SECRET) return res.status(503).json({ error: "not configured" });
  if (!verify(req)) return res.status(401).json({ error: "bad signature" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "bad json" }); }
  }
  if (!body || typeof body !== "object") return res.status(400).json({ error: "bad json" });

  const action = req.query.action;
  const { data, error } = validate(action, body);
  if (error) return res.status(400).json({ error });

  const record = { action, ...data, received_at: new Date().toISOString(), source: "ilsa-agent" };

  await Promise.allSettled([
    post(NOTIFY_URL, slackText(action, data)),
    post(SHEET_URL, record),
  ]);

  // The string returned here is what the agent hears back. Keep it short and usable in speech.
  const reply = {
    capture_lead: "Captured. Tell the visitor the team will be in touch.",
    request_demo: "Demo request logged. Tell the visitor the team will confirm a time.",
    log_unanswered: "Logged.",
  }[action];

  return res.status(200).json({ result: reply });
}
