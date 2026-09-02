// ILSA — site integration for the ILSA Labs glass lab.
// Computes session context, builds the opening line, registers client tools,
// and starts the ElevenLabs conversation. Vanilla JS, no build step.
//
// Client pin lives in site/elevenlabs.js. Always pass ILSA_CONNECTION_TYPE —
// omitting it lets newer SDKs default voice to WebRTC, which fails on this site.

import { ILSA_CONNECTION_TYPE, ILSA_CONNECTION_DELAY } from "./elevenlabs.js";

const ILSA_AGENT_ID = "agent_6901m0fbpj0kfjssaw9qwz3mshva";

const LABS = {
  aston:      { name: "Aston",      tagline: "Neurodevelopmental screening for clinicians and schools", url: "https://astonax.com" },
  "37t":      { name: "37T",        tagline: "Permission infrastructure for identity and creative work in the AI economy", url: "https://37t.io" },
  teo:        { name: "teo",        tagline: "An AI facilitator for conversations between two people", url: "https://helloteo.com.au" },
  innerlayer: { name: "InnerLayer", tagline: "Conversation intelligence that reads what's happening underneath the words, not yet released", url: null },
  texlex:     { name: "Texlex",     tagline: "The report engine for neurodevelopmental assessment, in beta", url: null },
  otonomy:    { name: "oton/omy",   tagline: "Your body, mind and technology in one continuous conversation, beta testing", url: "https://www.otonomy.com.au" },
  anima:      { name: "Anima Lab",  tagline: "Plant-derived therapeutics for the animals we live with, in development", url: null },
  humantech:  { name: "Humantech",  tagline: "Human performance, measured and improved, research stage", url: null },
};

const ALLOWED_LINKS = new Set(Object.values(LABS).map(l => l.url).filter(Boolean));

// ---------- Session state the site already has ----------

const state = {
  focusLab: null,                 // set by the prism UI: "aston" | "37t" | ...
  visited: new Set(JSON.parse(sessionStorage.getItem("ilsa.visited") || "[]")),
  returning: localStorage.getItem("ilsa.seen") === "1",
  otonomyContinue: false,
  engineerBrief: false,
};

export function setOtonomyContinue(value) {
  state.otonomyContinue = value === true;
}

export function setEngineerBrief(on) {
  state.engineerBrief = on === true;
  if (state.engineerBrief) state.focusLab = null;
}

