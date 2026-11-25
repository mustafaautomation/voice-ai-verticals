import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { phoneDigits } from "../../platform/phone.js";
import type { SmsProvider } from "../../sms/provider.js";
import type { CallOutcome } from "../../store/calls.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { CLINIC, providerById, visitLabel, type VisitType } from "./brand.js";
import { isDeskOpen } from "./schedule.js";
import { refillSms, textBackSms, visitSms, missedCallReason } from "./messages.js";
import { looksLikeSecret, maskPhone, normalizeDob } from "./privacy.js";
import { isClinicTool, toolArgSchemas, type ClinicToolName } from "./schemas.js";
import { ClinicStore, publicPatient, type PatientRecord } from "./store.js";
import { triageSymptoms } from "./triage.js";

export type ClinicToolContext = {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
};

const THIRD_PARTY =
  "I can only discuss visits with the patient. I can't share appointment details with someone else on this demo line.";

export async function executeClinicTool(name: string, args: Record<string, unknown>, ctx: ClinicToolContext): Promise<unknown> {
  if (!isClinicTool(name)) return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  const parsed = toolArgSchemas[name].safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_arguments",
      message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join("; "),
    };
  }
  try {
    return await runTool(name, parsed.data as never, ctx);
  } catch {
    return { ok: false, code: "tool_error", message: "I cannot reach the schedule right now. I can transfer you to the desk." };
  }
}

async function runTool(name: ClinicToolName, args: Record<string, unknown>, ctx: ClinicToolContext): Promise<unknown> {
  switch (name) {
    case "verify_identity":
      return verify(ctx, args as never);
    case "triage_symptoms":
      return triageSymptoms((args as { description: string }).description);
    case "check_slots":
      return check(ctx, args as never);
    case "book_visit":
      return book(ctx, args as never);
    case "reschedule_visit":
      return reschedule(ctx, args as never);
    case "cancel_visit":
      return cancel(ctx, args as never);
    case "capture_insurance":
      return insurance(ctx, args as never);
    case "request_refill":
      return refill(ctx, args as never);
    case "transfer_to_nurse":
      return nurse(ctx, args as { reason: string; description: string });
    case "transfer_to_human":
      return desk(ctx, (args as { reason: string }).reason);
    case "send_text_back":
      return textBack(ctx, args as { phone: string });
    default:
      return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  }
}

function verify(ctx: ClinicToolContext, args: { name: string; dob: string; phone?: string; relationship: "self" | "other" }) {
  const store = new ClinicStore(ctx.db);
  if (args.relationship !== "self") {
    store.audit("verify_identity", null, false, "Third party refused. No chart opened.", ctx.now);
    return { ok: true, verified: false, code: "third_party", message: THIRD_PARTY };
  }
  if (!normalizeDob(args.dob)) {
    store.audit("verify_identity", null, false, "Date of birth was not a valid date.", ctx.now);
    return { ok: true, verified: false, code: "invalid_dob", message: "I need a date of birth as month, day, and year." };
  }
  const patient = store.findByIdentity(args.name, args.dob);
  if (!patient) {
    store.audit("verify_identity", null, false, "Name and date of birth did not match a patient.", ctx.now);
    return {
      ok: true,
      verified: false,
      code: "no_match",
      message: "Those details do not match a patient on file. I can't share appointment information. I can still book a new-patient visit.",
    };
  }
  const visits = store.forPatient(patient.id).map((visit) => publicVisit(visit));
  store.audit("verify_identity", patient.id, true, `Verified ${patient.name}. Open visits: ${visits.length}.`, ctx.now);
  return {
    ok: true,
    verified: true,
    patient: publicPatient(patient),
    appointments: visits,
    message: visits.length
      ? `${patient.name} is verified. Open visits: ${visits.map((visit) => `${visit.id} ${visit.label}`).join("; ")}.`
      : `${patient.name} is verified. No open visits.`,
  };
}

