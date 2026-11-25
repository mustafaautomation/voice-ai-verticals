import type { CallRecord, ToolCallRecord } from "../store/calls.js";
import type { Customer } from "../store/customers.js";
import type { JobRecord } from "../store/jobs.js";
import type { SmsMessage } from "../store/sms.js";
import { escapeHtml } from "../platform/html.js";
import { formatPhone } from "../platform/phone.js";
import { formatStamp } from "../platform/time.js";
import { techById } from "../platform/schedule.js";
import { CATALOG } from "../verticals/catalog.js";
import { BRAND, HVAC_OPS, jobLabel } from "../verticals/hvac/brand.js";

const ZONE = BRAND.timezone;

export function outcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    in_progress: "In progress",
    booked: "Booked",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
    transferred: "Transferred",
    escalated: "On-call paged",
    text_back: "Text queued",
    slot_unavailable: "Window full",
    off_topic: "Declined",
    refused: "Refused",
    refill: "Refill queued",
    serviced: "Handled",
    completed: "Completed",
    no_booking: "No booking",
  };
  return labels[outcome] ?? outcome;
}

function shell(input: { title: string; description: string; body: string; active?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.title)}</title>
  <meta name="description" content="${escapeHtml(input.description)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Source+Sans+3:wght@400;560;680&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
