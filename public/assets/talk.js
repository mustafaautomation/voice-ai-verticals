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
  const client = new VapiClass(token);
  client.on("call-start", () => setState("live", "Connected. Tell dispatch what is going on."));
  client.on("call-end", () => {
    setState("idle", `Call ended. Jobs and texts are on ${boardUrl}.`);
    levelEl.style.width = "0";
  });
  client.on("speech-start", () => { if (live) statusEl.textContent = "Dispatch is speaking…"; });
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
    const text = JSON.stringify(error?.error ?? error ?? "");
    const credits = /credit|balance|wallet|payment/i.test(text);
    setState("idle", credits
      ? "The demo is out of free voice credits. The dispatch board still works."
      : "The call could not connect. Check microphone permission and try again.");
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
    setState("idle", "The call could not start. Check microphone permission and try again.");
  }
});
