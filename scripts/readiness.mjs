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
    "favicon.svg", "favicon.ico", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png",
    "ilsa-og-card.png", "site.webmanifest",
  ]) {
    assert.equal(existsSync(resolve(root, p)), true, `missing ${p}`);
  }
});

check("browser icons use the TX mark", () => {
  const html = read("index.html");
  assert.match(html, /rel="icon" href="\/favicon\.svg"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="\/site\.webmanifest"/);
  assert.match(html, /https:\/\/www\.ilsalabs\.com\/ilsa-og-card\.png/);
  assert.match(read("favicon.svg"), /M148 296H468L516 408/);
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

check("security headers are declared", () => {
  const v = read("vercel.json");
  for (const h of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy"]) {
    assert.match(v, new RegExp(h));
  }
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
  assert.doesNotMatch(src, /I see you are interested/);
  assert.match(src, /firstMessage:\s*vars\.opening_line/);
  const html = read("index.html");
  assert.match(html, /function resolveFocusLab/);
  assert.match(html, /lastOpeningLine !== wanted/);
  assert.match(read("prompt/system.md"), /Opening line: \{\{opening_line\}\}/);
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
