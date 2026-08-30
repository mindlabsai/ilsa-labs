// Apply ILSA's configuration to the ElevenLabs agent via API, in small steps.
// Run:  ELEVENLABS_API_KEY=xi-... node apply-config.mjs
// Each step is a separate PATCH so a rejected field is identified by name.
// Reads prompt/system.md from the repo (adjust PROMPT_PATH if the file lives elsewhere).

import { readFileSync } from "node:fs";

const API = "https://api.elevenlabs.io/v1/convai";
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = "agent_6901m0fbpj0kfjssaw9qwz3mshva";
const PROMPT_PATH = process.env.PROMPT_PATH ?? "prompt/system.md";
if (!KEY) { console.error("Set ELEVENLABS_API_KEY"); process.exit(1); }

const H = { "xi-api-key": KEY, "content-type": "application/json" };
const prompt = readFileSync(PROMPT_PATH, "utf8");

async function patch(label, body) {
  const r = await fetch(`${API}/agents/${AGENT_ID}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  const text = await r.text();
  if (r.ok) { console.log(`OK    ${label}`); return true; }
  console.log(`FAIL  ${label}\n      ${r.status} ${text}`);
  return false;
}

const current = await (await fetch(`${API}/agents/${AGENT_ID}`, { headers: H })).json();
const tool_ids = current.conversation_config?.agent?.prompt?.tool_ids ?? [];
console.log(`agent has ${tool_ids.length} tools attached`);

const steps = [
  ["prompt text", { conversation_config: { agent: { prompt: { prompt } } } }],
  ["llm + reasoning", { conversation_config: { agent: { prompt: { llm: "claude-sonnet-5", reasoning_effort: "low", temperature: 0 } } } }],
  ["rag on", { conversation_config: { agent: { prompt: { rag: { enabled: true, max_retrieved_rag_chunks_count: 8 } } } } }],
  ["first message", { conversation_config: { agent: { first_message: "{{opening_line}}" } } }],
  ["dynamic variable defaults", { conversation_config: { agent: { dynamic_variables: { dynamic_variable_placeholders: {
      opening_line: "Hello, welcome to ILSA Labs. What would you like to know?",
      focus_lab: "ILSA Labs", focus_lab_tagline: "Technology for the human layer", labs_visited: "none",
      entry_path: "direct", visitor_segment: "unknown", returning: "false", time_of_day_perth: "day" } } } } }],
  ["max duration message", { conversation_config: { agent: { max_conversation_duration_message: "We've reached the end of this session. Thanks for visiting ILSA Labs." } } }],
  ["voice on (text_only false)", { conversation_config: { conversation: { text_only: false } } }],
  ["source attribution + file input off", { conversation_config: { conversation: { source_attribution: true, file_input: { enabled: false } } } }],
  ["silence timeout 60s", { conversation_config: { turn: { silence_end_call_timeout: 60 } } }],
  ["asr keywords", { conversation_config: { asr: { keywords: ["ILSA", "ASTON", "37T", "teo", "InnerLayer", "Texlex"] } } }],
  ["widget labels", { platform_settings: { widget: { action_text: "Ask ILSA", start_call_text: "Talk to ILSA", show_conversation_id: false,
      dismissible: true, disable_banner: true, show_avatar_when_collapsed: true, conversation_mode_toggle_enabled: true } } }],
  ["widget link hosts", { platform_settings: { widget: { markdown_link_allow_http: false,
      markdown_link_allowed_hosts: [
        { hostname: "astonax.com" },
        { hostname: "37t.io" },
        { hostname: "helloteo.com.au" },
        { hostname: "otonomy.com.au" },
        { hostname: "innerlayer.ai" },
        { hostname: "ilsalabs.com" },
      ] } } }],
  ["privacy retention 90d", { platform_settings: { privacy: { retention_days: 90 } } }],
  ["auth allowlist", { platform_settings: { auth: { enable_auth: false, allowlist: [
      { hostname: "ilsalabs.com" }, { hostname: "www.ilsalabs.com" }, { hostname: "ilsa-labs.vercel.app" } ] } } }],
];

let failures = 0;
for (const [label, body] of steps) if (!(await patch(label, body))) failures++;

console.log(failures ? `\n${failures} step(s) rejected — see FAIL lines above.` : "\nAll steps applied. Open the agent in ElevenLabs, Sync, and confirm it shows as published.");
