import { escapeHtml } from "../platform/html.js";
import { formatStamp } from "../platform/time.js";
import type { CallRecord, ToolCallRecord } from "../store/calls.js";
import type { SmsMessage } from "../store/sms.js";
import { ATTORNEYS, FIRM, PRACTICE_LABELS } from "../verticals/legal/brand.js";
import { redactSsn } from "../verticals/legal/screen.js";
import type { Audit, Consult, Matter, Party } from "../verticals/legal/store.js";

const ZONE = FIRM.timezone;

function shell(title: string, description: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Source+Sans+3:wght@400;560;680&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body class="theme-legal">
${body}
</body>
</html>`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last = digits.slice(-4);
  return last ? `(303) ***-${last}` : "";
}

function outcome(value: string): string {
  const labels: Record<string, string> = {
    serviced: "Handled",
    refused: "Refused",
    transferred: "Transferred",
    text_back: "Text queued",
    off_topic: "Declined",
    escalated: "Urgent",
    no_booking: "No change",
    in_progress: "In progress",
    completed: "Completed",
  };
  return labels[value] ?? value;
}

export function renderLegalHome(base: string): string {
  return shell(
    `${FIRM.name} · intake`,
    "Fictional law firm demo. No legal advice and no attorney-client relationship.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}">
        <span class="mark legal-mark" aria-hidden="true"></span>
        <span><strong>${escapeHtml(FIRM.name)}</strong><small>${escapeHtml(FIRM.city)} · fictional firm</small></span>
      </a>
      <nav>
        <a href="${base}/board">Matters</a>
        <a href="${base}/calls">Calls</a>
        <a href="${base}/messages">Messages</a>
        <a href="${base}/contacts">Conflicts</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">${escapeHtml(FIRM.disclaimer)}</p>
    <main>
      <section class="hero hvac-hero">
        <div>
          <p class="eyebrow">Intake desk · no legal advice · no engagement until a real firm says so</p>
          <h1>Tell us the facts. Not what to do about them.</h1>
          <p class="lede">${escapeHtml(FIRM.name)} takes intake for personal injury, family, employment, estate planning, and criminal defense. Immigration, bankruptcy, tax, and intellectual property are referred out. A conflict hit ends the call without naming the other side. A deadline that looks close is a screening flag, not a legal opinion.</p>
          <ul class="facts">${FIRM.hours.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
        <div class="console" id="console" data-state="idle">
          <button id="talk" class="talk" type="button" data-token-url="${base}/api/call-token" data-board-url="${base}/board" data-idle-label="Talk to intake">
            <span class="dot" aria-hidden="true"></span>
            <span class="label">Talk to intake</span>
          </button>
          <p class="status" id="status" role="status" aria-live="polite">Microphone. Use a made-up name. Do not share a Social Security number.</p>
          <div class="meter" aria-hidden="true"><span id="level"></span></div>
          <ol class="transcript" id="transcript" aria-label="Live transcript"></ol>
        </div>
      </section>
      <section class="danger" role="note">
        <h2>If you are in danger</h2>
        <p>Call 911. The National Domestic Violence Hotline is ${escapeHtml(FIRM.dvHotline)}. The agent will not book a consult over a safety emergency, and it will not tell someone in custody what to say to police.</p>
      </section>
      <section class="grid3">
        <article>
          <h2>Try saying</h2>
          <ul>
            <li>“Will I win if I sue them?”</li>
            <li>“The other side is Northline Logistics.”</li>
            <li>“I was hurt in a crash on December 20, 2024.”</li>
            <li>“I need help with an immigration visa.”</li>
            <li>“I'm in jail and I need a lawyer.”</li>
          </ul>
        </article>
        <article>
          <h2>The desk</h2>
          <p>${escapeHtml(FIRM.address)}. ${escapeHtml(FIRM.addressNote)}</p>
          <p>Desk ${escapeHtml(FIRM.phoneDisplay)} · paralegal ${escapeHtml(FIRM.paralegalDisplay)} · on-call ${escapeHtml(FIRM.urgentDisplay)}</p>
          <p>${ATTORNEYS.map((attorney) => escapeHtml(attorney.name)).join(" · ")}</p>
        </article>
        <article>
          <h2>What a consult is</h2>
          <p>Thirty minutes with the lawyer who covers that practice. Free, or a demo fee that is never charged. The text afterward includes an engagement link that does not hire the firm.</p>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(FIRM.disclaimer)}</p></footer>
    <script type="module" src="/assets/talk.js"></script>`,
  );
}

export type LegalDesk = {
  matters: Matter[];
  consults: Consult[];
  parties: Party[];
  calls: CallRecord[];
  messages: SmsMessage[];
  audit: Audit[];
};