function check(ctx: ClinicToolContext, args: { visitType: VisitType; date?: string; days?: number; providerId?: string }) {
  const store = new ClinicStore(ctx.db);
  const listed = store.slots(ctx.now, args);
  store.audit("check_slots", args.providerId ?? null, listed.ok, listed.ok ? listed.message : listed.message, ctx.now);
  if (!listed.ok) return { ok: false, code: listed.code, message: listed.message };
  return { ok: true, deskOpen: isDeskOpen(ctx.now), slots: listed.slots, message: listed.message };
}

async function book(ctx: ClinicToolContext, args: {
  name: string;
  dob: string;
  phone: string;
  relationship: "self" | "other";
  visitType: VisitType;
  start: string;
  providerId: string;
  reason: string;
}) {
  const store = new ClinicStore(ctx.db);
  if (args.relationship !== "self") {
    store.audit("book_visit", null, false, "Third party refused.", ctx.now);
    return { ok: false, code: "third_party", message: THIRD_PARTY };
  }
  const triage = triageSymptoms(args.reason);
  if (triage.channel === "911" || triage.channel === "988") {
    store.audit("book_visit", null, false, `Booking refused: ${triage.channel}.`, ctx.now);
    return { ok: false, code: triage.channel === "911" ? "emergency" : "crisis", message: triage.callerScript };
  }
  if (phoneDigits(args.phone).length < 10) {
    return { ok: false, code: "invalid_arguments", message: "Ask for a 10-digit callback number. Use a 555 number in this demo." };
  }
  let patient = store.findByIdentity(args.name, args.dob);
  if (!patient && args.visitType !== "new_patient") {
    store.audit("book_visit", null, false, "Identity did not match. Visit not booked.", ctx.now);
    return { ok: false, code: "not_verified", message: "I have to match the name and date of birth before booking that visit type." };
  }
  if (!patient) {
    if (!normalizeDob(args.dob)) return { ok: false, code: "invalid_dob", message: "I need a valid date of birth." };
    patient = store.insertPatient({ name: args.name, dob: args.dob, phone: args.phone, pcpId: args.providerId });
    store.audit("create_patient", patient.id, true, "New demo patient created for a new-patient visit. No real PHI.", ctx.now);
  }
  const booked = store.book({
    patientId: patient.id,
    visitType: args.visitType,
    providerId: args.providerId,
    start: args.start,
    reason: args.reason,
    sourceCallId: ctx.callRowId,
    now: ctx.now,
  });
  if (!booked.ok) {
    store.audit("book_visit", patient.id, false, booked.message, ctx.now);
    return { ok: false, code: booked.code, message: booked.message };
  }
  const provider = providerById(booked.appointment.providerId);
  await ctx.sms.send({
    verticalId: "clinic",
    kind: "confirmation",
    to: patient.phone,
    from: CLINIC.phoneE164,
    body: visitSms({ name: patient.name, label: visitLabel(args.visitType), when: publicVisit(booked.appointment).label }),
    relatedType: "visit",
    relatedId: booked.appointment.id,
  });
  store.audit("book_visit", patient.id, true, `Booked ${args.visitType} ${booked.appointment.id} with ${provider?.name ?? "a clinician"}.`, ctx.now);
  return {
    ok: true,
    visit: { ...publicVisit(booked.appointment), patientName: patient.name, phoneMasked: maskPhone(patient.phone) },
    message: `Booked ${visitLabel(args.visitType)} ${publicVisit(booked.appointment).label}.`,
  };
}

