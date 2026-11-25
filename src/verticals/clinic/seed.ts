import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { toUtcIso } from "../../platform/time.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { CLINIC, providerById } from "./brand.js";
import { maskDob, maskMember, maskPhone, scrubText } from "./privacy.js";
import { ClinicStore } from "./store.js";

export function seedClinicIfEmpty(db: SqliteDatabase, now: Date): void {
  const clinic = new ClinicStore(db);
  if (clinic.countAppointments() > 0) return;
  const calls = new CallStore(db);
  const sms = new SmsStore(db);
  const monday = nextWeekday(now, 1, 2);
  const tuesday = monday.plus({ days: 1 });
  const atTime = (day: DateTime, minutes: number) =>
    toUtcIso(day.set({ hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0, millisecond: 0 }));
  const stamp = (hoursAgo: number) => toUtcIso(DateTime.fromJSDate(now, { zone: "utc" }).minus({ hours: hoursAgo }));

  const maya = clinic.insertPatient({
    id: "pat_maya",
    name: "Maya Chen",
    dob: "1984-03-14",
    phone: "608-555-0141",
    payer: "Lakeshore Mutual",
    memberId: "LM-20441",
    pcpId: "prov_solano",
    createdAt: stamp(80),
  });
  const andre = clinic.insertPatient({
    id: "pat_andre",
    name: "Andre Brooks",
    dob: "1972-11-02",
    phone: "608-555-0142",
    payer: "Northline Health",
    memberId: "NH-11820",
    pcpId: "prov_pell",
    createdAt: stamp(70),
  });
  clinic.insertPatient({
    id: "pat_priya",
    name: "Priya Shah",
    dob: "1991-07-19",
    phone: "608-555-0143",
    payer: "",
    memberId: "",
    pcpId: "prov_cho",
    createdAt: stamp(40),
  });

  const follow = clinic.insertAppointment({
    id: "vis_maya",
    patientId: maya.id,
    providerId: "prov_solano",
    visitType: "follow_up",
    startsAt: atTime(monday, 9 * 60),
    endsAt: atTime(monday, 9 * 60 + 20),
    reason: "Blood pressure follow-up",
    sourceCallId: "call_clinic_maya",
    createdAt: stamp(6),
  });
  clinic.insertAppointment({
    id: "vis_andre",
    patientId: andre.id,
    providerId: "prov_pell",
    visitType: "sick",
    startsAt: atTime(monday, 13 * 60),
    endsAt: atTime(monday, 13 * 60 + 20),
    reason: "Fever and ear pain",
    sourceCallId: "call_clinic_andre",
    createdAt: stamp(5),
  });
  clinic.insertAppointment({
    id: "vis_priya",
    patientId: "pat_priya",
    providerId: "prov_cho",
    visitType: "telehealth",
    startsAt: atTime(tuesday, 10 * 60),
    endsAt: atTime(tuesday, 10 * 60 + 20),
    reason: "Telehealth follow-up",
    createdAt: stamp(4),
  });

  calls.ensure({
    id: "call_clinic_maya",
    verticalId: "clinic",
    vapiCallId: "seed_clinic_maya",
    callerName: "Maya Chen",
    callerNumber: "+16085550141",
    afterHours: false,
    now: new Date(stamp(6)),
    outcome: "booked",
    status: "completed",
    summary: "Verified the caller and booked a follow-up. Demo chart only.",
    transcript:
      "Caller: This is Maya Chen. My date of birth is 1984-03-14 and my phone is 608-555-0141. I need a follow-up.\nReceptionist: You are verified. I booked a follow-up. I will not repeat the full date of birth on the board.",
  });
  calls.ensure({
    id: "call_clinic_911",
    verticalId: "clinic",
    vapiCallId: "seed_clinic_911",
    callerName: "Unknown caller",
    callerNumber: "+16085550190",
    afterHours: true,
    now: new Date(stamp(3)),
    outcome: "escalated",
    status: "completed",
    summary: "Chest pain. Caller told to call 911. No visit booked.",
    transcript: "Caller: I have crushing chest pain.\nReceptionist: Call 911 now. I will not book a visit.",
  });
  calls.ensure({
    id: "call_clinic_988",
    verticalId: "clinic",
    vapiCallId: "seed_clinic_988",
    callerName: "Unknown caller",
    callerNumber: null,
    afterHours: true,
    now: new Date(stamp(2)),
    outcome: "escalated",
    status: "completed",
    summary: "Crisis call routed to 988. No chart opened.",
    transcript: "Caller: I want to die.\nReceptionist: Call or text 988 now. If you are in immediate danger, call 911. I will not ask for a plan.",
  });

  sms.insert({
    id: "sms_clinic_maya",
    provider: "mock",
    fromNumber: CLINIC.phoneE164,
    status: "queued",
    createdAt: stamp(6),
    message: {
      verticalId: "clinic",
      kind: "confirmation",
      to: maya.phone,
      body: `${CLINIC.name} (demo): follow-up ${follow.id} with ${providerById("prov_solano")?.name}. Fictional clinic.`,
      relatedType: "visit",
      relatedId: follow.id,
    },
  });
  sms.insert({
    id: "sms_clinic_refill",
    provider: "mock",
    fromNumber: CLINIC.phoneE164,
    status: "queued",
    createdAt: stamp(5),
    message: {
      verticalId: "clinic",
      kind: "refill",
      to: CLINIC.nurseE164,
      body: `${CLINIC.name} nurse queue (demo): refill request for Maya C., medication noted, no dose advice.`,
      relatedType: "refill",
      relatedId: "rx_seed",
    },
  });
  clinic.insertRefill({ patientId: maya.id, medication: "lisinopril", pharmacy: "Quill Orchard Pharmacy", now: new Date(stamp(5)) });
  clinic.audit("verify_identity", maya.id, true, "Verified Maya Chen. Open visits: 1.", new Date(stamp(6)));
  clinic.audit("book_visit", maya.id, true, `Booked follow_up ${follow.id}.`, new Date(stamp(6)));
  clinic.audit("triage_symptoms", null, true, "Chest pain routed to 911. No chart opened.", new Date(stamp(3)));
}

function nextWeekday(now: Date, weekday: number, minDays: number): DateTime {
  let day = DateTime.fromJSDate(now, { zone: "utc" }).setZone(CLINIC.timezone).startOf("day").plus({ days: minDays });
  while (day.weekday !== weekday) day = day.plus({ days: 1 });
  return day;
}

export function maskedClinicTranscript(text: string | null): string {
  return scrubText(text || "No transcript stored.");
}

export function maskedDobForBoard(dob: string): string {
  return maskDob(dob);
}

export function maskedPhoneForBoard(phone: string): string {
  return maskPhone(phone);
}

export function maskedMemberForBoard(memberId: string): string {
  return memberId ? maskMember(memberId) : "none on file";
}
