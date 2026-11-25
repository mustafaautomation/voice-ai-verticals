import { escapeHtml } from "../platform/html.js";
import { formatStamp } from "../platform/time.js";
import type { CallRecord, ToolCallRecord } from "../store/calls.js";
import type { SmsMessage } from "../store/sms.js";
import { HOUSE, MENU, money } from "../verticals/restaurant/brand.js";
import type { Reservation, Ticket } from "../verticals/restaurant/store.js";

const ZONE = HOUSE.timezone;

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
<body class="theme-restaurant">
${body}
</body>
</html>`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last = digits.slice(-4);
  return last ? `(207) ***-${last}` : "";
}

function outcome(value: string): string {
  const labels: Record<string, string> = {
    serviced: "Handled",
    booked: "Booked",
    rescheduled: "Moved",
    cancelled: "Cancelled",
    refused: "Refused",
    transferred: "Manager",
    text_back: "Text queued",
    off_topic: "Declined",
    escalated: "911",
    slot_unavailable: "Full",
    no_booking: "No change",
    in_progress: "In progress",
    completed: "Completed",
  };
  return labels[value] ?? value;
}

export function renderRestaurantHome(base: string): string {
  return shell(
    `${HOUSE.name} · host stand`,
    "Fictional Portland bistro. Orders, reservations, and kitchen tickets. Nothing is charged.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}">
        <span class="mark restaurant-mark" aria-hidden="true"></span>
        <span><strong>${escapeHtml(HOUSE.name)}</strong><small>${escapeHtml(HOUSE.city)} · fictional bistro</small></span>
      </a>
      <nav>
        <a href="${base}/board">Board</a>
        <a href="${base}/calls">Calls</a>
        <a href="${base}/messages">Messages</a>
        <a href="${base}/menu">Menu</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">${escapeHtml(HOUSE.disclaimer)}</p>
    <main>
      <section class="hero hvac-hero">
        <div>
          <p class="eyebrow">Host stand · pickup and delivery · dinner book</p>
          <h1>A table, a ticket, and the allergy on the dupe.</h1>
          <p class="lede">${escapeHtml(HOUSE.name)} takes phone orders with modifiers and a demo total, books parties of up to eight, and prints a kitchen ticket the board can see. It will not promise an allergen-free plate. A reaction goes to 911 before anyone talks about the chicken.</p>
          <ul class="facts">${HOUSE.hours.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
        <div class="console" id="console" data-state="idle">
          <button id="talk" class="talk" type="button" data-token-url="${base}/api/call-token" data-board-url="${base}/board" data-idle-label="Talk to Larkglass">
            <span class="dot" aria-hidden="true"></span>
            <span class="label">Talk to Larkglass</span>
          </button>
          <p class="status" id="status" role="status" aria-live="polite">Microphone. Use a made-up name. Delivery in this demo stays in Portland.</p>
          <div class="meter" aria-hidden="true"><span id="level"></span></div>
          <ol class="transcript" id="transcript" aria-label="Live transcript"></ol>
        </div>
      </section>
      <section class="danger" role="note">
        <h2>Allergies</h2>
        <p>Tell the host what to keep off the plate. The ticket shows the note. If a dish overlaps that allergy, the ticket stays on hold for the manager. If someone is reacting now, call 911. This kitchen cannot certify a plate.</p>
      </section>
      <section class="grid3">
        <article>
          <h2>Try saying</h2>
          <ul>
            <li>“Pickup cider chicken, extra farro.”</li>
            <li>“I have a peanut allergy.”</li>
            <li>“Is the cake guaranteed safe?”</li>
            <li>“Table for two at 5.”</li>
            <li>“We're ten people. Get the manager.”</li>
          </ul>
        </article>
        <article>
          <h2>The room</h2>
          <p>${escapeHtml(HOUSE.address)}. ${escapeHtml(HOUSE.addressNote)}</p>
          <p>Host ${escapeHtml(HOUSE.phoneDisplay)} · manager ${escapeHtml(HOUSE.managerDisplay)}</p>
        </article>
        <article>
          <h2>What a total is</h2>
          <p>Food, an 8% demo tax, and $4 if the address is in Portland. The text afterward does not charge a card and does not send a driver.</p>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(HOUSE.disclaimer)}</p></footer>
    <script type="module" src="/assets/talk.js"></script>`,
  );
}

export type RestaurantDesk = {
  tickets: Ticket[];
  reservations: Reservation[];
  calls: CallRecord[];
  messages: SmsMessage[];
};

