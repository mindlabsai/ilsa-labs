// ILSA — site integration for the ILSA Labs glass lab.
// Computes session context, builds the opening line, registers client tools,
// and starts the ElevenLabs conversation. Vanilla JS, no build step.
//
// Requires the ElevenLabs client SDK loaded on the page:
//   <script type="module"> import { Conversation } from "https://esm.sh/@elevenlabs/client"; ... </script>
// Verify the import path and startSession options against current ElevenLabs docs.

const ILSA_AGENT_ID = "agent_6901m0fbpj0kfjssaw9qwz3mshva";

const LABS = {
  aston:      { name: "ASTON",      tagline: "Neurodevelopmental screening for clinicians and schools", url: "https://astonax.com" },
  "37t":      { name: "37T",        tagline: "Permission infrastructure for identity and creative work in the AI economy", url: "https://37t.io" },
  teo:        { name: "teo",        tagline: "An AI facilitator for conversations between two people", url: "https://helloteo.com.au" },
  innerlayer: { name: "InnerLayer", tagline: "Conversation intelligence that reads what's happening underneath the words, not yet released", url: null },
  texlex:     { name: "Texlex",     tagline: "The report engine for neurodevelopmental assessment, in beta", url: null },
  otonomy:    { name: "oton/omy",   tagline: "Our personal intelligence lab, research stage", url: null },
  anima:      { name: "Anima Lab",  tagline: "Plant-derived therapeutics for the animals we live with, in development", url: null },
  humantech:  { name: "Humantech",  tagline: "Human performance, measured and improved, research stage", url: null },
};

const ALLOWED_LINKS = new Set(Object.values(LABS).map(l => l.url).filter(Boolean));

// ---------- Session state the site already has ----------

const state = {
  focusLab: null,                 // set by the prism UI: "aston" | "37t" | ...
  visited: new Set(JSON.parse(sessionStorage.getItem("ilsa.visited") || "[]")),
  returning: localStorage.getItem("ilsa.seen") === "1",
};

export function setFocusLab(key) {
  state.focusLab = key in LABS ? key : null;
  if (state.focusLab) {
    state.visited.add(state.focusLab);
    sessionStorage.setItem("ilsa.visited", JSON.stringify([...state.visited]));
  }
}

function entryPath() {
  const ref = document.referrer || "";
  if (/linkedin\./i.test(ref)) return "linkedin";
  if (/google\./i.test(ref)) return "search";
  if (ref && !ref.includes(location.hostname)) {
    try { return new URL(ref).hostname; } catch { return "direct"; }
  }
  return location.pathname === "/" ? "direct" : location.pathname;
}

function perthTimeOfDay() {
  const h = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Perth" }).format(new Date()));
  return h < 5 ? "late night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
}

function inferSegment() {
  const p = new URLSearchParams(location.search);
  if (p.get("seg")) return p.get("seg");                 // campaign links can set ?seg=clinician
  if (location.pathname.startsWith("/clinicians")) return "clinician";
  if (location.pathname.startsWith("/developers")) return "developer";
  return "unknown";
}

// ---------- Opening line: routing logic lives here, not in the prompt ----------

export function buildOpeningLine() {
  const lab = state.focusLab ? LABS[state.focusLab] : null;
  if (!lab) return "Hello, I'm ILSA, your guide through our labs. Is there something I can help you with?";
  if (state.returning) return `Hello again, it's ILSA. You're back on ${lab.name}. What can I help with?`;
  return `Hello, I'm ILSA, your guide through our labs. You're on ${lab.name}. Is there something I can help you with?`;
}

export function buildDynamicVariables() {
  const lab = state.focusLab ? LABS[state.focusLab] : null;
  return {
    opening_line: buildOpeningLine(),
    focus_lab: lab ? lab.name : "none",
    focus_lab_tagline: lab ? lab.tagline : "",
    labs_visited: [...state.visited].map(k => LABS[k].name).join(", ") || "none",
    entry_path: entryPath(),
    visitor_segment: inferSegment(),
    returning: String(state.returning),
    time_of_day_perth: perthTimeOfDay(),
  };
}

// ---------- Client tools: ILSA can drive the site ----------

const clientTools = {
  highlight_lab: async ({ lab }) => {
    const key = String(lab || "").toLowerCase().replace(/\s/g, "");
    if (!(key in LABS)) return "unknown lab";
    setFocusLab(key);
    window.dispatchEvent(new CustomEvent("ilsa:highlight", { detail: { lab: key } })); // prism UI listens for this
    return `highlighted ${LABS[key].name}`;
  },

  show_card: async ({ type, payload }) => {
    if (!["contact", "demo", "confirmation"].includes(type)) return "unknown card";
    window.dispatchEvent(new CustomEvent("ilsa:card", { detail: { type, payload: payload || {} } }));
    return `showing ${type}`;
  },

  open_link: async ({ url }) => {
    if (!ALLOWED_LINKS.has(url)) return "link not permitted";
    window.open(url, "_blank", "noopener");
    return "opened";
  },
};

// ---------- Start ----------

export async function startILSA(Conversation, extra = {}) {
  const textOnly = extra.textOnly === true;
  const conversation = await Conversation.startSession({
    agentId: ILSA_AGENT_ID,
    dynamicVariables: buildDynamicVariables(),
    clientTools,
    textOnly,
    connectionType: textOnly ? "websocket" : undefined,
    overrides: textOnly ? { conversation: { textOnly: true } } : undefined,
    onConnect: (info) => {
      localStorage.setItem("ilsa.seen", "1");
      console.log("ILSA connect", info);
      extra.onConnect?.(info);
    },
    onDisconnect: (info) => {
      console.log("ILSA disconnect", info);
      extra.onDisconnect?.(info);
    },
    onError: (e) => {
      console.error("ILSA error", e);
      extra.onError?.(e);
    },
    onModeChange: extra.onModeChange,
    onMessage: extra.onMessage,
    onStatusChange: (status) => console.log("ILSA status", status),
  });
  return conversation;
}

// Usage in the page:
//   import { Conversation } from "https://esm.sh/@elevenlabs/client";
//   import { startILSA, setFocusLab } from "/site/ilsa.js";
//   prism.addEventListener("click", e => setFocusLab(e.currentTarget.dataset.lab));
//   talkButton.addEventListener("click", () => startILSA(Conversation));
