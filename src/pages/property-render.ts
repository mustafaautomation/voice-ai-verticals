import { escapeHtml } from "../platform/html.js";
import { formatStamp } from "../platform/time.js";
import type { CallRecord, ToolCallRecord } from "../store/calls.js";
import type { SmsMessage } from "../store/sms.js";
import { FIRM, UNITS, buildingById, money } from "../verticals/property/brand.js";
import type { Ticket, Tour } from "../verticals/property/store.js";

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
<body class="theme-property">
${body}
</body>
</html>`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last = digits.slice(-4);
  return last ? `(401) ***-${last}` : "";
}

function outcome(value: string): string {
  const labels: Record<string, string> = {
    serviced: "Handled",
    booked: "Booked",
    rescheduled: "Moved",
    cancelled: "Cancelled",
    refused: "Refused",
    transferred: "Leasing",
    text_back: "Text queued",
    off_topic: "Declined",
    escalated: "On-call",
    slot_unavailable: "Full",
    no_booking: "No change",
    in_progress: "In progress",
    completed: "Completed",
  };
  return labels[value] ?? value;
}

export function renderPropertyHome(base: string): string {
  return shell(
    `${FIRM.name} · after-hours desk`,
    "Fictional Providence property manager. Tickets, tours, and a portal that does not take rent.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}">
        <span class="mark property-mark" aria-hidden="true"></span>
        <span><strong>${escapeHtml(FIRM.name)}</strong><small>${escapeHtml(FIRM.city)} · fictional manager</small></span>
      </a>
      <nav>
        <a href="${base}/board">Tickets</a>
        <a href="${base}/tours">Tours</a>
        <a href="${base}/calls">Calls</a>
        <a href="${base}/messages">Messages</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">${escapeHtml(FIRM.disclaimer)}</p>
    <main>
      <section class="hero hvac-hero">
        <div>
          <p class="eyebrow">Two buildings · emergency vs routine · no rent collected</p>
          <h1>Leave for gas. A drip can wait until morning.</h1>
          <p class="lede">${escapeHtml(FIRM.name)} answers for Lantern House and Glassmill. Gas and carbon monoxide go to 911. Flooding, no heat, and lockouts page the on-call resident. Routine repairs wait for the office. Prospects can tour vacant units. The portal link does not take a payment.</p>
          <ul class="facts">${FIRM.hours.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
        <div class="console" id="console" data-state="idle">
          <button id="talk" class="talk" type="button" data-token-url="${base}/api/call-token" data-board-url="${base}/board" data-idle-label="Talk to Bramblefen">
            <span class="dot" aria-hidden="true"></span>
            <span class="label">Talk to Bramblefen</span>
          </button>
          <p class="status" id="status" role="status" aria-live="polite">Microphone. Maya Chen's demo portal code is 4412. Do not read a card number.</p>
          <div class="meter" aria-hidden="true"><span id="level"></span></div>
          <ol class="transcript" id="transcript" aria-label="Live transcript"></ol>
        </div>
      </section>
      <section class="danger" role="note">
        <h2>Life safety</h2>
        <p>Smell gas or a rotten egg odor: leave, skip the switches, and call 911 from outside. If water is near outlets, or someone is in danger from the cold, call 911. The desk will not explain how to force a lock.</p>
      </section>
      <section class="grid3">
        <article>
          <h2>Try saying</h2>
          <ul>
            <li>“I smell gas.”</li>
            <li>“Water is pouring through the ceiling. Maya Chen, LH-204, March 14, 1984.”</li>
            <li>“I'm locked out. Priya Shah, LH-118, portal code 7731.”</li>
            <li>“Tour LH-310 tomorrow at 10:30.”</li>
            <li>“Can I pay rent with a card?”</li>
          </ul>
        </article>
        <article>
          <h2>The portfolio</h2>
          <p>${escapeHtml(FIRM.address)}. ${escapeHtml(FIRM.addressNote)}</p>
          <p>Office ${escapeHtml(FIRM.phoneDisplay)} · on-call ${escapeHtml(FIRM.onCallDisplay)} · leasing ${escapeHtml(FIRM.leasingDisplay)}</p>
        </article>
        <article>
          <h2>Rent</h2>
          <p>The resident portal is where a real firm would show a balance. This demo texts a link and stops. It never asks for a card, a routing number, or a bank login.</p>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(FIRM.disclaimer)}</p></footer>
    <script type="module" src="/assets/talk.js"></script>`,
  );
}

export type PropertyDesk = { tickets: Ticket[]; tours: Tour[]; calls: CallRecord[]; messages: SmsMessage[] };

