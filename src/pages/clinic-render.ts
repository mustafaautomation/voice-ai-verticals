import { escapeHtml } from "../platform/html.js";
import { formatStamp } from "../platform/time.js";
import type { CallRecord, ToolCallRecord } from "../store/calls.js";
import type { SmsMessage } from "../store/sms.js";
import { CLINIC, PROVIDERS, providerById } from "../verticals/clinic/brand.js";
import { maskedClinicTranscript, maskedDobForBoard, maskedMemberForBoard, maskedPhoneForBoard } from "../verticals/clinic/seed.js";
import { scrubText } from "../verticals/clinic/privacy.js";
import type { AppointmentRecord, AuditRecord, PatientRecord, RefillRecord } from "../verticals/clinic/store.js";

const ZONE = CLINIC.timezone;

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
<body data-vertical="clinic" class="theme-clinic">
${body}
</body>
</html>`;
}

function clinicOutcome(outcome: string): string {
  const labels: Record<string, string> = {
    escalated: "911 / 988",
    refill: "Refill queued",
    refused: "Refused",
    booked: "Booked",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
    transferred: "Transferred",
    text_back: "Text queued",
    off_topic: "Declined",
    no_booking: "No booking",
    in_progress: "In progress",
    completed: "Completed",
  };
  return labels[outcome] ?? outcome;
}

export function renderClinicHome(base: string): string {
  const clinicians = PROVIDERS.map(
    (provider) => `<li><strong>${escapeHtml(provider.name)}</strong>, ${escapeHtml(provider.credential)} · ${escapeHtml(provider.focus)}</li>`,
  ).join("");
  return shell(
    `${CLINIC.name} · front desk`,
    "Talk to a fictional Madison primary-care front desk. It verifies identity, routes emergencies, and books visits. No real PHI.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}">
        <span class="mark clinic-mark" aria-hidden="true"></span>
        <span><strong>${escapeHtml(CLINIC.name)}</strong><small>${escapeHtml(CLINIC.city)}</small></span>
      </a>
      <nav>
        <a href="${base}/board">Schedule</a>
        <a href="${base}/calls">Calls</a>
        <a href="${base}/messages">Messages</a>
        <a href="${base}/patients">Patients</a>
        <a href="/platform">All verticals</a>
      </nav>
    </header>
    <p class="banner">${escapeHtml(CLINIC.disclaimer)}</p>
    <main>
      <section class="hero hvac-hero">
        <div>
          <p class="eyebrow">Primary and urgent care · fictional · no real PHI</p>
          <h1>Name and date of birth before any visit.</h1>
          <p class="lede">Lindenmere answers the phone for a made-up Madison clinic. Chest pain, stroke signs, trouble breathing, and anaphylaxis go to 911. Suicidal ideation goes to 988. Everything else is a sick visit, a nurse transfer, or a routine booking. The agent does not diagnose.</p>
          <ul class="facts">${CLINIC.hours.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        </div>
        <div class="console voice-stage" id="console" data-state="idle" data-role="Front desk">
          <button id="talk" class="talk orb-button" type="button" data-token-url="${base}/api/call-token" data-board-url="${base}/board" data-idle-label="Talk to the front desk" aria-label="Talk to the front desk">
            <span class="orb" id="orb" aria-hidden="true"></span>
            <span class="label">Talk to the front desk</span>
          </button>
          <p class="status" id="status" role="status" aria-live="polite">Microphone. Up to 3 demo calls a day, 4 minutes each. Use a made-up name and a 555 number.</p>
          <div class="call-controls" hidden><button type="button" id="mute">Mute</button></div>
          <div class="stage-panels">
            <ol class="transcript" id="transcript" aria-label="Live transcript"></ol>
            <ol class="tools" id="tools" aria-label="Tool calls"></ol>
          </div>
          <p class="sr-only" id="call-live" role="status" aria-live="polite"></p>
        </div>
      </section>
      <section class="danger" role="note">
        <h2>Emergencies are not visits</h2>
        <p>Call 911 for chest pain, one-sided face droop, arm weakness, slurred speech, severe trouble breathing, or a throat that is closing. Call or text 988 if you are thinking about suicide. This demo will not book those, and it will not ask for a plan.</p>
      </section>
      <section class="grid3">
        <article>
          <h2>Try saying</h2>
          <ul>
            <li>“I have crushing chest pain.”</li>
            <li>“I want to die.”</li>
            <li>“I’m Maya Chen, March 14, 1984. I need a follow-up.”</li>
            <li>“I’m her neighbor. When is Maya’s visit?”</li>
            <li>“Please refill lisinopril. I’m Maya Chen, 1984-03-14.”</li>
          </ul>
        </article>
        <article>
          <h2>The building</h2>
          <p>${escapeHtml(CLINIC.address)}. ${escapeHtml(CLINIC.addressNote)}</p>
          <p>${escapeHtml(CLINIC.serviceArea.join(", "))}.</p>
          <p>Desk ${escapeHtml(CLINIC.phoneDisplay)} · nurse ${escapeHtml(CLINIC.nurseDisplay)}</p>
        </article>
        <article>
          <h2>Clinicians</h2>
          <ul>${clinicians}</ul>
        </article>
      </section>
    </main>
    <footer><p>${escapeHtml(CLINIC.disclaimer)}</p></footer>
    <script type="module" src="/assets/orb.js"></script>
    <script type="module" src="/assets/talk.js"></script>`,
  );
}