export function renderRestaurantDesk(base: string, tab: "board" | "calls" | "messages" | "menu", data: RestaurantDesk, query = "", notice = ""): string {
  const tabs = [
    ["board", "Board"],
    ["calls", "Calls"],
    ["messages", "Messages"],
    ["menu", "Menu"],
  ]
    .map(([id, label]) => `<a href="${base}/${id}" class="${tab === id ? "active" : ""}">${label}</a>`)
    .join("");
  return shell(
    `${tab} · ${HOUSE.name}`,
    "Fictional host stand. Kitchen tickets and the dinner book.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}"><span class="mark restaurant-mark" aria-hidden="true"></span><span><strong>${escapeHtml(HOUSE.name)}</strong><small>Host stand · fictional · nothing charged</small></span></a>
      <nav><a href="${base || "/"}">Talk</a><a href="/platform">All verticals</a></nav>
    </header>
    <p class="banner">${escapeHtml(HOUSE.disclaimer)}</p>
    <main class="desk">
      <section class="kpis">
        <article><span>Open tickets</span><strong>${data.tickets.filter((item) => item.status !== "done").length}</strong></article>
        <article><span>On hold</span><strong>${data.tickets.filter((item) => item.status === "hold").length}</strong></article>
        <article><span>Reservations</span><strong>${data.reservations.filter((item) => item.status === "scheduled").length}</strong></article>
        <article><span>Texts</span><strong>${data.messages.length}</strong></article>
      </section>
      <nav class="tabs">${tabs}</nav>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      ${tab === "board" ? boardHtml(base, data) : ""}
      ${tab === "calls" ? callsHtml(base, data.calls, query) : ""}
      ${tab === "messages" ? messagesHtml(data.messages) : ""}
      ${tab === "menu" ? menuHtml() : ""}
    </main>`,
  );
}

export function renderRestaurantCall(base: string, call: CallRecord, tools: ToolCallRecord[]): string {
  const toolRows = tools.map((tool) => `<li><code>${escapeHtml(tool.name)}</code><pre>${escapeHtml(JSON.stringify(tool.result, null, 2))}</pre></li>`).join("");
  return shell(
    `${call.callerName || "Call"} · ${HOUSE.name}`,
    "Call detail for a fictional bistro.",
    `<header class="bar"><a class="brand" href="${base}/calls"><span class="mark restaurant-mark" aria-hidden="true"></span><span><strong>Back to calls</strong></span></a></header>
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

function boardHtml(base: string, data: RestaurantDesk): string {
  const cards = data.tickets
    .map((ticket) => {
      const dishes = ticket.lines.map((line) => `${line.qty} ${line.name}${line.modifiers.length ? ` (${line.modifiers.join(", ")})` : ""}`).join("; ");
      return `<article class="job">
        <p class="kicker">${escapeHtml(ticket.fulfillment)} · ${escapeHtml(ticket.status)}${ticket.allergy ? " · allergy on the ticket" : ""}</p>
        <h3>${escapeHtml(ticket.guestName)}</h3>
        <p>${escapeHtml(dishes)}</p>
        <p>${escapeHtml(money(ticket.totalCents))}${ticket.allergy ? ` · note: ${escapeHtml(ticket.allergy)}` : ""}</p>
        <p class="muted">${escapeHtml(maskPhone(ticket.phone))}${ticket.address ? ` · ${escapeHtml(ticket.address)}` : ""}</p>
      </article>`;
    })
    .join("");
  const book = data.reservations
    .filter((item) => item.status === "scheduled")
    .map(
      (item) => `<article class="job">
        <p class="kicker">Reservation · party of ${item.partySize}</p>
        <h3>${escapeHtml(item.guestName)}</h3>
        <p>${escapeHtml(formatStamp(item.startsAt, ZONE))} ET</p>
        <p class="muted">${escapeHtml(maskPhone(item.phone))}${item.allergy ? ` · ${escapeHtml(item.allergy)}` : ""}</p>
      </article>`,
    )
    .join("");
  return `<div class="page-head"><h1>Kitchen board</h1>
    <form method="post" action="${base}/demo/ticket"><button type="submit">Fire sample ticket</button></form>
  </div>
  <p>Tickets land here as soon as an order is placed. A hold means a dish overlaps the allergy note. That is not a promise the plate is safe.</p>
  ${cards ? `<div class="kanban">${cards}</div>` : `<p class="empty">No tickets yet.</p>`}
  <h2>Dinner book</h2>
  ${book ? `<div class="kanban">${book}</div>` : `<p class="empty">No reservations yet.</p>`}`;
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
  return `<h1>Messages</h1><p>Confirmation texts are fake. They do not charge a card or dispatch a driver.</p><div class="sms-list">${cards || `<p class="empty">No messages yet.</p>`}</div>`;
}

function menuHtml(): string {
  const cards = MENU.map((item) => {
    const mods = Object.values(item.modifiers).map((modifier) => modifier.label);
    return `<article class="job">
      <p class="kicker">${escapeHtml(money(item.cents))}${item.allergens.length ? ` · contains ${escapeHtml(item.allergens.join(", "))}` : " · no listed allergen"}</p>
      <h3>${escapeHtml(item.name)}</h3>
      <p>${escapeHtml(item.detail)}</p>
      <p class="muted">${mods.length ? escapeHtml(mods.join(" · ")) : "No modifiers"}</p>
    </article>`;
  }).join("");
  return `<h1>Menu</h1><p>Prices are demo totals before tax. Allergens are a label, not a guarantee.</p><div class="kanban">${cards}</div>`;
}