export function renderLegalDesk(base: string, tab: "board" | "calls" | "messages" | "contacts" | "audit", data: LegalDesk, query = "", notice = ""): string {
  const tabs = [
    ["board", "Matters"],
    ["calls", "Calls"],
    ["messages", "Messages"],
    ["contacts", "Conflicts"],
    ["audit", "Audit"],
  ]
    .map(([id, label]) => `<a href="${base}/${id}" class="${tab === id ? "active" : ""}">${label}</a>`)
    .join("");
  return shell(
    `${tab} · ${FIRM.name}`,
    "Fictional intake board. Conflict hits do not name the other side.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}"><span class="mark legal-mark" aria-hidden="true"></span><span><strong>${escapeHtml(FIRM.name)}</strong><small>Intake desk · fictional · no legal advice</small></span></a>
      <nav><a href="${base || "/"}">Talk</a><a href="/platform">All verticals</a></nav>
    </header>
    <p class="banner">${escapeHtml(FIRM.disclaimer)}</p>
    <main class="desk">
      <section class="kpis">
        <article><span>Open matters</span><strong>${data.matters.filter((item) => item.status !== "closed").length}</strong></article>
        <article><span>Priority</span><strong>${data.matters.filter((item) => item.urgent).length}</strong></article>
        <article><span>Consults</span><strong>${data.consults.filter((item) => item.status === "scheduled").length}</strong></article>
        <article><span>Conflict names</span><strong>${data.parties.length}</strong></article>
      </section>
      <nav class="tabs">${tabs}</nav>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      ${tab === "board" ? mattersHtml(base, data) : ""}
      ${tab === "calls" ? callsHtml(base, data.calls, query) : ""}
      ${tab === "messages" ? messagesHtml(data.messages) : ""}
      ${tab === "contacts" ? contactsHtml(data.parties) : ""}
      ${tab === "audit" ? auditHtml(data.audit) : ""}
    </main>`,
  );
}

export function renderLegalCall(base: string, call: CallRecord, tools: ToolCallRecord[]): string {
  const toolRows = tools
    .map((tool) => `<li><code>${escapeHtml(tool.name)}</code><pre>${escapeHtml(redactSsn(JSON.stringify(tool.result, null, 2)))}</pre></li>`)
    .join("");
  return shell(
    `${call.callerName || "Call"} · ${FIRM.name}`,
    "Call detail. Social Security numbers are redacted.",
    `<header class="bar"><a class="brand" href="${base}/calls"><span class="mark legal-mark" aria-hidden="true"></span><span><strong>Back to calls</strong></span></a></header>
    <main class="desk">
      <p class="pill ${escapeHtml(call.outcome)}">${escapeHtml(outcome(call.outcome))}</p>
      <h1>${escapeHtml(call.callerName || "Unknown caller")}</h1>
      <p>${escapeHtml(maskPhone(call.callerNumber || ""))} · ${escapeHtml(formatStamp(call.startedAt, ZONE))}</p>
      <p class="summary">${escapeHtml(call.summary || "")}</p>
      <h2>Transcript</h2>
      <pre class="transcript-block">${escapeHtml(redactSsn(call.transcript || "No transcript stored."))}</pre>
      <h2>Tools</h2>
      ${tools.length ? `<ol class="tools">${toolRows}</ol>` : `<p class="empty">No tools on this call.</p>`}
    </main>`,
  );
}

function mattersHtml(base: string, data: LegalDesk): string {
  const cards = data.matters
    .map((matter) => {
      const consult = data.consults.find((item) => item.matterId === matter.id && item.status === "scheduled");
      return `<article class="job">
        <p class="kicker">${escapeHtml(PRACTICE_LABELS[matter.practice] ?? matter.practice)} · ${escapeHtml(matter.status)}${matter.urgent ? " · priority callback" : ""}</p>
        <h3>${escapeHtml(matter.callerName)}</h3>
        <p>${escapeHtml(matter.summary)}</p>
        <p class="muted">${escapeHtml(matter.jurisdiction || "Jurisdiction not set")} · ${escapeHtml(maskPhone(matter.phone))}${consult ? ` · consult ${escapeHtml(formatStamp(consult.startsAt, ZONE))}` : ""}</p>
      </article>`;
    })
    .join("");
  return `<div class="page-head"><h1>Matters</h1>
    <form method="post" action="${base}/demo/summary"><button type="submit">Queue intake summary</button></form>
  </div>
  <p>Grouped by practice and status. A priority flag means a screening deadline looks close. It is not a legal opinion. The opposing party is kept off this card.</p>
  ${cards ? `<div class="kanban">${cards}</div>` : `<p class="empty">No matters yet.</p>`}`;
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
  return `<h1>Messages</h1><p>Engagement links are fake and do not hire the firm.</p><div class="sms-list">${cards || `<p class="empty">No messages yet.</p>`}</div>`;
}

function contactsHtml(parties: Party[]): string {
  const clients = parties.filter((party) => party.side === "client").map((party) => `<li>${escapeHtml(party.name)}</li>`).join("");
  const adverse = parties.filter((party) => party.side === "adverse").map((party) => `<li>${escapeHtml(party.name)}</li>`).join("");
  return `<h1>Conflicts</h1>
    <p>These names are on the demo conflict list. They are not paired on this page. A hit on a call says only that the firm can't proceed.</p>
    <div class="grid3">
      <article><h2>Clients</h2><ul>${clients}</ul></article>
      <article><h2>Adverse parties</h2><ul>${adverse}</ul></article>
    </div>`;
}

function auditHtml(events: Audit[]): string {
  const rows = events
    .map(
      (event) => `<tr><td>${escapeHtml(formatStamp(event.createdAt, ZONE))}</td><td><code>${escapeHtml(event.action)}</code></td><td>${event.ok ? "allowed" : "refused"}</td><td>${escapeHtml(event.summary)}</td></tr>`,
    )
    .join("");
  return `<h1>Audit</h1><p>Refusals are recorded without the other side's facts.</p>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Tool</th><th>Result</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="empty">No tool access yet.</p>`}`;
}