async function reschedule(ctx: ClinicToolContext, args: {
  name: string;
  dob: string;
  relationship: "self" | "other";
  appointmentId: string;
  start: string;
  providerId?: string;
}) {
  const owned = ownVisit(ctx, args, "reschedule_visit");
  if (!owned.ok) return owned;
  const moved = new ClinicStore(ctx.db).reschedule({ id: args.appointmentId, start: args.start, providerId: args.providerId, now: ctx.now });
  if (!moved.ok) {
    owned.store.audit("reschedule_visit", owned.patient.id, false, moved.message, ctx.now);
    return { ok: false, code: moved.code, message: moved.message };
  }
  await ctx.sms.send({
    verticalId: "clinic",
    kind: "confirmation",
    to: owned.patient.phone,
    from: CLINIC.phoneE164,
    body: `${CLINIC.name} (demo): visit ${moved.appointment.id} moved to ${publicVisit(moved.appointment).label}. Fictional clinic.`,
    relatedType: "visit",
    relatedId: moved.appointment.id,
  });
  owned.store.audit("reschedule_visit", owned.patient.id, true, `Moved ${moved.appointment.id}.`, ctx.now);
  return { ok: true, visit: publicVisit(moved.appointment), message: `Moved to ${publicVisit(moved.appointment).label}.` };
}

async function cancel(ctx: ClinicToolContext, args: {
  name: string;
  dob: string;
  relationship: "self" | "other";
  appointmentId: string;
  reason?: string;
}) {
  const owned = ownVisit(ctx, args, "cancel_visit");
  if (!owned.ok) return owned;
  const cancelled = owned.store.cancel({ id: args.appointmentId, now: ctx.now });
  if (!cancelled.ok) {
    owned.store.audit("cancel_visit", owned.patient.id, false, cancelled.message, ctx.now);
    return { ok: false, code: cancelled.code, message: cancelled.message };
  }
  await ctx.sms.send({
    verticalId: "clinic",
    kind: "confirmation",
    to: owned.patient.phone,
    from: CLINIC.phoneE164,
    body: `${CLINIC.name} (demo): visit ${cancelled.appointment.id} is cancelled. Fictional clinic.`,
    relatedType: "visit",
    relatedId: cancelled.appointment.id,
  });
  owned.store.audit("cancel_visit", owned.patient.id, true, `Cancelled ${cancelled.appointment.id}.`, ctx.now);
  return { ok: true, visit: publicVisit(cancelled.appointment), message: `Cancelled visit ${cancelled.appointment.id}.` };
}

function insurance(ctx: ClinicToolContext, args: {
  name: string;
  dob: string;
  relationship: "self" | "other";
  payer: string;
  memberId: string;
}) {
  const owned = ownPatient(ctx, args, "capture_insurance");
  if (!owned.ok) return owned;
  if (looksLikeSecret(args.memberId)) {
    owned.store.audit("capture_insurance", owned.patient.id, false, "Rejected a number that looked like an SSN or card.", ctx.now);
    return { ok: false, code: "sensitive_number", message: "Don't read a Social Security number or a card number. A mock member id like LM-20441 is enough." };
  }
  owned.store.setInsurance(owned.patient.id, args.payer, args.memberId);
  owned.store.audit("capture_insurance", owned.patient.id, true, `Stored payer ${args.payer}. Member id masked.`, ctx.now);
  return { ok: true, payer: args.payer, memberMasked: `••••${args.memberId.slice(-4)}`, message: `Noted ${args.payer}. I stored only a mock member id.` };
}

async function refill(ctx: ClinicToolContext, args: {
  name: string;
  dob: string;
  phone: string;
  relationship: "self" | "other";
  medication: string;
  pharmacy: string;
}) {
  const owned = ownPatient(ctx, args, "request_refill");
  if (!owned.ok) return owned;
  const row = owned.store.insertRefill({ patientId: owned.patient.id, medication: args.medication, pharmacy: args.pharmacy, now: ctx.now });
  await ctx.sms.send({
    verticalId: "clinic",
    kind: "refill",
    to: CLINIC.nurseE164,
    from: CLINIC.phoneE164,
    body: refillSms({ name: owned.patient.name, medication: args.medication, pharmacy: args.pharmacy }),
    relatedType: "refill",
    relatedId: row.id,
  });
  owned.store.audit("request_refill", owned.patient.id, true, `Refill queued ${row.id}. No dosing advice given.`, ctx.now);
  return {
    ok: true,
    refillId: row.id,
    message: `I sent a refill request for ${args.medication} to the nurse queue. I can't confirm the dose or whether it will be approved. The pharmacy on the request is ${args.pharmacy}.`,
  };
}

