import {
  createSpokenIntro,
  isOtonomyHandoff,
  SESSION_ILSA,
  sessionFlag,
  markSessionFlag,
} from "/site/spoken-intro.js";
import { setOtonomyContinue } from "/site/ilsa.js";

const PENDING = "ilsa_otonomy_handoff_pending";
const HEARD = "ilsa_otonomy_handoff_heard";
const SETTLE_MS = 2000;

function lastingStore() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function captureOtonomyHandoff(locationLike = location, storage) {
  const store = storage || sessionStorage;
  const heard = lastingStore();
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
  if (sessionFlag(store, SESSION_ILSA) || sessionFlag(heard, HEARD)) return false;
  return true;
}

function markHeard() {
  markSessionFlag(sessionStorage, SESSION_ILSA);
  markSessionFlag(lastingStore(), HEARD);
}

export async function bootOtonomyHandoff() {
  if (captureOtonomyHandoff() === false) return null;
  const meet = document.getElementById("meet-ilsa");
  const here = document.getElementById("ilsa-here");
  const talk = document.querySelector("button.herotalk[data-talk]");
  const transcript = document.getElementById("handoff-transcript");
  let manifest = null;
  try {
    const res = await fetch("/audio/ilsa-handoff.json");
    if (res.ok === false) throw new Error("handoff manifest missing");
    manifest = await res.json();
  } catch (error) {
    console.error(error);
    return null;
  }

  if (transcript) transcript.textContent = manifest.transcript.replace(/\n+/g, " ");
  if (talk) talk.hidden = true;
  if (here) here.hidden = true;
  if (meet) {
    meet.hidden = true;
    meet.disabled = true;
  }
  document.documentElement.classList.add("oton-handoff");
  window.__otonHandoffActive = true;

  const intro = createSpokenIntro({
    sessionKey: SESSION_ILSA,
    lockKey: "ilsa-otonomy-handoff",
    manifest,
    baseUrl: "/audio/",
  });

  let armed = false;
  const resume = (event) => {
    if (armed) return;
    armed = true;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    intro.startFromGesture();
  };

  function hideHere() {
    document.documentElement.classList.remove("oton-handoff-waiting");
    if (here) here.hidden = true;
  }

  function showTalk() {
    window.__otonHandoffActive = false;
    document.documentElement.classList.remove("oton-handoff", "oton-handoff-waiting");
    hideHere();
    if (talk) talk.hidden = false;
    if (meet) {
      meet.hidden = true;
      meet.disabled = true;
    }
  }

  intro.subscribe((message) => {
    if (message.type === "started") {
      try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ }
      markHeard();
      hideHere();
    }
    if (message.type === "autoplay_blocked") {
      document.documentElement.classList.add("oton-handoff-waiting");
      const tap = window.matchMedia("(hover: none), (pointer: coarse)").matches;
      const cue = tap ? "tap to hear" : "press to hear";
      if (here) {
        const label = document.getElementById("ilsa-here-cue");
        if (label) label.textContent = cue;
        here.hidden = false;
        here.setAttribute("aria-label", cue);
      }
      window.addEventListener("pointerdown", resume, { once: true, capture: true });
      window.addEventListener("keydown", resume, { once: true });
    }
    if (message.type === "completed") {
      setOtonomyContinue(true);
      showTalk();
    }
    if (message.type === "failed") showTalk();
  });

  window.__otonHandoffCancel = () => {
    window.__otonHandoffActive = false;
    intro.cancel();
    showTalk();
  };
  window.addEventListener("beforeunload", () => intro.cancel());
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) intro.cancel();
  });

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  await intro.attemptAutoplay();
  const now = intro.getState();
  if (now === "complete" || now === "failed") showTalk();
  return intro;
}
