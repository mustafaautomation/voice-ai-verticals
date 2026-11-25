import { escapeHtml } from "../platform/html.js";
import { formatStamp } from "../platform/time.js";
import type { CallRecord, ToolCallRecord } from "../store/calls.js";
import type { SmsMessage } from "../store/sms.js";
import { WRENLINE, money } from "../verticals/fintech/brand.js";
import { maskDob, maskLast4, maskPhone, redactSensitive } from "../verticals/fintech/privacy.js";
import type { AccountRecord, AuditRecord, CaseRecord } from "../verticals/fintech/store.js";

const ZONE = WRENLINE.timezone;

function shell(title: string, description: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body data-vertical="fintech" class="theme-fintech">
${body}
</body>
</html>`;
}

function outcome(value: string): string {
  const labels: Record<string, string> = {
    serviced: "Handled",
    refused: "Refused",
    transferred: "Transferred",
    text_back: "Text queued",
    off_topic: "Declined",
    escalated: "Fraud desk",
    no_booking: "No change",
    in_progress: "In progress",
    completed: "Completed",
  };
  return labels[value] ?? value;
}

export function renderFintechHome(base: string): string {
  return shell(
    `${WRENLINE.name} · card support`,
    "Fictional neobank demo. Last four only. No real payments.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}">
        <span class="mark fintech-mark" aria-hidden="true"></span>
        <span><strong>${escapeHtml(WRENLINE.name)}</strong><small>${escapeHtml(WRENLINE.city)} · fictional card</small></span>
      </a>
      <nav>
        <a href="${base}/board">Cases</a>
        <a href="${base}/calls">Calls</a>
        <a href="${base}/messages">Messages</a>
        <a href="${base}/accounts">Accounts</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">${escapeHtml(WRENLINE.disclaimer)}</p>
    <main>
      <section class="hero hvac-hero">
        <div>
          <p class="eyebrow">Support and collections · demo ledger · no real money</p>
          <h1>Last four. Never the whole card.</h1>
          <p class="lede">${escapeHtml(WRENLINE.name)} answers for a made-up Austin card app. It checks name, last four, and date of birth or a demo app code before it reads a balance. Collections calls start with a mini-Miranda, stop on cease-contact, and never threaten. Disputes, freezes, and reissues stay on the demo ledger.</p>
          <ul class="facts">${WRENLINE.hours.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
        <div class="console voice-stage" id="console" data-state="idle" data-role="Wrenline">
          <button id="talk" class="talk orb-button" type="button" data-token-url="${base}/api/call-token" data-board-url="${base}/board" data-idle-label="Talk to Wrenline" aria-label="Talk to Wrenline">
            <span class="orb" id="orb" aria-hidden="true"></span>
            <span class="label">Talk to Wrenline</span>
          </button>
          <p class="status" id="status" role="status" aria-live="polite">Microphone. Use a made-up name. The demo OTP on Maya Chen's app screen is 2468.</p>
          <div class="call-controls" hidden><button type="button" id="mute">Mute</button></div>
          <div class="stage-panels">
            <ol class="transcript" id="transcript" aria-label="Live transcript"></ol>
            <ol class="tools" id="tools" aria-label="Tool calls"></ol>
          </div>
          <p class="sr-only" id="call-live" role="status" aria-live="polite"></p>
        </div>
      </section>
      <section class="danger" role="note">
        <h2>What this agent will not take</h2>
        <p>Full card numbers, CVVs, PINs, and passwords are refused and redacted. A spouse or anyone who is not the cardholder does not get the balance. If someone says stop calling, debt contact stops. Payment links do not charge a card.</p>
      </section>
      <section class="grid3">
        <article>
          <h2>Try saying</h2>
          <ul>
            <li>“Maya Chen, last four 4412, born March 14, 1984. Freeze my card.”</li>
            <li>“I'm his wife. What's the balance?”</li>
            <li>“The card number is 4111 1111 1111 1111.”</li>
            <li>“Dispute the Quill Grocery charge. I didn't make it.”</li>
            <li>“Stop calling me about this.”</li>
          </ul>
        </article>
        <article>
          <h2>The desk</h2>
          <p>${escapeHtml(WRENLINE.address)}. ${escapeHtml(WRENLINE.addressNote)}</p>
          <p>Support ${escapeHtml(WRENLINE.phoneDisplay)} · fraud ${escapeHtml(WRENLINE.fraudDisplay)}</p>
        </article>
        <article>
          <h2>Collections, when it applies</h2>
          <p>The agent says it is an attempt to collect a debt before it states a past-due amount. It can note a hardship or a promise-to-pay. It cannot threaten arrest, garnishment, or a call to an employer.</p>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(WRENLINE.disclaimer)}</p></footer>
    <script type="module" src="/assets/orb.js"></script>
    <script type="module" src="/assets/talk.js"></script>`,
  );
}

