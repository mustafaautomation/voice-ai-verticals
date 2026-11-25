const button = document.getElementById("talk");
const consoleEl = document.getElementById("console");
const statusEl = document.getElementById("status");
const levelEl = document.getElementById("level");
const transcriptEl = document.getElementById("transcript");
if (!button || !consoleEl || !statusEl || !levelEl || !transcriptEl) {
  throw new Error("Talk widget markup is missing");
}
const label = button.querySelector(".label");
const tokenUrl = button.dataset.tokenUrl || "/v/hvac/api/call-token";
const boardUrl = button.dataset.boardUrl || "/v/hvac/board";

let vapi = null;
let VapiClass = null;
let live = false;
let partial = null;

function setState(state, text) {
  consoleEl.dataset.state = state;
  if (text) statusEl.textContent = text;
  live = state === "live";
  if (label) label.textContent = live ? "End call" : button.dataset.idleLabel || "Talk to dispatch";
  button.disabled = state === "connecting";
}

function addLine(role, text, final = true) {
  if (partial && partial.dataset.role === role) {
    partial.querySelector("span").textContent = text;
    if (final) partial = null;
    return;
  }
  const li = document.createElement("li");
  li.dataset.role = role;
  const who = document.createElement("b");
  who.textContent = role === "assistant" ? "Dispatch" : role === "user" ? "You" : "Tool";
  const span = document.createElement("span");
  span.textContent = text;
  li.append(who, span);
  transcriptEl.append(li);
  partial = final ? null : li;
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
  client.on("call-start", () => setState("live", "Connected. Speak into your microphone."));
  client.on("call-end", () => {
    setState("idle", `Call ended. Activity is on ${boardUrl}.`);
    levelEl.style.width = "0";
  });
  client.on("speech-start", () => { if (live) statusEl.textContent = "Assistant is speaking…"; });
  client.on("speech-end", () => { if (live) statusEl.textContent = "Listening…"; });
  client.on("volume-level", (level) => { levelEl.style.width = `${Math.min(100, Math.round(level * 100))}%`; });
  client.on("message", (message) => {
    if (message.type === "transcript" && message.transcript) {
      addLine(message.role === "assistant" ? "assistant" : "user", message.transcript, message.transcriptType === "final");
    } else if (message.type === "tool-calls" && Array.isArray(message.toolCallList)) {
      for (const call of message.toolCallList) addLine("tool", `Calling ${call.function?.name ?? "a tool"}…`);
    }
  });
  client.on("error", (error) => {
    console.error("[voice-call]", error);
    setState("idle", formatCallFailure("connect", error));
  });
  return client;
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
    partial = null;
    await vapi.start(grant.assistantId);
  } catch (error) {
    if (error instanceof LimitError) {
      setState("limited", error.message);
      return;
    }
    console.error("[voice-call]", error);
    setState("idle", formatCallFailure("start", error));
  }
});