function nurse(ctx: ClinicToolContext, args: { reason: string; description: string }) {
  const store = new ClinicStore(ctx.db);
  const triage = triageSymptoms(args.description);
  if (triage.channel === "911" || triage.channel === "988") {
    store.audit("transfer_to_nurse", null, false, `Nurse transfer refused: ${triage.channel}.`, ctx.now);
    return { ok: false, code: triage.channel === "911" ? "emergency" : "crisis", message: triage.callerScript };
  }
  store.audit("transfer_to_nurse", null, true, "Warm transfer to the fictional nurse line.", ctx.now);
  const closed = !isDeskOpen(ctx.now);
  return {
    ok: true,
    transfer: true,
    destination: CLINIC.nurseE164,
    afterHours: closed,
    message: closed
      ? `The desk is closed. Warm transfer to the triage nurse at ${CLINIC.nurseDisplay}. This demo does not place the call.`
      : `Warm transfer to the triage nurse at ${CLINIC.nurseDisplay}. This demo does not place the call. Reason: ${args.reason}.`,
  };
}

function desk(ctx: ClinicToolContext, reason: string) {
  const store = new ClinicStore(ctx.db);
  const closed = !isDeskOpen(ctx.now);
  store.audit("transfer_to_human", null, true, closed ? "Desk closed." : "Desk transfer.", ctx.now);
  return {
    ok: true,
    transfer: true,
    destination: closed ? CLINIC.nurseE164 : CLINIC.phoneE164,
    afterHours: closed,
    reason,
    message: closed
      ? `The desk is closed. Urgent symptoms can go to the nurse line ${CLINIC.nurseDisplay}. This demo does not place the call.`
      : `Transfer to the front desk at ${CLINIC.phoneDisplay}. This demo does not place the call.`,
  };
}

async function textBack(ctx: ClinicToolContext, args: { phone: string }) {
  if (phoneDigits(args.phone).length < 10) {
    return { ok: false, code: "invalid_arguments", message: "Ask for a 10-digit number before texting." };
  }
  const sent = await ctx.sms.send({
    verticalId: "clinic",
    kind: "text_back",
    to: args.phone,
    from: CLINIC.phoneE164,
    body: textBackSms(),
    relatedType: "call",
    relatedId: ctx.callRowId ?? undefined,
  });
  new ClinicStore(ctx.db).audit("send_text_back", null, true, "Demo text-back queued.", ctx.now);
  return { ok: true, smsId: sent.id, message: "Text queued in the demo inbox. Nothing was sent to a real phone." };
}

function ownPatient(
  ctx: ClinicToolContext,
  args: { name: string; dob: string; relationship: "self" | "other" },
  action: string,
): { ok: true; store: ClinicStore; patient: PatientRecord } | { ok: false; code: string; message: string } {
  const store = new ClinicStore(ctx.db);
  if (args.relationship !== "self") {
    store.audit(action, null, false, "Third party refused.", ctx.now);
    return { ok: false, code: "third_party", message: THIRD_PARTY };
  }
  const patient = store.findByIdentity(args.name, args.dob);
  if (!patient) {
    store.audit(action, null, false, "Identity did not match.", ctx.now);
    return { ok: false, code: "not_verified", message: "Those details do not match a patient. I can't open the chart." };
  }
  return { ok: true, store, patient };
}

function ownVisit(
  ctx: ClinicToolContext,
  args: { name: string; dob: string; relationship: "self" | "other"; appointmentId: string },
  action: string,
): { ok: true; store: ClinicStore; patient: PatientRecord } | { ok: false; code: string; message: string } {
  const owned = ownPatient(ctx, args, action);
  if (!owned.ok) return owned;
  const visit = owned.store.getAppointment(args.appointmentId);
  if (!visit || visit.patientId !== owned.patient.id) {
    owned.store.audit(action, owned.patient.id, false, "Visit was not on this patient's chart.", ctx.now);
    return { ok: false, code: "not_found", message: "I can't find that visit on the verified chart." };
  }
  return owned;
}

