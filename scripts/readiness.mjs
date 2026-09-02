// Static production-readiness checks. No secrets, no network writes.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (err) {
    checks.push({ name, ok: false, error: err.message });
  }
}

check("core files exist", () => {
  for (const p of [
    "index.html", "api/contact.js", "api/ilsa/[action].js", "site/ilsa.js", "site/elevenlabs.js", "vercel.json",
    "sitemap.xml", "robots.txt", "llms.txt", "site/identity.json",
    "teo/index.html", "otonomy/index.html", "37t/index.html", "aston/index.html",
    "texlex/index.html", "innerlayer/index.html", "reeboot/index.html", "leeve/index.html",
    "anima/index.html", "humantech/index.html",
    "favicon.svg", "favicon.ico", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
    "ilsa-og-card.png", "site.webmanifest",
    "site/spoken-intro.js", "site/otonomy-handoff.js",
    "audio/ilsa-handoff.json", "audio/ilsa-handoff-01.mp3", "audio/ilsa-handoff-02.mp3", "audio/ilsa-handoff-03.mp3", "audio/ilsa-handoff-04.mp3",
  ]) {
    assert.equal(existsSync(resolve(root, p)), true, `missing ${p}`);
  }
});

check("browser icons use the ILSA blue dot", () => {
  const html = read("index.html");
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /https:\/\/www\.ilsalabs\.com\/ilsa-og-card\.png/);
  assert.match(read("favicon.svg"), /#3E8CFF/);
  assert.match(read("site.webmanifest"), /"short_name": "ILSA"/);
});

check("voice client is pinned and websocket-forced", () => {
  const el = read("site/elevenlabs.js");
  assert.match(el, /ILSA_CLIENT_VERSION = "1\.21\.0"/);
  assert.match(el, /ILSA_CONNECTION_TYPE = "websocket"/);
  assert.match(el, /esm\.sh\/@elevenlabs\/client@1\.21\.0/);
  assert.doesNotMatch(el, /esm\.sh\/@elevenlabs\/client(?!@)/);
});

check("ILSA webhook fails closed without secret", () => {
  const src = read("api/ilsa/[action].js");
  assert.match(src, /if \(!SECRET\) return false/);
  assert.match(src, /503.*not configured/);
  assert.doesNotMatch(src, /if \(!SECRET\) return true/);
});

check("ILSA notify has a timeout", () => {
  assert.match(read("api/ilsa/[action].js"), /setTimeout\(\(\) => ctrl\.abort\(\), 4000\)/);
});

check("contact send has a timeout and safe parse", () => {
  const src = read("api/contact.js");
  assert.match(src, /setTimeout\(\(\) => ctrl\.abort\(\), 8000\)/);
  assert.match(src, /JSON\.parse/);
  assert.match(src, /429/);
  assert.match(src, /process\.env\.RESEND_API_KEY/);
});

check("writer falls back to mailto on API failure", () => {
  assert.match(read("index.html"), /mailto:human@ilsalabs\.com/);
});

check("engineer for you is a quiet door to the lab", () => {
  const html = read("index.html");
  assert.match(html, /id="header-engineer"/);
  assert.match(html, /id="open-writer"/);
  assert.match(html, /class="writeplain"/);
  assert.match(html, /data-engineer/);
  assert.match(html, /Engineer for you/);
  assert.match(html, /data-subject="Engineer enquiry"/);
  assert.match(html, /The lab treats this as confidential/);
  assert.match(html, /boot==='engineer'/);
  assert.match(read("prompt/system.md"), /interest "engineering"/);
  assert.match(read("site/ilsa.js"), /setEngineerBrief/);
  assert.match(read("api/contact.js"), /Engineer for you · confidential brief/);
});

check("security headers are declared", () => {
  const v = read("vercel.json");
  for (const h of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) {
    assert.match(v, new RegExp(h));
  }
});

