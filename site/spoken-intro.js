export const OtonIntroState = Object.freeze({
  idle: "idle",
  preparing: "preparing",
  autoplayBlocked: "autoplayBlocked",
  speaking: "speaking",
  complete: "complete",
  failed: "failed",
});

const PLAYED = "true";

export function reduceIntroState(state, event) {
  switch (event) {
    case "already_played":
      return OtonIntroState.complete;
    case "prepare":
      return state === OtonIntroState.idle ? OtonIntroState.preparing : state;
    case "autoplay_blocked":
      return state === OtonIntroState.preparing ? OtonIntroState.autoplayBlocked : state;
    case "playback_started":
      return state === OtonIntroState.preparing || state === OtonIntroState.autoplayBlocked
        ? OtonIntroState.speaking
        : state;
    case "playback_ended":
      return state === OtonIntroState.speaking ? OtonIntroState.complete : state;
    case "failed":
      return state === OtonIntroState.complete ? state : OtonIntroState.failed;
    default:
      return state;
  }
}

export function isOtonomyHandoff(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  return params.get("from") === "otonomy" && params.get("handoff") === "gen2";
}

export function ilsaHandoffUrl(base) {
  const url = new URL(base, "https://www.ilsalabs.com/");
  url.searchParams.set("from", "otonomy");
  url.searchParams.set("handoff", "gen2");
  return url.pathname + url.search + url.hash;
}

export function cueAt(cues, elapsedMs) {
  let text = "";
  for (const cue of cues || []) {
    if (elapsedMs >= cue.startMs) text = cue.text;
  }
  return text;
}

export function sessionFlag(storage, key) {
  try {
    return storage.getItem(key) === PLAYED;
  } catch {
    return false;
  }
}

export function markSessionFlag(storage, key) {
  try {
    storage.setItem(key, PLAYED);
  } catch {
    /* private mode */
  }
}

export function flattenCues(clips) {
  const cues = [];
  let offset = 0;
  for (const clip of clips || []) {
    for (const cue of clip.cues || []) {
      cues.push({ startMs: offset + cue.startMs, text: cue.text });
    }
    offset += (clip.durationMs || 0) + (clip.pauseAfterMs || 0);
  }
  return cues;
}

const locks = new Map();

function audioCtor() {
  if (typeof Audio === "function") return Audio;
  return null;
}