export function renderPropertyDesk(base: string, tab: "board" | "tours" | "calls" | "messages", data: PropertyDesk, query = "", notice = ""): string {
  const tabs = [
    ["board", "Tickets"],
    ["tours", "Tours"],
    ["calls", "Calls"],
    ["messages", "Messages"],
  ]
    .map(([id, label]) => `<a href="${base}/${id}" class="${tab === id ? "active" : ""}">${label}</a>`)
    .join("");
  return shell(
    `${tab} · ${FIRM.name}`,
    "Fictional maintenance board and tour book.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}"><span class="mark property-mark" aria-hidden="true"></span><span><strong>${escapeHtml(FIRM.name)}</strong><small>After-hours desk · fictional · no rent collected</small></span></a>
      <nav><a href="${base || "/"}">Talk</a><a href="/platform">All verticals</a></nav>
    </header>
    <p class="banner">${escapeHtml(FIRM.disclaimer)}</p>
    <main class="desk">
      <section class="kpis">
        <article><span>Open tickets</span><strong>${data.tickets.filter((item) => item.status !== "done").length}</strong></article>
        <article><span>Emergencies</span><strong>${data.tickets.filter((item) => item.priority === "emergency").length}</strong></article>
        <article><span>Tours</span><strong>${data.tours.filter((item) => item.status === "scheduled").length}</strong></article>
        <article><span>Texts</span><strong>${data.messages.length}</strong></article>
      </section>
      <nav class="tabs">${tabs}</nav>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      ${tab === "board" ? boardHtml(base, data.tickets) : ""}
      ${tab === "tours" ? toursHtml(data.tours) : ""}
      ${tab === "calls" ? callsHtml(base, data.calls, query) : ""}
      ${tab === "messages" ? messagesHtml(data.messages) : ""}
    </main>`,
  );
}

export function renderPropertyCall(base: string, call: CallRecord, tools: ToolCallRecord[]): string {
  const toolRows = tools.map((tool) => `<li><code>${escapeHtml(tool.name)}</code><pre>${escapeHtml(JSON.stringify(tool.result, null, 2))}</pre></li>`).join("");
  return shell(
    `${call.callerName || "Call"} · ${FIRM.name}`,
    "Call detail for a fictional property desk.",
    `<header class="bar"><a class="brand" href="${base}/calls"><span class="mark property-mark" aria-hidden="true"></span><span><strong>Back to calls</strong></span></a></header>
    <main class="desk">
      <p class="pill ${escapeHtml(call.outcome)}">${escapeHtml(outcome(call.outcome))}</p>
      <h1>${escapeHtml(call.callerName || "Unknown caller")}</h1>
      <p>${escapeHtml(maskPhone(call.callerNumber || ""))} · ${escapeHtml(formatStamp(call.startedAt, ZONE))}</p>
      <p class="summary">${escapeHtml(call.summary || "")}</p>
      <h2>Transcript</h2>
      <pre class="transcript-block">${escapeHtml(call.transcript || "No transcript stored.")}</pre>
      <h2>Tools</h2>
      ${tools.length ? `<ol class="tools">${toolRows}</ol>` : `<p class="empty">No tools on this call.</p>`}
    </main>`,
  );
}

function boardHtml(base: string, tickets: Ticket[]): string {
  const cards = tickets
    .map(
      (ticket) => `<article class="job">
        <p class="kicker">${escapeHtml(ticket.category)} · ${escapeHtml(ticket.priority)} · ${escapeHtml(ticket.status)}</p>
        <h3>${escapeHtml(ticket.callerName)} · ${escapeHtml(ticket.unitId || "no unit")}</h3>
        <p>${escapeHtml(ticket.summary)}</p>
        <p class="muted">${escapeHtml(formatStamp(ticket.createdAt, ZONE))}</p>
      </article>`,
    )
    .join("");
  return `<div class="page-head"><h1>Tickets</h1>
    <form method="post" action="${base}/demo/ticket"><button type="submit">Open sample drip ticket</button></form>
  </div>
  <p>Emergencies sit beside routine drips. A safety ticket means the caller was told to leave and call 911.</p>
  ${cards ? `<div class="kanban">${cards}</div>` : `<p class="empty">No tickets yet.</p>`}`;
}

function toursHtml(tours: Tour[]): string {
  const vacant = UNITS.filter((unit) => unit.vacant)
    .map((unit) => {
      const building = buildingById(unit.buildingId);
      return `<li>${escapeHtml(unit.id)} · ${escapeHtml(building?.name ?? "")} · ${unit.beds} bed · listed ${escapeHtml(money(unit.listedRentCents ?? 0))}</li>`;
    })
    .join("");
  const cards = tours
    .filter((tour) => tour.status === "scheduled")
    .map(
      (tour) => `<article class="job"><p class="kicker">${escapeHtml(tour.unitId)}</p><h3>${escapeHtml(tour.prospectName)}</h3><p>${escapeHtml(formatStamp(tour.startsAt, ZONE))} ET</p><p class="muted">${escapeHtml(maskPhone(tour.phone))}</p></article>`,
    )
    .join("");
  return `<h1>Tours</h1><p>Vacant units only. Listed rent is not a charge, and occupied units are not named.</p><ul>${vacant}</ul>${cards ? `<div class="kanban">${cards}</div>` : `<p class="empty">No tours yet.</p>`}`;
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
    .map((message) => `<article class="sms"><p class="kicker">${escapeHtml(message.kind)} · mock</p><h3>To ${escapeHtml(maskPhone(message.toNumber))}</h3><p>${escapeHtml(message.body)}</p></article>`)
    .join("");
  return `<h1>Messages</h1><p>On-call pages and portal links stay in this inbox. Nothing is charged.</p><div class="sms-list">${cards || `<p class="empty">No messages yet.</p>`}</div>`;
}