export function setFocusLab(key) {
  state.focusLab = key in LABS ? key : null;
  if (state.focusLab) {
    state.engineerBrief = false;
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

function timeOfDay() {
  const h = new Date().getHours(); // visitor's local clock
  return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
}

function salutation() {
  const t = timeOfDay();
  return t === "morning" ? "Good morning" : t === "afternoon" ? "Good afternoon" : t === "evening" ? "Good evening" : "Hello";
}

function inferSegment() {
  const p = new URLSearchParams(location.search);
  if (p.get("seg")) return p.get("seg");                 // campaign links can set ?seg=clinician
  if (location.pathname.startsWith("/clinicians")) return "clinician";
  if (location.pathname.startsWith("/developers")) return "developer";
  return "unknown";
}

// ---------- Opening line: routing logic lives here, not in the prompt ----------
// Same welcome shape, slightly different last clause so labs do not sound identical.

const OPENING = {
  aston:      "Hello, welcome to Aston. What can I tell you?",
  "37t":      "Hello, welcome to 37T. Where shall we start?",
  teo:        "Hello, welcome to teo. What would you like to know?",
  innerlayer: "Hello, welcome to InnerLayer. What are you curious about?",
  texlex:     "Hello, welcome to Texlex. How can I help?",
  otonomy:    "Hello, welcome to oton/omy. Where would you like to begin?",
  anima:      "Hello, welcome to Anima Lab. What would you like to ask?",
  humantech:  "Hello, welcome to Humantech. What can I help with?",
};

export function buildOpeningLine() {
  if (state.engineerBrief) return "What are you wanting to build?";
  if (state.focusLab && OPENING[state.focusLab]) return OPENING[state.focusLab];
  if (state.otonomyContinue) return "I can show you around. What are you curious about?";
  if (state.returning) return "Welcome back. What would you like to know?";
  return "Hello, welcome to ILSA Labs. What would you like to know?";
}

export function buildDynamicVariables() {
  const lab = state.focusLab ? LABS[state.focusLab] : null;
  return {
    opening_line: buildOpeningLine(),
    engineer_brief: state.engineerBrief ? "true" : "false",
    focus_lab: lab ? lab.name : "none",
    focus_lab_tagline: lab ? lab.tagline : "",
    labs_visited: [...state.visited].map(k => LABS[k].name).join(", ") || "none",
    entry_path: entryPath(),
    visitor_segment: inferSegment(),
    returning: String(state.returning),
    time_of_day: timeOfDay(),
    time_of_day_perth: timeOfDay(),
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

// ---------- Start (one session at a time) ----------

let activeConversation = null;
let startedWith = null;
let ending = false;
let farewellPending = false;
let lastMode = null;

function messageText(msg) {
  if (typeof msg === "string") return msg;
  return String(msg?.message || msg?.text || msg?.content || "");
}

function messageRole(msg) {
  const s = String(msg?.source || msg?.role || "").toLowerCase();
  if (s === "ai" || s === "agent" || s === "assistant") return "agent";
  if (s === "user" || s === "human") return "user";
  return "";
}

function isGoodbye(text) {
  return /\b(good\s*bye|goodbye|bye-?bye|see you|that(?:'s| is) all)\b/i.test(text);
}

function isPartial(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (msg.is_final === false || msg.isFinal === false) return true;
  return /tentative|partial|interim/i.test(String(msg.type || msg.event || ""));
}

export function noteUserUtterance(text) {
  if (!ending && isGoodbye(text)) farewellPending = true;
}

export async function endILSA() {
  if (ending && !activeConversation) return;
  ending = true;
  farewellPending = false;
  startedWith = null;
  const conv = activeConversation;
  activeConversation = null;
  const resolved = conv && typeof conv.then === "function"
    ? await conv.catch(() => null)
    : conv;
  if (resolved && typeof resolved.endSession === "function") {
    try { await resolved.endSession(); } catch (e) { console.error("ILSA error", e); }
  }
}

export async function startILSA(Conversation, extra = {}) {
  const textOnly = extra.textOnly === true;
  const vars = buildDynamicVariables();
  const sig = vars.opening_line + "|" + vars.engineer_brief;

  if (activeConversation) {
    if (startedWith === sig) {
      console.log("ILSA startSession reused", new Date().toISOString());
      return activeConversation;
    }
    console.log("ILSA startSession replacing", startedWith, "→", sig);
    await endILSA();
  }

  ending = false;
  farewellPending = false;
  lastMode = null;
  startedWith = sig;
  console.log("ILSA startSession", new Date().toISOString(), vars);

  const pending = Conversation.startSession({
    agentId: ILSA_AGENT_ID,
    dynamicVariables: vars,
    clientTools,
    textOnly,
    connectionType: ILSA_CONNECTION_TYPE,
    connectionDelay: ILSA_CONNECTION_DELAY,
    // Do not send overrides.agent.firstMessage. That field is off on the
    // agent, so a lab Ask was connecting with no spoken line.
    overrides: textOnly ? { conversation: { textOnly: true } } : undefined,
    onConnect: (info) => {
      localStorage.setItem("ilsa.seen", "1");
      console.log("ILSA connect", info);
      extra.onConnect?.(info);
    },
    onDisconnect: (info) => {
      console.log("ILSA disconnect", info);
      activeConversation = null;
      startedWith = null;
      extra.onDisconnect?.(info);
    },
    onError: (e) => {
      console.error("ILSA error", e);
      extra.onError?.(e);
    },
    onModeChange: (m) => {
      extra.onModeChange?.(m);
      const mode = m?.mode;
      if (farewellPending && lastMode === "speaking" && mode && mode !== "speaking") {
        farewellPending = false;
        endILSA();
      }
      lastMode = mode;
    },
    onMessage: (msg) => {
      if (ending) return;
      extra.onMessage?.(msg);
      if (isPartial(msg)) return;
      const role = messageRole(msg);
      const text = messageText(msg);
      if (role === "user" && isGoodbye(text)) farewellPending = true;
      if (role === "agent" && farewellPending && textOnly) {
        farewellPending = false;
        queueMicrotask(() => endILSA());
      }
    },
    onStatusChange: (status) => console.log("ILSA status", status),
  }).then((conversation) => {
    activeConversation = conversation;
    return conversation;
  }).catch((err) => {
    activeConversation = null;
    throw err;
  });

  activeConversation = pending;
  return pending;
}

// Usage in the page:
//   import { Conversation } from "https://esm.sh/@elevenlabs/client";
//   import { startILSA, setFocusLab } from "/site/ilsa.js";
//   prism.addEventListener("click", e => setFocusLab(e.currentTarget.dataset.lab));
//   talkButton.addEventListener("click", () => startILSA(Conversation));
