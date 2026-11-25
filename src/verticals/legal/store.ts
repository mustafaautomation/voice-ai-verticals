import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { newId } from "../../platform/ids.js";
import { toE164 } from "../../platform/phone.js";
import { toUtcIso } from "../../platform/time.js";
import type { Busy } from "./schedule.js";

export type Party = { id: string; name: string; side: "client" | "adverse"; matterLabel: string };
export type Matter = {
  id: string;
  callerName: string;
  phone: string;
  practice: string;
  opposing: string;
  incidentDate: string;
  jurisdiction: string;
  summary: string;
  status: string;
  urgent: boolean;
  createdAt: string;
};
export type Consult = {
  id: string;
  matterId: string;
  callerName: string;
  attorneyId: string;
  consultType: string;
  startsAt: string;
  endsAt: string;
  status: string;
};
export type Audit = { id: string; action: string; subjectId: string | null; ok: boolean; summary: string; createdAt: string };

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export class LegalStore {
  constructor(private readonly db: SqliteDatabase) {}

  countMatters(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM legal_matters").get() as { n: number }).n;
  }

  insertParty(input: Party): void {
    this.db.prepare("INSERT INTO legal_parties (id, name, side, matter_label) VALUES (?, ?, ?, ?)").run(input.id, input.name, input.side, input.matterLabel);
  }

  listParties(): Party[] {
    const rows = this.db.prepare("SELECT id, name, side, matter_label FROM legal_parties ORDER BY side, name").all() as Array<{
      id: string;
      name: string;
      side: "client" | "adverse";
      matter_label: string;
    }>;
    return rows.map((row) => ({ id: row.id, name: row.name, side: row.side, matterLabel: row.matter_label }));
  }

  conflict(callerName: string, opposing: string): { hit: boolean } {
    const parties = this.db.prepare("SELECT name, side FROM legal_parties").all() as Array<{ name: string; side: string }>;
    const caller = norm(callerName);
    const other = norm(opposing);
    const hit = parties.some((party) => {
      const name = norm(party.name);
      if (other && name === other) return true;
      if (party.side === "adverse" && caller && name === caller) return true;
      return false;
    });
    return { hit };
  }

  insertMatter(input: Omit<Matter, "id" | "createdAt"> & { id?: string; now: Date }): Matter {
    const id = input.id ?? newId("mat");
    const createdAt = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db
      .prepare(
        `INSERT INTO legal_matters (
          id, caller_name, phone, practice, opposing, incident_date, jurisdiction, summary, status, urgent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.callerName, toE164(input.phone), input.practice, input.opposing, input.incidentDate, input.jurisdiction, input.summary, input.status, input.urgent ? 1 : 0, createdAt);
    const matter = this.listMatters().find((item) => item.id === id);
    if (!matter) throw new Error("Matter insert failed");
    return matter;
  }

  listMatters(): Matter[] {
    const rows = this.db.prepare("SELECT * FROM legal_matters ORDER BY created_at DESC").all() as Array<Record<string, string | number>>;
    return rows.map((row) => ({
      id: String(row.id),
      callerName: String(row.caller_name),
      phone: String(row.phone),
      practice: String(row.practice),
      opposing: String(row.opposing ?? ""),
      incidentDate: String(row.incident_date ?? ""),
      jurisdiction: String(row.jurisdiction ?? ""),
      summary: String(row.summary),
      status: String(row.status),
      urgent: row.urgent === 1,
      createdAt: String(row.created_at),
    }));
  }

  getMatter(id: string): Matter | null {
    return this.listMatters().find((item) => item.id === id) ?? null;
  }

  insertConsult(input: { id?: string; matterId: string; attorneyId: string; consultType: string; startsAt: string; endsAt: string; now: Date }): Consult {
    const id = input.id ?? newId("con");
    const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db
      .prepare(
        `INSERT INTO legal_consults (id, matter_id, attorney_id, consult_type, starts_at, ends_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      )
      .run(id, input.matterId, input.attorneyId, input.consultType, input.startsAt, input.endsAt, stamp, stamp);
    const consult = this.listConsults().find((item) => item.id === id);
    if (!consult) throw new Error("Consult insert failed");
    return consult;
  }

  listConsults(): Consult[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, m.caller_name FROM legal_consults c JOIN legal_matters m ON m.id = c.matter_id ORDER BY c.starts_at`,
      )
      .all() as Array<Record<string, string>>;
    return rows.map((row) => ({
      id: row.id ?? "",
      matterId: row.matter_id ?? "",
      callerName: row.caller_name ?? "",
      attorneyId: row.attorney_id ?? "",
      consultType: row.consult_type ?? "",
      startsAt: row.starts_at ?? "",
      endsAt: row.ends_at ?? "",
      status: row.status ?? "",
    }));
  }

  getConsult(id: string): Consult | null {
    return this.listConsults().find((item) => item.id === id) ?? null;
  }

  busy(): Busy[] {
    return this.listConsults()
      .filter((item) => item.status === "scheduled")
      .map((item) => ({ attorneyId: item.attorneyId, start: item.startsAt, end: item.endsAt }));
  }

  moveConsult(id: string, attorneyId: string, start: string, end: string, now: Date): void {
    this.db
      .prepare("UPDATE legal_consults SET attorney_id = ?, starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?")
      .run(attorneyId, start, end, toUtcIso(DateTime.fromJSDate(now, { zone: "utc" })), id);
  }

  cancelConsult(id: string, now: Date): void {
    this.db.prepare("UPDATE legal_consults SET status = 'cancelled', updated_at = ? WHERE id = ?").run(toUtcIso(DateTime.fromJSDate(now, { zone: "utc" })), id);
  }

  audit(action: string, subjectId: string | null, ok: boolean, summary: string, now: Date): void {
    this.db
      .prepare("INSERT INTO legal_audit (id, action, subject_id, ok, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newId("aud"), action, subjectId, ok ? 1 : 0, summary, toUtcIso(DateTime.fromJSDate(now, { zone: "utc" })));
  }

  listAudit(): Audit[] {
    const rows = this.db.prepare("SELECT * FROM legal_audit ORDER BY created_at DESC").all() as Array<{
      id: string;
      action: string;
      subject_id: string | null;
      ok: number;
      summary: string;
      created_at: string;
    }>;
    return rows.map((row) => ({ id: row.id, action: row.action, subjectId: row.subject_id, ok: row.ok === 1, summary: row.summary, createdAt: row.created_at     }));
  }
}