export type FintechDesk = {
  accounts: AccountRecord[];
  cases: CaseRecord[];
  calls: CallRecord[];
  messages: SmsMessage[];
  audit: AuditRecord[];
};

export function renderFintechDesk(base: string, tab: "board" | "calls" | "messages" | "accounts" | "audit", data: FintechDesk, query = "", notice = ""): string {
  const tabs = [
    ["board", "Cases"],
    ["calls", "Calls"],
    ["messages", "Messages"],
    ["accounts", "Accounts"],
    ["audit", "Audit"],
  ]
    .map(([id, label]) => `<a href="${base}/${id}" class="${tab === id ? "active" : ""}">${label}</a>`)
    .join("");
  return shell(
    `${tab} · ${WRENLINE.name}`,
    "Fictional card desk. Full card numbers are not stored.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}"><span class="mark fintech-mark" aria-hidden="true"></span><span><strong>${escapeHtml(WRENLINE.name)}</strong><small>Card desk · fictional · no real money</small></span></a>
      <nav><a href="${base || "/"}">Talk</a><a href="/platform">All verticals</a></nav>
    </header>
    <p class="banner">${escapeHtml(WRENLINE.disclaimer)}</p>
    <main class="desk">
      <section class="kpis">
        <article><span>Open cases</span><strong>${data.cases.filter((item) => item.status !== "done").length}</strong></article>
        <article><span>Accounts</span><strong>${data.accounts.length}</strong></article>
        <article><span>Cease-contact</span><strong>${data.accounts.filter((item) => item.ceaseContact).length}</strong></article>
        <article><span>Audit events</span><strong>${data.audit.length}</strong></article>
      </section>
      <nav class="tabs">${tabs}</nav>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      ${tab === "board" ? casesHtml(base, data.cases) : ""}
      ${tab === "calls" ? callsHtml(base, data.calls, query) : ""}
      ${tab === "messages" ? messagesHtml(data.messages) : ""}
      ${tab === "accounts" ? accountsHtml(data.accounts) : ""}
      ${tab === "audit" ? auditHtml(data.audit) : ""}
    </main>`,
  );
}

export function renderFintechCall(base: string, call: CallRecord, tools: ToolCallRecord[]): string {
  const toolRows = tools
    .map((tool) => `<li><code>${escapeHtml(tool.name)}</code><pre>${escapeHtml(redactSensitive(JSON.stringify(tool.result, null, 2)))}</pre></li>`)
    .join("");
  return shell(
    `${call.callerName || "Call"} · ${WRENLINE.name}`,
    "Call detail with card numbers redacted.",
    `<header class="bar"><a class="brand" href="${base}/calls"><span class="mark fintech-mark" aria-hidden="true"></span><span><strong>Back to calls</strong></span></a></header>
    <main class="desk">
      <p class="pill ${escapeHtml(call.outcome)}">${escapeHtml(outcome(call.outcome))}</p>
      <h1>${escapeHtml(call.callerName || "Unknown caller")}</h1>
      <p>${escapeHtml(maskPhone(call.callerNumber || ""))} · ${escapeHtml(formatStamp(call.startedAt, ZONE))}</p>
      <p class="summary">${escapeHtml(call.summary || "")}</p>
      <h2>Transcript</h2>
      <pre class="transcript-block">${escapeHtml(redactSensitive(call.transcript || "No transcript stored."))}</pre>
      <h2>Tools</h2>
      ${tools.length ? `<ol class="tools">${toolRows}</ol>` : `<p class="empty">No tools on this call.</p>`}
    </main>`,
  );
}

function casesHtml(base: string, cases: CaseRecord[]): string {
  const cards = cases
    .map(
      (item) => `<article class="job"><p class="kicker">${escapeHtml(item.kind)} · ${escapeHtml(item.status)}</p><h3>${escapeHtml(item.accountName)}</h3><p>${escapeHtml(item.summary)}</p><p class="muted">${escapeHtml(formatStamp(item.createdAt, ZONE))}</p></article>`,
    )
    .join("");
  return `<div class="page-head"><h1>Cases</h1>
    <form method="post" action="${base}/demo/reminder"><button type="submit">Simulate outbound reminder</button></form>
  </div>
  <p>The reminder is a scripted browser-call preview. It includes the mini-Miranda and does not dial a phone.</p>
  ${cards ? `<div class="kanban">${cards}</div>` : `<p class="empty">No cases yet.</p>`}`;
}

function callsHtml(base: string, calls: CallRecord[], query: string): string {
  const rows = calls
    .map(
      (call) => `<tr>
        <td><a href="${base}/calls/${escapeHtml(call.id)}">${escapeHtml(formatStamp(call.startedAt, ZONE))}</a></td>
        <td><a href="${base}/calls/${escapeHtml(call.id)}">${escapeHtml(call.callerName || "Unknown")}</a></td>
        <td>${escapeHtml(maskPhone(call.callerNumber || ""))}</td>
        <td><span class="pill ${escapeHtml(call.outcome)}">${escapeHtml(outcome(call.outcome))}</span></td>
        <td>${escapeHtml(call.summary || "")}</td>
      </tr>`,
    )
    .join("");
  return `<div class="page-head"><h1>Calls</h1>
    <form method="get" action="${base}/calls" role="search"><label for="q">Search</label><input id="q" name="q" value="${escapeHtml(query)}"><button type="submit">Search</button></form>
  </div>
  ${calls.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Caller</th><th>Phone</th><th>Outcome</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="empty">${query ? "No calls match that search." : "No calls yet."}</p>`}`;
}

function messagesHtml(messages: SmsMessage[]): string {
  const cards = messages
    .map(
      (message) => `<article class="sms"><p class="kicker">${escapeHtml(message.kind)} · mock</p><h3>To ${escapeHtml(maskPhone(message.toNumber))}</h3><p>${escapeHtml(message.body)}</p></article>`,
    )
    .join("");
  return `<h1>Messages</h1><p>Payment links are fake and do not charge a card.</p><div class="sms-list">${cards || `<p class="empty">No messages yet.</p>`}</div>`;
}

function accountsHtml(accounts: AccountRecord[]): string {
  const rows = accounts
    .map(
      (account) => `<tr>
        <td>${escapeHtml(account.name)}</td>
        <td>${escapeHtml(maskLast4(account.last4))}</td>
        <td>${escapeHtml(maskDob(account.dob))}</td>
        <td>${escapeHtml(maskPhone(account.phone))}</td>
        <td>${escapeHtml(money(account.balanceCents))}</td>
        <td>${account.ceaseContact ? "Do not discuss" : escapeHtml(money(account.pastDueCents))}</td>
        <td>${escapeHtml(account.cardStatus)}</td>
        <td>${escapeHtml(account.otpCode)}</td>
      </tr>`,
    )
    .join("");
  return `<h1>Accounts</h1><p>Last four only. The demo app code is shown so you can try the call. It is not a password.</p>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Card</th><th>Date of birth</th><th>Phone</th><th>Balance</th><th>Past due</th><th>Card</th><th>Demo code</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function auditHtml(events: AuditRecord[]): string {
  const rows = events
    .map(
      (event) => `<tr><td>${escapeHtml(formatStamp(event.createdAt, ZONE))}</td><td><code>${escapeHtml(event.action)}</code></td><td>${event.ok ? "allowed" : "refused"}</td><td>${escapeHtml(event.summary)}</td></tr>`,
    )
    .join("");
  return `<h1>Audit</h1><p>Refused card numbers are recorded as redacted. The digits are not stored.</p>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Tool</th><th>Result</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="empty">No tool access yet.</p>`}`;
}
