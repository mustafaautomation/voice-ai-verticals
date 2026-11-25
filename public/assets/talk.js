const button = document.getElementById("talk");
const consoleEl = document.getElementById("console");
const statusEl = document.getElementById("status");
const transcriptEl = document.getElementById("transcript");
const toolsEl = document.getElementById("tools");
const muteBtn = document.getElementById("mute");
if (!button || !consoleEl || !statusEl || !transcriptEl) {
  throw new Error("Talk widget markup is missing");
}
const label = button.querySelector(".label");
const tokenUrl = button.dataset.tokenUrl || "/v/hvac/api/call-token";
const boardUrl = button.dataset.boardUrl || "/v/hvac/board";
const roleName = consoleEl.dataset.role || "Dispatch";
const liveRegion = document.getElementById("call-live");

let vapi = null;
let VapiClass = null;
let live = false;
let partial = null;
let stick = true;
let muted = false;

const LIVE_STATES = new Set(["live", "listening", "speaking", "thinking"]);

function labelFor(state) {
  const idle = button.dataset.idleLabel || "Talk to dispatch";
  if (state === "connecting") return "Connecting…";
  if (state === "speaking") return `${roleName} is speaking…`;
  if (state === "thinking") return "Thinking…";
  if (state === "listening" || state === "live") return "End call";
  return idle;
}

function setState(state, text) {
  consoleEl.dataset.state = state;
  if (text) statusEl.textContent = text;
  live = LIVE_STATES.has(state);
  const next = labelFor(state);
  if (label) label.textContent = next;
  button.setAttribute("aria-label", next);
  button.disabled = state === "connecting";
  if (muteBtn) muteBtn.hidden = !live;
  if (liveRegion && text) liveRegion.textContent = text;
}

function setLevel(level) {
  const value = Math.max(0, Math.min(1, Number(level) || 0));
  consoleEl.dataset.level = String(value);
  const meter = document.getElementById("level");
  if (meter) meter.style.width = `${Math.round(value * 100)}%`;
}

function addLine(role, text, final = true) {
  if (partial && partial.dataset.role === role) {
    partial.querySelector("span").textContent = text;
    partial.dataset.final = final ? "true" : "false";
    if (final) partial = null;
    scrollTranscript();
    return;
  }
  const li = document.createElement("li");
  li.dataset.role = role;
  li.dataset.final = final ? "true" : "false";
  const who = document.createElement("b");
  who.textContent = role === "assistant" ? roleName : "You";
  const span = document.createElement("span");
  span.textContent = text;
  li.append(who, span);
  transcriptEl.append(li);
  partial = final ? null : li;
  scrollTranscript();
}