export type ClinicDesk = {
  visits: AppointmentRecord[];
  calls: CallRecord[];
  messages: SmsMessage[];
  patients: PatientRecord[];
  refills: RefillRecord[];
  audit: AuditRecord[];
};

export function renderClinicDesk(
  base: string,
  tab: "board" | "calls" | "messages" | "patients" | "audit",
  data: ClinicDesk,
  query = "",
  notice = "",
): string {
  const open = data.visits.filter((visit) => visit.status === "scheduled").length;
  const tabs = [
    ["board", "Schedule"],
    ["calls", "Calls"],
    ["messages", "Messages"],
    ["patients", "Patients"],
    ["audit", "Audit"],
  ]
    .map(([id, label]) => `<a href="${base}/${id}" class="${tab === id ? "active" : ""}">${label}</a>`)
    .join("");
  return shell(
    `${tab} · ${CLINIC.name}`,
    "Fictional front-desk board. Dates of birth and phone numbers are masked.",
    `<header class="bar">
      <a class="brand" href="${base || "/"}">
        <span class="mark clinic-mark" aria-hidden="true"></span>
        <span><strong>${escapeHtml(CLINIC.name)}</strong><small>Front desk · fictional · no real PHI</small></span>
      </a>
      <nav><a href="${base || "/"}">Talk</a><a href="/platform">All verticals</a></nav>
    </header>
    <p class="banner">${escapeHtml(CLINIC.disclaimer)}</p>
    <main class="desk">
      <section class="kpis" aria-label="Board">
        <article><span>Open visits</span><strong>${open}</strong></article>
        <article><span>Patients on file</span><strong>${data.patients.length}</strong></article>
        <article><span>Refill queue</span><strong>${data.refills.length}</strong></article>
        <article><span>Audit events</span><strong>${data.audit.length}</strong></article>
      </section>
      <nav class="tabs" aria-label="Desk sections">${tabs}</nav>
      ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
      ${tab === "board" ? boardHtml(data.visits) : ""}
      ${tab === "calls" ? callsHtml(base, data.calls, query) : ""}
      ${tab === "messages" ? messagesHtml(base, data.messages, data.refills) : ""}
      ${tab === "patients" ? patientsHtml(data.patients, data.visits) : ""}
      ${tab === "audit" ? auditHtml(data.audit) : ""}
    </main>`,
  );
}

export function renderClinicCall(base: string, call: CallRecord, tools: ToolCallRecord[]): string {
  const toolsHtml = tools
    .map((tool) => `<li><code>${escapeHtml(tool.name)}</code><pre>${escapeHtml(scrubTool(tool.result))}</pre></li>`)
    .join("");
  return shell(
    `${call.callerName || "Call"} · ${CLINIC.name}`,
    "Call detail with masked identifiers.",
    `<header class="bar"><a class="brand" href="${base}/calls"><span class="mark clinic-mark" aria-hidden="true"></span><span><strong>Back to calls</strong><small>${escapeHtml(CLINIC.name)}</small></span></a></header>
    <main class="desk">
      <p class="pill ${escapeHtml(call.outcome)}">${escapeHtml(clinicOutcome(call.outcome))}</p>
      <h1>${escapeHtml(call.callerName || "Unknown caller")}</h1>
      <p>${escapeHtml(maskedPhoneForBoard(call.callerNumber || ""))} · ${escapeHtml(formatStamp(call.startedAt, ZONE))}</p>
      <p class="summary">${escapeHtml(call.summary || "No summary yet")}</p>
      <h2>Transcript</h2>
      <pre class="transcript-block">${escapeHtml(maskedClinicTranscript(call.transcript))}</pre>
      <h2>Tools</h2>
      ${tools.length ? `<ol class="tools">${toolsHtml}</ol>` : `<p class="empty">No tools on this call.</p>`}
    </main>`,
  );
}

function boardHtml(visits: AppointmentRecord[]): string {
  if (visits.length === 0) return `<p class="empty">No visits yet.</p>`;
  const columns = PROVIDERS.map((provider) => {
    const rows = visits.filter((visit) => visit.providerId === provider.id && visit.status === "scheduled");
    const cards = rows
      .map(
        (visit) => `<article class="job">
          <p class="kicker">${escapeHtml(visit.visitType.replaceAll("_", " "))}</p>
          <h3>${escapeHtml(visit.patientName)}</h3>
          <p>${escapeHtml(formatStamp(visit.startsAt, ZONE))} ${CLINIC.tzLabel}</p>
          <p class="muted">${escapeHtml(visit.reason)}</p>
        </article>`,
      )
      .join("");
    return `<section><h2>${escapeHtml(provider.name)}</h2>${cards || `<p class="empty">No open visits</p>`}</section>`;
  }).join("");
  return `<div class="kanban clinic-board">${columns}</div>`;
}