check("machine-readable identity is on the homepage", () => {
  const html = read("index.html");
  assert.match(html, /ILSA Labs \| Gen 2 Intelligence \+ Living Systems/);
  assert.match(html, /Australian human technology lab building advanced technology/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.ilsalabs\.com\/"/);
  assert.match(html, /"@type": "Organization"/);
  assert.match(html, /"@type": "WebSite"/);
  assert.match(html, /"legalName": "ILSA Labs Pty Ltd"/);
  assert.match(html, /"addressLocality": "Perth"/);
  assert.match(html, /Vishal Maharaj/);
  assert.match(read("sitemap.xml"), /https:\/\/www\.ilsalabs\.com\/otonomy\//);
  assert.match(read("robots.txt"), /Sitemap: https:\/\/www\.ilsalabs\.com\/sitemap\.xml/);
  assert.match(read("robots.txt"), /User-agent: Bingbot/);
  assert.match(read("robots.txt"), /User-agent: Googlebot/);
  assert.doesNotMatch(read("index.html"), /noindex/i);
  assert.match(read("teo/index.html"), /teo \| Mediated Intelligence \| ILSA Labs/);
  assert.match(read("reeboot/index.html"), /Reeboot AI \| Adaptive Mental Health \| ILSA Labs/);
  assert.match(read("leeve/index.html"), /Leeve AI \| Workforce Health Infrastructure \| ILSA Labs/);
});

check("agent id is set", () => {
  assert.doesNotMatch(read("site/ilsa.js"), /YOUR_AGENT_ID/);
  assert.match(read("site/ilsa.js"), /agent_6901m0fbpj0kfjssaw9qwz3mshva/);
});

check("lab greeting uses welcome line", () => {
  const src = read("site/ilsa.js");
  assert.match(src, /Hello, welcome to ILSA Labs\. What would you like to know\?/);
  assert.match(src, /Hello, welcome to Aston\. What can I tell you\?/);
  assert.match(src, /Hello, welcome to 37T\. Where shall we start\?/);
  assert.match(src, /Hello, welcome to teo\. What would you like to know\?/);
  assert.match(src, /Hello, welcome to InnerLayer\. What are you curious about\?/);
  assert.match(src, /Hello, welcome to Texlex\. How can I help\?/);
  assert.match(src, /Hello, welcome to oton\/omy\. Where would you like to begin\?/);
  assert.match(src, /Hello, welcome to Anima Lab\. What would you like to ask\?/);
  assert.match(src, /Hello, welcome to Humantech\. What can I help with\?/);
  assert.match(src, /I can show you around\. What are you curious about\?/);
  assert.match(src, /Welcome back\. What would you like to know\?/);
  assert.match(src, /What are you wanting to build\?/);
  assert.match(src, /engineer_brief/);
  assert.match(read("prompt/system.md"), /What are you wanting to build, in a few words\?/);
  assert.match(read("index.html"), /remindEngineer/);
  assert.doesNotMatch(src, /I see you are interested/);
  assert.doesNotMatch(src, /firstMessage:\s*vars\.opening_line/);
  const html = read("index.html");
  assert.match(html, /function resolveFocusLab/);
  assert.match(html, /lastOpeningLine !== wanted/);
  assert.match(read("prompt/system.md"), /Opening line: \{\{opening_line\}\}/);
});

check("OTONOMY handoff greeting is deterministic", () => {
  const html = read("index.html");
  const boot = read("site/otonomy-handoff.js");
  const engine = read("site/spoken-intro.js");
  const audio = read("audio/ilsa-handoff.json");
  assert.match(html, /Meet ILSA/);
  assert.match(html, /id="meet-ilsa"/);
  assert.match(html, /id="ilsa-here"/);
  assert.match(html, /oton-handoff-waiting/);
  assert.match(html, /id="handoff-transcript"/);
  assert.doesNotMatch(html, /id="handoff-line"/);
  assert.match(html, /bootOtonomyHandoff/);
  assert.match(html, /__otonHandoffCancel/);
  assert.match(html, /__otonHandoffActive/);
  assert.match(boot, /__otonHandoffActive/);
  assert.match(boot, /stopImmediatePropagation/);
  assert.match(engine, /params\.get\("from"\) === "otonomy"/);
  assert.match(engine, /params\.get\("handoff"\) === "gen2"/);
  assert.match(engine, /ilsa_otonomy_handoff_played/);
  assert.match(boot, /ilsa_otonomy_handoff_pending/);
  assert.match(boot, /ilsa_otonomy_handoff_heard/);
  assert.match(boot, /SETTLE_MS = 2000/);
  assert.match(boot, /setOtonomyContinue/);
  assert.doesNotMatch(boot, /meet\.hidden = false/);
  assert.match(boot, /oton-handoff-waiting/);
  assert.match(boot, /tap to hear/);
  assert.match(boot, /press to hear/);
  assert.match(html, /ilsa-here-cue/);
  assert.match(boot, /armed/);
  assert.match(engine, /starting/);
  assert.match(engine, /elementAudio/);
  assert.doesNotMatch(boot, /handoff-line/);
  assert.match(audio, /O\\\\TON sent you, didn’t he\?/);
  assert.match(audio, /He talks too much\./);
  assert.match(audio, /I’m ILSA\. Since you’re here, I can show you around the labs\./);
  assert.match(audio, /You just need to press Talk to ILSA, and we can continue\./);
  assert.doesNotMatch(audio, /what we’re building/);
  assert.doesNotMatch(boot, /\/v1\/oton\/speak/);
});

const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.error ? ` — ${c.error}` : ""}`);
}
if (failed.length) {
  process.exitCode = 1;
  console.error(`\n${failed.length} readiness check(s) failed`);
} else {
  console.log(`\n${checks.length} readiness check(s) passed`);
}