function scrollTranscript() {
  if (!stick) return;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

transcriptEl.addEventListener("scroll", () => {
  const gap = transcriptEl.scrollHeight - transcriptEl.scrollTop - transcriptEl.clientHeight;
  stick = gap < 32;
});

function addTool(name) {
  if (!toolsEl) return;
  const li = document.createElement("li");
  li.dataset.status = "pending";
  li.dataset.tool = name;
  const title = document.createElement("span");
  title.className = "name";
  title.textContent = name;
  const state = document.createElement("span");
  state.className = "state";
  state.textContent = "pending";
  li.append(title, state);
  toolsEl.append(li);
}

function settleTools(status) {
  if (!toolsEl) return;
  for (const item of toolsEl.querySelectorAll("li[data-status='pending']")) {
    item.dataset.status = status;
    const state = item.querySelector(".state");
    if (state) state.textContent = status === "ok" ? "ok" : "error";
  }
}

class LimitError extends Error {}

function describeError(error) {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  const nested = error.error && typeof error.error === "object" ? error.error : null;
  const candidates = [
    nested?.error?.message,
    nested?.message,
    nested?.errorMsg,
    error.message,
    error.errorMsg,
    error.reason,
    error.type,
    typeof error.error === "string" ? error.error : null,
  ];
  for (const item of candidates) {
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  try {
    const raw = JSON.stringify(error);
    if (raw && raw !== "{}") return raw.slice(0, 180);
  } catch {
    // ignore circular structure
  }
  return String(error);
}

function formatCallFailure(phase, error) {
  const detail = describeError(error);
  const raw = `${detail} ${error?.name ?? ""} ${error?.type ?? ""}`;
  if (/credit|balance|wallet|payment/i.test(raw)) {
    return "The demo is out of free voice credits. The board still works.";
  }
  if (/NotAllowedError|PermissionDenied|permission denied|not allowed/i.test(raw)) {
    return "Microphone permission was denied. Allow microphone access in your browser and try again.";
  }
  if (/NotFoundError|DevicesNotFound|device not found|no microphone/i.test(raw)) {
    return "No microphone was found on this device. Connect a microphone and try again.";
  }
  if (/Content Security Policy|CSP|esm\.sh|Failed to fetch dynamically imported module/i.test(raw)) {
    return `Could not load the voice SDK (${detail}).`;
  }
  const prefix = phase === "start" ? "The call could not start" : "The call could not connect";
  return `${prefix}: ${detail}`;
}

async function requestToken() {
  const response = await fetch(tokenUrl, { method: "POST", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new LimitError(body.message || "The demo cannot start a call right now.");
  return body;
}

async function load(token) {
  if (!VapiClass) {
    const mod = await import("https://esm.sh/@vapi-ai/web@3.1.1");
    VapiClass = mod.default?.default ?? mod.default;
  }
  const client = new VapiClass(token, undefined, { avoidEval: true });
  client.on("call-start", () => setState("listening", "Connected. Speak into your microphone."));
  client.on("call-end", () => {
    settleTools("ok");
    setState("idle", `Call ended. Activity is on ${boardUrl}.`);
    setLevel(0);
    muted = false;
    if (muteBtn) muteBtn.textContent = "Mute";
  });
  client.on("speech-start", () => {
    if (!live) return;
    setState("speaking", `${roleName} is speaking…`);
  });
  client.on("speech-end", () => {
    if (!live) return;
    setState("listening", "Listening…");
  });
  client.on("volume-level", (level) => setLevel(level));
  client.on("message", (message) => {
    if (message.type === "transcript" && message.transcript) {
      addLine(message.role === "assistant" ? "assistant" : "user", message.transcript, message.transcriptType === "final");
      if (message.role === "user" && message.transcriptType !== "final" && live) setState("thinking", "Thinking…");
    } else if (message.type === "tool-calls" && Array.isArray(message.toolCallList)) {
      for (const call of message.toolCallList) addTool(call.function?.name ?? "tool");
    } else if (message.type === "tool-call-result" || message.type === "function-call-result") {
      settleTools(message.error ? "error" : "ok");
    }
  });
  client.on("error", (error) => {
    console.error("[voice-call]", error);
    settleTools("error");
    setState("error", formatCallFailure("connect", error));
  });
  return client;
}

new MutationObserver(() => {
  const next = labelFor(consoleEl.dataset.state || "idle");
  if (label) label.textContent = next;
  button.setAttribute("aria-label", next);
}).observe(consoleEl, { attributes: true, attributeFilter: ["data-state"] });

if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    if (!vapi || typeof vapi.setMuted !== "function") return;
    muted = !muted;
    vapi.setMuted(muted);
    muteBtn.textContent = muted ? "Unmute" : "Mute";
  });
}

button.addEventListener("click", async () => {
  if (live) {
    vapi?.stop();
    return;
  }
  setState("connecting", "Connecting… allow microphone access if asked.");
  try {
    const grant = await requestToken();
    vapi = await load(grant.token);
    transcriptEl.replaceChildren();
    toolsEl?.replaceChildren();
    partial = null;
    stick = true;
    await vapi.start(grant.assistantId);
  } catch (error) {
    if (error instanceof LimitError) {
      setState("limited", error.message);
      return;
    }
    console.error("[voice-call]", error);
    setState("error", formatCallFailure("start", error));
  }
});