export function createSpokenIntro(options) {
  const sessionKey = options.sessionKey;
  const storage = options.storage || (typeof sessionStorage === "undefined" ? null : sessionStorage);
  const lockKey = options.lockKey || sessionKey;
  const clips = options.manifest?.clips || [];
  const transcript = options.manifest?.transcript || "";
  const baseUrl = options.baseUrl || "";
  const createAudio = options.createAudio;
  const playbackRate = options.playbackRate || 1;
  let state = OtonIntroState.idle;
  let clipIndex = 0;
  let audio = null;
  let timer = 0;
  let raf = 0;
  let cancelled = false;
  let started = false;
  let starting = false;
  let elementAudio = null;
  const listeners = new Set();

  function emit(message) {
    for (const listener of listeners) listener(message);
  }

  function setState(event) {
    const next = reduceIntroState(state, event);
    if (next === state) return;
    state = next;
    emit({ type: "state", state });
  }

  function sourceFor(clip) {
    if (/^https?:/.test(clip.src) || clip.src.startsWith("/")) return clip.src;
    return `${baseUrl}${clip.src}`;
  }

  function revealForElapsed(elapsedMs, relativeCues) {
    const text = cueAt(relativeCues, elapsedMs);
    if (text) emit({ type: "cue", text });
  }

  function stopTimers() {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function watchClip(clip, element) {
    const tick = () => {
      if (cancelled || !element) return;
      revealForElapsed(element.currentTime * 1000, clip.cues);
      raf = requestAnimationFrame(tick);
    };
    if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
    else revealForElapsed(0, clip.cues);
  }

  function makeAudio(clip) {
    if (createAudio) return createAudio(sourceFor(clip));
    const Ctor = audioCtor();
    if (!Ctor) throw new Error("Audio is not available");
    const element = elementAudio || new Ctor();
    try { element.pause(); } catch { /* ignore */ }
    element.src = sourceFor(clip);
    try { element.load(); } catch { /* ignore */ }
    element.preload = "auto";
    element.playsInline = true;
    try { element.setAttribute("playsinline", ""); } catch { /* ignore */ }
    try { element.setAttribute("webkit-playsinline", ""); } catch { /* ignore */ }
    elementAudio = element;
    return element;
  }

  function waitReady(element) {
    const ready = element.readyState;
    if (typeof ready !== "number") return Promise.resolve();
    if (ready >= 2) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        element.removeEventListener("canplay", done);
        element.removeEventListener("loadeddata", done);
        element.removeEventListener("error", done);
        resolve();
      };
      element.addEventListener("canplay", done);
      element.addEventListener("loadeddata", done);
      element.addEventListener("error", done);
      timer = setTimeout(done, 1000);
    });
  }

  async function playElement(element, volume) {
    await waitReady(element);
    element.volume = volume;
    try { element.currentTime = 0; } catch { /* ignore */ }
    try { element.playbackRate = playbackRate; } catch { /* ignore */ }
    const play = element.play();
    if (!play || typeof play.then !== "function") return Promise.resolve(true);
    return play.then(() => true).catch(() => false);
  }

  function waitEnded(element) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn) => () => {
        if (settled) return;
        settled = true;
        element.removeEventListener("ended", onEnded);
        element.removeEventListener("error", onError);
        fn();
      };
      const onEnded = finish(resolve);
      const onError = finish(() => reject(new Error("audio failed")));
      element.addEventListener("ended", onEnded);
      element.addEventListener("error", onError);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      timer = setTimeout(resolve, ms);
    });
  }

  async function playFrom(index, userGesture) {
    for (let i = index; i < clips.length; i += 1) {
      if (cancelled) return false;
      clipIndex = i;
      const clip = clips[i];
      audio = makeAudio(clip);
      const allowed = await playElement(audio, clip.volume ?? 1);
      if (allowed === false) {
        try { audio.pause(); } catch { /* already stopped */ }
        audio = null;
        return false;
      }
      if (started === false) {
        started = true;
        markSessionFlag(storage, sessionKey);
        setState("playback_started");
        emit({ type: "started" });
      }
      revealForElapsed(0, clip.cues);
      watchClip(clip, audio);
      try {
        await waitEnded(audio);
      } catch (error) {
        stopTimers();
        throw error;
      }
      stopTimers();
      revealForElapsed(Number.MAX_SAFE_INTEGER, clip.cues);
      if (cancelled) return true;
      if (clip.pauseAfterMs) await sleep(clip.pauseAfterMs);
    }
    return true;
  }

  async function finishSuccess() {
    setState("playback_ended");
    emit({ type: "completed", text: lastSentence(transcript) });
  }

  function fail(error) {
    console.error(error);
    setState("failed");
    emit({ type: "failed", text: transcript });
  }

  async function attemptAutoplay() {
    if (locks.get(lockKey)) return state;
    locks.set(lockKey, true);
    if (sessionFlag(storage, sessionKey)) {
      setState("already_played");
      emit({ type: "completed", text: transcript });
      return state;
    }
    setState("prepare");
    try {
      const played = await playFrom(0, false);
      if (cancelled) return state;
      if (played === false) {
        locks.delete(lockKey);
        setState("autoplay_blocked");
        emit({ type: "autoplay_blocked" });
        return state;
      }
      await finishSuccess();
    } catch (error) {
      fail(error);
    }
    return state;
  }

  async function startFromGesture() {
    if (starting || state === OtonIntroState.speaking || state === OtonIntroState.complete) return state;
    if (sessionFlag(storage, sessionKey) && state !== OtonIntroState.autoplayBlocked) {
      setState("already_played");
      emit({ type: "completed", text: transcript });
      return state;
    }
    starting = true;
    locks.set(lockKey, true);
    cancelled = false;
    if (state === OtonIntroState.idle) setState("prepare");
    try {
      const played = await playFrom(clipIndex, true);
      if (cancelled) return state;
      if (played === false) {
        fail(new Error("playback blocked after gesture"));
        return state;
      }
      await finishSuccess();
    } catch (error) {
      fail(error);
    } finally {
      starting = false;
    }
    return state;
  }

  function cancel() {
    cancelled = true;
    stopTimers();
    if (audio) {
      try { audio.pause(); } catch { /* ignore */ }
      try { audio.src = ""; } catch { /* ignore */ }
      audio = null;
    }
    starting = false;
    locks.delete(lockKey);
  }

  return {
    attemptAutoplay,
    startFromGesture,
    cancel,
    getState: () => state,
    transcript,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function lastSentence(transcript) {
  const parts = String(transcript || "").split(/\n+/).map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || transcript;
}

export const SESSION_OTON = "oton_intro_played";
export const SESSION_ILSA = "ilsa_otonomy_handoff_played";
export const STORE_ILSA = "ilsa_otonomy_handoff_heard";