${input.body}
</body>
</html>`;
}

export function renderLanding(): string {
  const cards = CATALOG.map((vertical) => {
    const live = vertical.status === "live";
    return `<article class="v-card ${live ? "live" : "soon"}">
      <p class="kicker">${escapeHtml(vertical.industry)}</p>
      <h2>${escapeHtml(vertical.name)}</h2>
      <p>${escapeHtml(vertical.summary)}</p>
      <p class="planned">${escapeHtml(vertical.planned)}</p>
      ${
        live && vertical.href && vertical.cta
          ? `<a class="button" href="${vertical.href}">${escapeHtml(vertical.cta)}</a>`
          : `<span class="soon-pill">Coming soon</span>`
      }
    </article>`;
  }).join("");
  return shell({
    title: "Voice verticals · portfolio demos",
    description: "A multi-vertical voice AI platform. HVAC, a clinic, a card desk, a law-firm intake, a bistro, and a property desk are live.",
    body: `<header class="bar">
      <a class="brand" href="/">
        <span class="mark" aria-hidden="true"></span>
        <span><strong>Voice verticals</strong><small>Portfolio · Mustafa</small></span>
      </a>
      <nav>
        <a href="/v/hvac">HVAC demo</a>
        <a href="/v/clinic">Clinic demo</a>
        <a href="/v/fintech">Wrenline demo</a>
        <a href="/v/legal">Legal demo</a>
        <a href="/v/restaurant">Larkglass demo</a>
        <a href="/v/property">Bramblefen demo</a>
        <a href="/v/hvac/board">Dispatch board</a>
        <a href="https://github.com/mustafaautomation">GitHub</a>
      </nav>
    </header>
    <main>
      <section class="hero platform">
        <p class="eyebrow">Portfolio demo · fictional businesses · free tiers only</p>
        <h1>One voice core. A dispatcher for every trade.</h1>
        <p class="lede">Browser calls through Vapi, tools defined in code, and a mock back office you can click through. Fennwick Comfort answers for a made-up Duluth heating company. Lindenmere Primary Care answers for a made-up Madison clinic. Wrenline answers for a made-up Austin card. Quillmere Law answers for a made-up Denver firm and does not give legal advice. Larkglass answers for a made-up Portland bistro and does not charge a card. Bramblefen answers for a made-up Providence property manager and does not collect rent.</p>
        <div class="hero-actions">
          <a class="button" href="/v/hvac">Talk to Fennwick Comfort</a>
          <a class="button ghost" href="/v/clinic">Talk to Lindenmere</a>
          <a class="button ghost" href="/v/fintech">Talk to Wrenline</a>
          <a class="button ghost" href="/v/legal">Talk to Quillmere</a>
          <a class="button ghost" href="/v/restaurant">Talk to Larkglass</a>
          <a class="button ghost" href="/v/property">Talk to Bramblefen</a>
        </div>
      </section>
      <section class="catalog" aria-label="Verticals">
        ${cards}
      </section>
      <section class="split">
        <article>
          <h2>What a vertical is</h2>
          <p>A brand, a system prompt, a tool list, triage rules, and conversation evals. The core owns the call log, the webhook, the browser-call quota, and the SMS adapter. HVAC, the clinic, Wrenline, Quillmere, Larkglass, and Bramblefen each register their own tools.</p>
        </article>
        <article>
          <h2>What this is not</h2>
          <p>Not a real contractor, clinic, lender, law firm, restaurant, or property manager. No paid phone number, no paid SMS, no card data, no legal advice, no real delivery, and no rent collection. 555 numbers and Harbor Glass Avenue are invented. If you smell gas in real life, leave and call 911. If you are in danger, call 911.</p>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(BRAND.disclaimer)} Sibling dental demo: <a href="https://voice.quvantic.com">voice.quvantic.com</a>.</p></footer>`,
  });
}

export function renderHvacHome(base: string): string {
  const techs = HVAC_OPS.techs
    .map((tech) => `<li><strong>${escapeHtml(tech.name)}</strong> · ${escapeHtml(tech.skills.join(", "))} · on call ${onCallDays(tech.onCallWeekdays)}</li>`)
    .join("");
  return shell({
    title: `${BRAND.name} · after-hours dispatcher`,
    description: "Talk to a fictional Duluth HVAC dispatcher. It triages gas and CO alarms, books arrival windows, and queues demo texts.",
    body: `<header class="bar hvac">
      <a class="brand" href="${base || "/"}">
        <span class="mark pine" aria-hidden="true"></span>
        <span><strong>${escapeHtml(BRAND.name)}</strong><small>${escapeHtml(BRAND.city)}</small></span>
      </a>
      <nav>
        <a href="${base}/board">Dispatch board</a>
        <a href="${base}/calls">Calls</a>
        <a href="${base}/messages">Texts</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">${escapeHtml(BRAND.disclaimer)}</p>
    <main>
      <section class="hero hvac-hero">
        <div>
          <p class="eyebrow">After-hours receptionist · browser call · no phone number</p>
          <h1>Leave if you smell gas. Book the rest.</h1>
          <p class="lede">Fennwick answers when the Duluth desk is closed. Gas odor and CO alarms get a leave-the-house script and an on-call page. No heat in a freeze, or no cooling in extreme heat with a baby or an older adult home, takes the next window. Tune-ups and quotes wait for a normal arrival window.</p>
          <ul class="facts">
            ${BRAND.hours.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
          </ul>
        </div>
        <div class="console" id="console" data-state="idle">
          <button id="talk" class="talk" type="button" data-token-url="${base}/api/call-token" data-board-url="${base}/board">
            <span class="dot" aria-hidden="true"></span>
            <span class="label">Talk to dispatch</span>
          </button>
          <p class="status" id="status" role="status" aria-live="polite">Uses your microphone. Up to 3 calls per visitor a day, 4 minutes each. Free Vapi credits.</p>
          <div class="meter" aria-hidden="true"><span id="level"></span></div>
          <ol class="transcript" id="transcript" aria-label="Live transcript"></ol>
        </div>
      </section>
      <section class="danger" role="note">
        <h2>Gas or CO</h2>
        <p>The agent tells the caller to leave, avoid switches, and call 911 plus the fictional utility ${escapeHtml(BRAND.gasUtilityName)} at ${escapeHtml(BRAND.gasUtilityDisplay)}. It then texts the on-call technician in the demo inbox. It will not book that as a routine window.</p>
      </section>
      <section class="grid3">
        <article>
          <h2>Try saying</h2>
          <ul>
            <li>“I smell gas in the basement.”</li>
            <li>“The furnace died and it is 12 degrees.”</li>
            <li>“The AC is out, it is 99, and the baby is home.”</li>
            <li>“I need a tune-up. I am Maya Chen, 218-555-0101.”</li>
            <li>“Text me instead, I am driving.”</li>
          </ul>
        </article>
        <article>
          <h2>Service area</h2>
          <p>${escapeHtml(BRAND.address)}. ${escapeHtml(BRAND.addressNote)}</p>
          <p>${escapeHtml(BRAND.serviceArea.join(", "))}.</p>
          <p>Desk ${escapeHtml(BRAND.phoneDisplay)} · on call ${escapeHtml(BRAND.onCallDisplay)}</p>
        </article>
        <article>
          <h2>Technicians</h2>
          <ul>${techs}</ul>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(BRAND.disclaimer)}</p></footer>
    <script type="module" src="/assets/talk.js"></script>`,
  });
}

export type BoardData = {
  jobs: JobRecord[];
  calls: CallRecord[];
  messages: SmsMessage[];
  customers: Customer[];
  tools?: ToolCallRecord[];
};

export function renderBoard(base: string, tab: "board" | "calls" | "messages" | "customers", data: BoardData, query = "", notice = ""): string {
  const open = data.jobs.filter((job) => job.status === "scheduled" || job.status === "dispatched").length;
  const emergencies = data.jobs.filter((job) => job.priority === "emergency").length;
  const tabs = [
    ["board", "Board"],
    ["calls", "Calls"],
    ["messages", "Texts"],
    ["customers", "Customers"],
  ]
    .map(([id, label]) => `<a href="${base}/${id}" class="${tab === id ? "active" : ""}">${label}</a>`)
    .join("");
  const noticeHtml = notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : "";
  return shell({
    title: `${tabTitle(tab)} · ${BRAND.name}`,
    description: "Demo dispatch board for the fictional Fennwick Comfort Co.",
    body: `<header class="bar hvac">
      <a class="brand" href="${base || "/"}">
        <span class="mark pine" aria-hidden="true"></span>
        <span><strong>${escapeHtml(BRAND.name)}</strong><small>Dispatch board · fictional</small></span>
      </a>
      <nav>
        <a href="${base || "/"}">Talk</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">Mock inbox and job board. Texts are stored here and are not delivered. ${escapeHtml(BRAND.disclaimer)}</p>
    <main class="desk">
      <section class="kpis" aria-label="Today">
        <article><span>Open jobs</span><strong>${open}</strong></article>
        <article><span>Emergency records</span><strong>${emergencies}</strong></article>
        <article><span>Demo texts</span><strong>${data.messages.length}</strong></article>
        <article><span>Calls</span><strong>${data.calls.length}</strong></article>
      </section>
      <nav class="tabs" aria-label="Board sections">${tabs}</nav>
      ${noticeHtml}
      ${tab === "board" ? jobsHtml(data.jobs) : ""}
      ${tab === "calls" ? callsHtml(base, data.calls, query) : ""}
      ${tab === "messages" ? messagesHtml(base, data.messages) : ""}
      ${tab === "customers" ? customersHtml(data.customers, data.jobs) : ""}
    </main>`,
  });
}

export function renderCall(base: string, call: CallRecord, tools: ToolCallRecord[]): string {
  const toolRows = tools
    .map(
      (tool) => `<li><code>${escapeHtml(tool.name)}</code><pre>${escapeHtml(JSON.stringify(tool.result, null, 2))}</pre></li>`,
    )
    .join("");
  return shell({
    title: `${call.callerName || "Call"} · ${BRAND.name}`,
    description: "Call detail for the fictional HVAC dispatcher.",
    body: `<header class="bar hvac">
      <a class="brand" href="${base}/calls"><span class="mark pine" aria-hidden="true"></span><span><strong>Back to calls</strong><small>${escapeHtml(BRAND.name)}</small></span></a>
    </header>
    <main class="desk">
      <p class="pill ${escapeHtml(call.outcome)}">${escapeHtml(outcomeLabel(call.outcome))}</p>
      <h1>${escapeHtml(call.callerName || call.callerNumber || "Unknown caller")}</h1>
      <p class="summary">${escapeHtml(call.summary || "No summary yet")}</p>
      <p>${escapeHtml(formatStamp(call.startedAt, ZONE))} · ${call.afterHours ? "After hours" : "Desk open"} · ${escapeHtml(call.endedReason || "no end reason")}</p>
      <h2>Transcript</h2>
      <pre class="transcript-block">${escapeHtml(call.transcript || "No transcript stored.")}</pre>
      <h2>Tools</h2>
      ${tools.length ? `<ol class="tools">${toolRows}</ol>` : `<p class="empty">No tools on this call.</p>`}
    </main>`,
  });
}

export function renderNotFound(base: string): string {
  return shell({
    title: "Not found",
    description: "Missing page",
    body: `<main class="desk"><h1>Not found</h1><p>That page is not on the demo. <a href="${base || "/"}">Back</a></p></main>`,
  });
}

function jobsHtml(jobs: JobRecord[]): string {
  if (jobs.length === 0) return `<p class="empty">No jobs yet. A booked call will land here.</p>`;
  const columns = ["dispatched", "scheduled", "completed", "cancelled"] as const;
  return `<div class="kanban">${columns
    .map((status) => {
      const rows = jobs.filter((job) => job.status === status);
      const cards = rows
        .map((job) => {
          const tech = techById(HVAC_OPS, job.techId);
          return `<article class="job ${escapeHtml(job.priority)}">
            <p class="kicker">${escapeHtml(job.priority)} · ${escapeHtml(jobLabel(job.jobType))}</p>
            <h3>${escapeHtml(job.customerName)}</h3>
            <p>${escapeHtml(job.windowLabel)}</p>
            <p>${escapeHtml(tech?.name ?? job.techId)} · ${escapeHtml(formatPhone(job.phone))}</p>
            <p class="muted">${escapeHtml(job.address)}</p>
          </article>`;
        })
        .join("");
      return `<section><h2>${escapeHtml(status)}</h2>${cards || `<p class="empty">None</p>`}</section>`;
    })
    .join("")}</div>`;
}

function callsHtml(base: string, calls: CallRecord[], query: string): string {
  const rows = calls
    .map(
      (call) => `<tr>
        <td><a href="${base}/calls/${escapeHtml(call.id)}">${escapeHtml(formatStamp(call.startedAt, ZONE))}</a></td>
        <td><a href="${base}/calls/${escapeHtml(call.id)}">${escapeHtml(call.callerName || call.callerNumber || "Unknown")}</a>${call.afterHours ? `<span class="tag">After hours</span>` : ""}</td>
        <td><span class="pill ${escapeHtml(call.outcome)}">${escapeHtml(outcomeLabel(call.outcome))}</span></td>
        <td>${escapeHtml(call.summary || "No summary yet")}</td>
      </tr>`,
    )
    .join("");
  return `<div class="page-head">
      <h1>Calls</h1>
      <form method="get" action="${base}/calls" role="search">
        <label for="q">Search</label>
        <input id="q" name="q" value="${escapeHtml(query)}" placeholder="Name, number, outcome">
        <button type="submit">Search</button>
      </form>
    </div>
    ${
      calls.length
        ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Caller</th><th>Outcome</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="empty">${query ? "No calls match that search." : "No calls yet."}</p>`
    }`;
}

