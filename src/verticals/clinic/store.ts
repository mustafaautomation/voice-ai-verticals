import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { isSqliteConstraint } from "../../db/database.js";
import { newId } from "../../platform/ids.js";
import { phoneDigits, toE164 } from "../../platform/phone.js";
import { toUtcIso } from "../../platform/time.js";
import { providerById, type VisitType } from "./brand.js";
import { maskDob, maskPhone, namesMatch, normalizeDob, normalizeName } from "./privacy.js";
import { canChange, listSlots, resolveSlot, type BusyRange } from "./schedule.js";

export type PatientRecord = {
  id: string;
  name: string;
  dob: string;
  phone: string;
  payer: string;
  memberId: string;
  pcpId: string;
  createdAt: string;
};

export type AppointmentRecord = {
  id: string;
  patientId: string;
  patientName: string;
  providerId: string;
  visitType: VisitType;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "cancelled" | "completed";
  reason: string;
  sourceCallId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RefillRecord = {
  id: string;
  patientId: string;
  patientName: string;
  medication: string;
  pharmacy: string;
  status: string;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  action: string;
  subjectId: string | null;
  ok: boolean;
  summary: string;
  createdAt: string;
};

type PatientRow = {
  id: string;
  name: string;
  dob: string;
  phone: string;
  payer: string;
  member_id: string;
  pcp_id: string;
  created_at: string;
};

function mapPatient(row: PatientRow): PatientRecord {
  return {
    id: row.id,
    name: row.name,
    dob: row.dob,
    phone: row.phone,
    payer: row.payer,
    memberId: row.member_id,
    pcpId: row.pcp_id,
    createdAt: row.created_at,
  };
}

export class ClinicStore {
  constructor(private readonly db: SqliteDatabase) {}

  countAppointments(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM clinic_appointments").get() as { n: number };
    return row.n;
  }

  listPatients(): PatientRecord[] {
    return (this.db.prepare("SELECT * FROM clinic_patients ORDER BY name COLLATE NOCASE").all() as PatientRow[]).map(mapPatient);
  }

  getPatient(id: string): PatientRecord | null {
    const row = this.db.prepare("SELECT * FROM clinic_patients WHERE id = ?").get(id) as PatientRow | undefined;
    return row ? mapPatient(row) : null;
  }

  findByIdentity(name: string, dob: string): PatientRecord | null {
    const normalized = normalizeDob(dob);
    if (!normalized) return null;
    const rows = this.db.prepare("SELECT * FROM clinic_patients WHERE dob = ?").all(normalized) as PatientRow[];
    return rows.map(mapPatient).find((patient) => namesMatch(patient.name, name)) ?? null;
  }

  insertPatient(input: {
    id?: string;
    name: string;
    dob: string;
    phone: string;
    payer?: string;
    memberId?: string;
    pcpId?: string;
    createdAt?: string;
  }): PatientRecord {
    const dob = normalizeDob(input.dob);
    if (!dob) throw new Error("Invalid date of birth");
    const createdAt = input.createdAt ?? toUtcIso(DateTime.utc());
    const id = input.id ?? newId("pat");
    const phone = toE164(input.phone);
    this.db
      .prepare(
        `INSERT INTO clinic_patients (id, name, dob, phone, phone_digits, payer, member_id, pcp_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name.trim(), dob, phone, phoneDigits(phone), input.payer ?? "", input.memberId ?? "", input.pcpId ?? "", createdAt);
    const patient = this.getPatient(id);
    if (!patient) throw new Error("Patient insert failed");
    return patient;
  }

  setInsurance(id: string, payer: string, memberId: string): void {
    this.db.prepare("UPDATE clinic_patients SET payer = ?, member_id = ? WHERE id = ?").run(payer, memberId, id);
  }

  listAppointments(): AppointmentRecord[] {
    const rows = this.db
      .prepare(
        `SELECT a.*, p.name AS patient_name FROM clinic_appointments a
         JOIN clinic_patients p ON p.id = a.patient_id
         ORDER BY a.starts_at`,
      )
      .all() as Array<Record<string, string | null>>;
    return rows.map(mapAppointment);
  }

  openCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM clinic_appointments WHERE status = 'scheduled'").get() as { n: number };
    return row.n;
  }

  forPatient(patientId: string): AppointmentRecord[] {
    return this.listAppointments().filter((appointment) => appointment.patientId === patientId && appointment.status === "scheduled");
  }

  getAppointment(id: string): AppointmentRecord | null {
    return this.listAppointments().find((appointment) => appointment.id === id) ?? null;
  }

  busy(ignoreId?: string): BusyRange[] {
    return this.listAppointments()
      .filter((appointment) => appointment.status === "scheduled" && appointment.id !== ignoreId)
      .map((appointment) => ({
        id: appointment.id,
        providerId: appointment.providerId,
        start: appointment.startsAt,
        end: appointment.endsAt,
      }));
  }

  insertAppointment(input: {
    id?: string;
    patientId: string;
    providerId: string;
    visitType: VisitType;
    startsAt: string;
    endsAt: string;
    status?: "scheduled" | "cancelled" | "completed";
    reason: string;
    sourceCallId?: string | null;
    createdAt?: string;
  }): AppointmentRecord {
    const id = input.id ?? newId("vis");
    const stamp = input.createdAt ?? toUtcIso(DateTime.utc());
    this.db
      .prepare(
        `INSERT INTO clinic_appointments (
          id, patient_id, provider_id, visit_type, starts_at, ends_at, status, reason, source_call_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.patientId,
        input.providerId,
        input.visitType,
        input.startsAt,
        input.endsAt,
        input.status ?? "scheduled",
        input.reason,
        input.sourceCallId ?? null,
        stamp,
        stamp,
      );
    const appointment = this.getAppointment(id);
    if (!appointment) throw new Error("Visit insert failed");
    return appointment;
  }

  book(input: {
    patientId: string;
    visitType: VisitType;
    providerId: string;
    start: string;
    reason: string;
    sourceCallId: string | null;
    now: Date;
  }): { ok: true; appointment: AppointmentRecord } | { ok: false; code: string; message: string } {
    const run = this.db.transaction(() => {
      const resolved = resolveSlot(input.now, this.busy(), input);
      if (!resolved.ok) return resolved;
      try {
        const appointment = this.insertAppointment({
          patientId: input.patientId,
          providerId: resolved.slot.providerId,
          visitType: input.visitType,
          startsAt: resolved.slot.start,
          endsAt: resolved.slot.end,
          reason: input.reason,
          sourceCallId: input.sourceCallId,
          createdAt: toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" })),
        });
        return { ok: true as const, appointment };
      } catch (error) {
        if (!isSqliteConstraint(error)) throw error;
        return { ok: false as const, code: "slot_taken", message: "That time was just taken." };
      }
    });
    return run();
  }

  reschedule(input: { id: string; start: string; providerId?: string; now: Date }):
    | { ok: true; appointment: AppointmentRecord }
    | { ok: false; code: string; message: string } {
    const run = this.db.transaction(() => {
      const current = this.getAppointment(input.id);
      if (!current) return { ok: false as const, code: "not_found", message: "I cannot find that visit." };
      const gate = canChange(current.startsAt, current.visitType, current.status, input.now);
      if (!gate.ok) return gate;
      const providerId = input.providerId ?? current.providerId;
      const resolved = resolveSlot(input.now, this.busy(current.id), {
        visitType: current.visitType,
        providerId,
        start: input.start,
      });
      if (!resolved.ok) return resolved;
      const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
      try {
        this.db
          .prepare("UPDATE clinic_appointments SET provider_id = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?")
          .run(resolved.slot.providerId, resolved.slot.start, resolved.slot.end, stamp, current.id);
      } catch (error) {
        if (!isSqliteConstraint(error)) throw error;
        return { ok: false as const, code: "slot_taken", message: "That time was just taken." };
      }
      const appointment = this.getAppointment(current.id);
      if (!appointment) return { ok: false as const, code: "not_found", message: "I cannot find that visit." };
      return { ok: true as const, appointment };
    });
    return run();
  }

  cancel(input: { id: string; now: Date }): { ok: true; appointment: AppointmentRecord } | { ok: false; code: string; message: string } {
    const current = this.getAppointment(input.id);
    if (!current) return { ok: false, code: "not_found", message: "I cannot find that visit." };
    const gate = canChange(current.startsAt, current.visitType, current.status, input.now);
    if (!gate.ok) return gate;
    const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db.prepare("UPDATE clinic_appointments SET status = 'cancelled', updated_at = ? WHERE id = ?").run(stamp, current.id);
    const appointment = this.getAppointment(current.id);
    if (!appointment) return { ok: false, code: "not_found", message: "I cannot find that visit." };
    return { ok: true, appointment };
  }

  listRefills(): RefillRecord[] {
    const rows = this.db
      .prepare(
        `SELECT r.*, p.name AS patient_name FROM clinic_refills r
         JOIN clinic_patients p ON p.id = r.patient_id ORDER BY r.created_at DESC`,
      )
      .all() as Array<Record<string, string>>;
    return rows.map((row) => ({
      id: row.id ?? "",
      patientId: row.patient_id ?? "",
      patientName: row.patient_name ?? "",
      medication: row.medication ?? "",
      pharmacy: row.pharmacy ?? "",
      status: row.status ?? "",
      createdAt: row.created_at ?? "",
    }));
  }

  insertRefill(input: { patientId: string; medication: string; pharmacy: string; now: Date }): RefillRecord {
    const id = newId("rx");
    const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db
      .prepare("INSERT INTO clinic_refills (id, patient_id, medication, pharmacy, status, created_at) VALUES (?, ?, ?, ?, 'queued', ?)")
      .run(id, input.patientId, input.medication, input.pharmacy, stamp);
    const refill = this.listRefills().find((item) => item.id === id);
    if (!refill) throw new Error("Refill insert failed");
    return refill;
  }

  audit(action: string, subjectId: string | null, ok: boolean, summary: string, now: Date): void {
    this.db
      .prepare("INSERT INTO clinic_audit (id, action, subject_id, ok, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newId("aud"), action, subjectId, ok ? 1 : 0, summary, toUtcIso(DateTime.fromJSDate(now, { zone: "utc" })));
  }

  listAudit(): AuditRecord[] {
    const rows = this.db.prepare("SELECT * FROM clinic_audit ORDER BY created_at DESC").all() as Array<{
      id: string;
      action: string;
      subject_id: string | null;
      ok: number;
      summary: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      subjectId: row.subject_id,
      ok: row.ok === 1,
      summary: row.summary,
      createdAt: row.created_at,
    }));
  }

  slots(now: Date, query: { visitType: VisitType; date?: string; days?: number; providerId?: string }) {
    return listSlots(now, this.busy(), query);
  }
}

function mapAppointment(row: Record<string, string | null>): AppointmentRecord {
  return {
    id: row.id ?? "",
    patientId: row.patient_id ?? "",
    patientName: row.patient_name ?? "",
    providerId: row.provider_id ?? "",
    visitType: (row.visit_type ?? "follow_up") as VisitType,
    startsAt: row.starts_at ?? "",
    endsAt: row.ends_at ?? "",
    status: (row.status ?? "scheduled") as AppointmentRecord["status"],
    reason: row.reason ?? "",
    sourceCallId: row.source_call_id ?? null,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

export function publicPatient(patient: PatientRecord) {
  const pcp = providerById(patient.pcpId);
  return {
    id: patient.id,
    name: patient.name,
    dobMasked: maskDob(patient.dob),
    phoneMasked: maskPhone(patient.phone),
    payer: patient.payer,
    memberMasked: patient.memberId ? `••••${patient.memberId.slice(-4)}` : "",
    pcp: pcp?.name ?? "",
  };
}

export function normalizePatientName(name: string): string {
  return normalizeName(name);
}
