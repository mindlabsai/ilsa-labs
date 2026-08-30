import {
  createSpokenIntro,
  isOtonomyHandoff,
  SESSION_ILSA,
  sessionFlag,
} from "/site/spoken-intro.js";

const PENDING = "ilsa_otonomy_handoff_pending";
const FALLBACK = "O\\TON sent you, didn’t he? He talks too much. I’m ILSA. Since you’re here, I can show you what we’re building.";

export function captureOtonomyHandoff(locationLike = location, storage) {
  const store = storage || sessionStorage;
  const fromQuery = isOtonomyHandoff(locationLike.search || "");
  let pending = false;
  try { pending = store.getItem(PENDING) === "true"; } catch { pending = false; }
  if (fromQuery) {
    try { store.setItem(PENDING, "true"); } catch { /* private mode */ }
    try {
      const url = new URL(locationLike.href);
      url.searchParams.delete("from");
      url.searchParams.delete("handoff");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch { /* ignore */ }
  }
  if ((fromQuery || pending) === false) return false;
  return sessionFlag(store, SESSION_ILSA) === false;
}

export async function bootOtonomyHandoff() {
  if (captureOtonomyHandoff() === false) return null;
  const line = document.getElementById("handoff-line");
  const meet = document.getElementById("meet-ilsa");
  const transcript = document.getElementById("handoff-transcript");
  let manifest = null;
  try {
    const res = await fetch("/audio/ilsa-handoff.json");
    if (res.ok === false) throw new Error("handoff manifest missing");
    manifest = await res.json();
  } catch (error) {
    console.error(error);
    if (transcript) transcript.textContent = FALLBACK;
    if (line) {
      line.hidden = false;
      line.textContent = FALLBACK;
    }
    return null;
  }

  if (transcript) transcript.textContent = manifest.transcript.replace(/\n+/g, " ");

  const intro = createSpokenIntro({
    sessionKey: SESSION_ILSA,
    lockKey: "ilsa-otonomy-handoff",
    manifest,
    baseUrl: "/audio/",
  });

  function showLine(text) {
    if (!line) return;
    line.hidden = false;
    line.removeAttribute("aria-hidden");
    line.textContent = text || "";
  }

  const opening = manifest.clips?.[0]?.cues?.[0]?.text || FALLBACK.split("\n\n")[0];
  showLine(opening);

  intro.subscribe((message) => {
    if (message.type === "cue") showLine(message.text);
    if (message.type === "started") {
      try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ }
      if (meet) {
        meet.hidden = true;
        meet.disabled = true;
      }
    }
    if (message.type === "autoplay_blocked") {
      showLine(opening);
      if (meet) {
        meet.hidden = false;
        meet.disabled = false;
      }
      const resume = () => intro.startFromGesture();
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
    }
    if (message.type === "completed") showLine(message.text);
    if (message.type === "failed") showLine(manifest.transcript.replace(/\n+/g, " "));
  });

  meet?.addEventListener("click", () => {
    meet.hidden = true;
    meet.disabled = true;
    intro.startFromGesture();
  });

  window.__otonHandoffCancel = () => intro.cancel();
  window.addEventListener("beforeunload", () => intro.cancel());
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) intro.cancel();
  });

  await intro.attemptAutoplay();
  return intro;
}