function messagesHtml(base: string, messages: SmsMessage[]): string {
  const rows = messages
    .map(
      (message) => `<article class="sms">
        <p class="kicker">${escapeHtml(message.kind)} · ${escapeHtml(message.status)} · ${escapeHtml(message.provider)}</p>
        <h3>To ${escapeHtml(formatPhone(message.toNumber))}</h3>
        <p>${escapeHtml(message.body)}</p>
        <p class="muted">${escapeHtml(formatStamp(message.createdAt, ZONE))}</p>
      </article>`,
    )
    .join("");
  return `<div class="page-head">
      <h1>Demo texts</h1>
      <p>The mock provider keeps every message here. A real provider would implement the same <code>SmsProvider</code> interface.</p>
    </div>
    <form class="missed" method="post" action="${base}/demo/missed-call">
      <h2>Simulate a missed call</h2>
      <label for="name">Name</label>
      <input id="name" name="name" value="Riley Cho" required>
      <label for="phone">Callback number</label>
      <input id="phone" name="phone" value="218-555-0194" required>
      <button type="submit">Simulate missed call</button>
    </form>
    ${messages.length ? `<div class="sms-list">${rows}</div>` : `<p class="empty">No texts yet.</p>`}`;
}

function customersHtml(customers: Customer[], jobs: JobRecord[]): string {
  if (customers.length === 0) return `<p class="empty">No customers yet.</p>`;
  const rows = customers
    .map((customer) => {
      const open = jobs.filter((job) => job.customerId === customer.id && (job.status === "scheduled" || job.status === "dispatched")).length;
      return `<tr><td>${escapeHtml(customer.name)}</td><td>${escapeHtml(formatPhone(customer.phone))}</td><td>${escapeHtml(customer.address)}</td><td>${open}</td></tr>`;
    })
    .join("");
  return `<h1>Customers</h1><div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Open jobs</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function tabTitle(tab: string): string {
  if (tab === "board") return "Job board";
  if (tab === "calls") return "Calls";
  if (tab === "messages") return "Texts";
  return "Customers";
}

function onCallDays(days: number[]): string {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day) => names[day] ?? "").filter(Boolean).join(" ");
}
