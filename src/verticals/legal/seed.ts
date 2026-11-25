import type { SqliteDatabase } from "../../db/database.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { FIRM } from "./brand.js";
import { LegalStore } from "./store.js";

export function seedLegalDesk(db: SqliteDatabase): void {
  const matters = new LegalStore(db);
  if (matters.countMatters() > 0) return;
  const calls = new CallStore(db);
  const sms = new SmsStore(db);
  matters.insertParty({ id: "pty_maya", name: "Maya Chen", side: "client", matterLabel: "Employment, closed" });
  matters.insertParty({ id: "pty_north", name: "Northline Logistics", side: "adverse", matterLabel: "Employment, closed" });
  matters.insertParty({ id: "pty_andre", name: "Andre Brooks", side: "client", matterLabel: "Family, active" });
  matters.insertParty({ id: "pty_priya", name: "Priya Shah", side: "adverse", matterLabel: "Family, active" });

  const crash = matters.insertMatter({
    id: "mat_lena",
    callerName: "Lena Ortiz",
    phone: "3035550144",
    practice: "personal_injury",
    opposing: "Cedar Mile Transit",
    incidentDate: "2024-12-20",
    jurisdiction: "Denver, Colorado",
    summary: "Rear-end crash. Shoulder pain. Screening flag only, not a deadline opinion.",
    status: "priority",
    urgent: true,
    now: new Date("2026-11-20T16:00:00.000Z"),
  });
  const family = matters.insertMatter({
    id: "mat_owen",
    callerName: "Owen Blake",
    phone: "3035550155",
    practice: "family",
    opposing: "Riley Blake",
    incidentDate: "2026-10-01",
    jurisdiction: "Denver, Colorado",
    summary: "Divorce consult requested. No advice given.",
    status: "consult",
    urgent: false,
    now: new Date("2026-11-22T16:00:00.000Z"),
  });
  matters.insertConsult({
    id: "con_seed",
    matterId: family.id,
    attorneyId: "atty_hale",
    consultType: "free",
    startsAt: "2026-12-08T16:00:00.000Z",
    endsAt: "2026-12-08T16:30:00.000Z",
    now: new Date("2026-11-22T16:10:00.000Z"),
  });
  matters.insertMatter({
    id: "mat_chris",
    callerName: "Chris Nguyen",
    phone: "3035550177",
    practice: "criminal",
    opposing: "",
    incidentDate: "",
    jurisdiction: "Denver detention, demo",
    summary: "In-custody page. Case facts were not taken.",
    status: "urgent",
    urgent: true,
    now: new Date("2026-11-24T18:00:00.000Z"),
  });
  matters.audit("open_matter", crash.id, true, "Seeded priority personal-injury intake.", new Date("2026-11-20T16:00:00.000Z"));
  matters.audit("conflict_check", null, false, "A conflict hit was recorded without naming the other client.", new Date("2026-11-21T16:00:00.000Z"));

  const call = calls.ensure({
    id: "call_lena",
    verticalId: "legal",
    vapiCallId: "seed-legal-lena",
    callerName: "Lena Ortiz",
    callerNumber: "+13035550144",
    afterHours: false,
    now: new Date("2026-11-20T16:00:00.000Z"),
    outcome: "serviced",
    status: "completed",
    summary: "Personal injury intake. Screening flag. No legal advice.",
    transcript:
      "Agent: Quillmere Law, this is the intake desk. I can't give legal advice.\nCaller: I was hurt in a crash in December 2024.\nAgent: I opened a priority intake. A lawyer needs to call you back. This is not a deadline opinion.",
  });
  calls.saveToolCall({
    callRowId: call.id,
    toolCallId: "seed-open",
    name: "open_matter",
    arguments: { callerName: "Lena Ortiz", practice: "personal_injury" },
    result: { ok: true, urgent: true },
    now: new Date("2026-11-20T16:04:00.000Z"),
  });
  sms.insert({
    id: "sms_lena",
    provider: "mock",
    fromNumber: FIRM.phoneE164,
    status: "queued",
    createdAt: "2026-11-20T16:05:00.000Z",
    message: {
      verticalId: "legal",
      kind: "confirmation",
      to: "+13035550144",
      body: "Quillmere Law LLP (demo): intake summary for Lena Ortiz. Engagement link https://demo.quillmere.invalid/engage/mat_lena does not hire the firm.",
      relatedType: "matter",
      relatedId: crash.id,
    },
  });
}