function publicVisit(visit: {
  id: string;
  visitType: string;
  providerId: string;
  startsAt: string;
  status: string;
}): { id: string; visitType: string; status: string; providerName: string; label: string } {
  const provider = providerById(visit.providerId);
  const local = DateTime.fromISO(visit.startsAt, { zone: "utc" }).setZone(CLINIC.timezone);
  const when = local.isValid ? local.toFormat("ccc LLL d, h:mm a") + ` ${CLINIC.tzLabel}` : visit.startsAt;
  return {
    id: visit.id,
    visitType: visit.visitType,
    status: visit.status,
    providerName: provider?.name ?? visit.providerId,
    label: `${when} · ${provider?.name ?? "clinician"} · ${visitLabel(visit.visitType)}`,
  };
}

export async function maybeClinicTextBack(
  ctx: ClinicToolContext,
  call: { id: string; callerNumber: string | null; outcome: string },
  endedReason: string | null,
): Promise<boolean> {
  if (!missedCallReason(endedReason) || !call.callerNumber) return false;
  if (call.outcome === "booked" || call.outcome === "rescheduled" || call.outcome === "escalated") return false;
  if (new SmsStore(ctx.db).hasKind("clinic", "text_back", call.id)) return false;
  await ctx.sms.send({
    verticalId: "clinic",
    kind: "text_back",
    to: call.callerNumber,
    from: CLINIC.phoneE164,
    body: textBackSms(),
    relatedType: "call",
    relatedId: call.id,
  });
  new ClinicStore(ctx.db).audit("missed_call_text", null, true, "Missed-call text queued.", ctx.now);
  return true;
}

export async function simulateClinicMissedCall(
  ctx: ClinicToolContext,
  input: { name: string; phone: string },
): Promise<{ ok: true; callId: string } | { ok: false; message: string }> {
  if (phoneDigits(input.phone).length < 10) return { ok: false, message: "Use a 10-digit 555 number." };
  const call = new CallStore(ctx.db).ensure({
    verticalId: "clinic",
    vapiCallId: `clinic_missed_${ctx.now.getTime()}_${phoneDigits(input.phone)}`,
    callerNumber: input.phone,
    callerName: input.name || "Unknown caller",
    afterHours: !isDeskOpen(ctx.now),
    now: ctx.now,
    outcome: "text_back",
    status: "completed",
    summary: "Missed call. Demo text-back queued. No PHI in this summary.",
    transcript: "Caller did not connect.",
    endedReason: "customer-did-not-answer",
  });
  await maybeClinicTextBack(ctx, call, "customer-did-not-answer");
  return { ok: true, callId: call.id };
}

export function clinicOutcome(name: string, result: unknown): CallOutcome | null {
  const body = result as { ok?: boolean; code?: string; verified?: boolean; channel?: string };
  if (name === "book_visit" && body.ok) return "booked";
  if (name === "reschedule_visit" && body.ok) return "rescheduled";
  if (name === "cancel_visit" && body.ok) return "cancelled";
  if (name === "request_refill" && body.ok) return "refill";
  if ((name === "transfer_to_nurse" || name === "transfer_to_human") && body.ok) return "transferred";
  if (name === "send_text_back" && body.ok) return "text_back";
  if (name === "book_visit" && body.code === "slot_taken") return "slot_unavailable";
  if (name === "triage_symptoms" && (body.channel === "911" || body.channel === "988")) return "escalated";
  if (name === "triage_symptoms" && body.channel === "decline") return "off_topic";
  if ((name === "verify_identity" || name === "book_visit") && body.code === "third_party") return "refused";
  return null;
}

export function clinicCaller(name: string, args: Record<string, unknown>, result: unknown): { name?: string; phone?: string } {
  const body = result as { ok?: boolean; visit?: { patientName?: string } };
  if (typeof args.name === "string") return { name: args.name, phone: typeof args.phone === "string" ? args.phone : undefined };
  if (body.ok && body.visit?.patientName) return { name: body.visit.patientName };
  return {};
}