function callsHtml(base: string, calls: CallRecord[], query: string): string {
  const rows = calls
    .map(
      (call) => `<tr>
        <td><a href="${base}/calls/${escapeHtml(call.id)}">${escapeHtml(formatStamp(call.startedAt, ZONE))}</a></td>
        <td><a href="${base}/calls/${escapeHtml(call.id)}">${escapeHtml(call.callerName || "Unknown")}</a></td>
        <td>${escapeHtml(maskedPhoneForBoard(call.callerNumber || ""))}</td>
        <td><span class="pill ${escapeHtml(call.outcome)}">${escapeHtml(clinicOutcome(call.outcome))}</span></td>
        <td>${escapeHtml(call.summary || "")}</td>
      </tr>`,
    )
    .join("");
  return `<div class="page-head"><h1>Calls</h1>
      <form method="get" action="${base}/calls" role="search">
        <label for="q">Search</label>
        <input id="q" name="q" value="${escapeHtml(query)}" placeholder="Name or outcome">
        <button type="submit">Search</button>
      </form>
    </div>
    ${
      calls.length
        ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Caller</th><th>Phone</th><th>Outcome</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<p class="empty">${query ? "No calls match that search." : "No calls yet."}</p>`
    }`;
}

function messagesHtml(base: string, messages: SmsMessage[], refills: RefillRecord[]): string {
  const queue = refills
    .map(
      (refill) => `<article class="sms"><p class="kicker">Nurse queue · ${escapeHtml(refill.status)}</p><h3>${escapeHtml(refill.patientName)}</h3><p>${escapeHtml(refill.medication)} · ${escapeHtml(refill.pharmacy)}</p><p class="muted">No dose is stored as advice. ${escapeHtml(formatStamp(refill.createdAt, ZONE))}</p></article>`,
    )
    .join("");
  const texts = messages
    .map(
      (message) => `<article class="sms"><p class="kicker">${escapeHtml(message.kind)} · ${escapeHtml(message.status)} · mock</p><h3>To ${escapeHtml(maskedPhoneForBoard(message.toNumber))}</h3><p>${escapeHtml(message.body)}</p></article>`,
    )
    .join("");
  return `<h1>Messages</h1>
    <p>Refill requests sit in the nurse queue. Texts stay in the mock inbox.</p>
    <form class="missed" method="post" action="${base}/demo/missed-call">
      <h2>Simulate a missed call</h2>
      <label for="name">Name</label>
      <input id="name" name="name" value="Riley Cho">
      <label for="phone">Callback number</label>
      <input id="phone" name="phone" value="608-555-0194" required>
      <button type="submit">Simulate missed call</button>
    </form>
    <div class="sms-list">${queue}${texts}</div>`;
}

function patientsHtml(patients: PatientRecord[], visits: AppointmentRecord[]): string {
  const rows = patients
    .map((patient) => {
      const open = visits.filter((visit) => visit.patientId === patient.id && visit.status === "scheduled").length;
      const pcp = providerById(patient.pcpId);
      return `<tr>
        <td>${escapeHtml(patient.name)}</td>
        <td>${escapeHtml(maskedDobForBoard(patient.dob))}</td>
        <td>${escapeHtml(maskedPhoneForBoard(patient.phone))}</td>
        <td>${escapeHtml(patient.payer || "none")}</td>
        <td>${escapeHtml(maskedMemberForBoard(patient.memberId))}</td>
        <td>${escapeHtml(pcp?.name ?? "")}</td>
        <td>${open}</td>
      </tr>`;
    })
    .join("");
  return `<h1>Patients</h1><p>Dates of birth show the year only. Member ids show the last four characters. This is demo data.</p>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Date of birth</th><th>Phone</th><th>Payer</th><th>Member</th><th>PCP</th><th>Open</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function auditHtml(events: AuditRecord[]): string {
  if (events.length === 0) return `<p class="empty">No tool access yet.</p>`;
  const rows = events
    .map(
      (event) => `<tr><td>${escapeHtml(formatStamp(event.createdAt, ZONE))}</td><td><code>${escapeHtml(event.action)}</code></td><td>${event.ok ? "allowed" : "refused"}</td><td>${escapeHtml(event.summary)}</td></tr>`,
    )
    .join("");
  return `<h1>Audit</h1><p>Each tool that touches a chart writes a line. The line does not store a date of birth or a member id.</p>
    <div class="table-wrap"><table><thead><tr><th>When</th><th>Tool</th><th>Result</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function scrubTool(result: unknown): string {
  return scrubText(JSON.stringify(result, null, 2));
}
