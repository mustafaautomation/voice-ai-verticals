import { DateTime } from "luxon";
import type { SqliteDatabase } from "../db/database.js";
import { isSqliteConstraint } from "../db/database.js";
import { newId } from "../platform/ids.js";
import type { OpsConfig, Priority, ScheduleCode, ChangeCode } from "../platform/schedule.js";
import { canChange, listOffers, resolveWindow, type JobStatus, type WindowOffer } from "../platform/schedule.js";
import { toUtcIso } from "../platform/time.js";
import { toE164 } from "../platform/phone.js";

export type JobRecord = {
  id: string;
  verticalId: string;
  customerId: string;
  customerName: string;
  phone: string;
  jobType: string;
  priority: Priority;
  status: JobStatus;
  windowStart: string | null;
  windowEnd: string | null;
  windowLabel: string;
  techId: string;
  address: string;
  description: string;
  sourceCallId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  vertical_id: string;
  customer_id: string;
  customer_name: string;
  phone: string;
  job_type: string;
  priority: Priority;
  status: JobStatus;
  window_start: string | null;
  window_end: string | null;
  window_label: string;
  tech_id: string;
  address: string;
  description: string;
  source_call_id: string | null;
  created_at: string;
  updated_at: string;
};

function map(row: Row): JobRecord {
  return {
    id: row.id,
    verticalId: row.vertical_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    phone: row.phone,
    jobType: row.job_type,
    priority: row.priority,
    status: row.status,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    windowLabel: row.window_label,
    techId: row.tech_id,
    address: row.address,
    description: row.description,
    sourceCallId: row.source_call_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `
  SELECT jobs.*, customers.name AS customer_name, customers.phone AS phone
  FROM jobs JOIN customers ON customers.id = jobs.customer_id
`;

export type BookInput = {
  verticalId: string;
  customerId: string;
  jobType: string;
  priority: Priority;
  offer: WindowOffer;
  address: string;
  description: string;
  sourceCallId: string | null;
  status: JobStatus;
  now: Date;
};

export class JobStore {
  constructor(private readonly db: SqliteDatabase) {}

  counts(verticalId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE vertical_id = ?").get(verticalId) as { n: number };
    return row.n;
  }

  list(verticalId: string): JobRecord[] {
    const rows = this.db.prepare(`${SELECT} WHERE jobs.vertical_id = ? ORDER BY jobs.created_at DESC`).all(verticalId) as Row[];
    return rows.map(map);
  }

  openCount(verticalId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM jobs WHERE vertical_id = ? AND status IN ('scheduled', 'dispatched')")
      .get(verticalId) as { n: number };
    return row.n;
  }

  forCustomer(customerId: string): JobRecord[] {
    const rows = this.db
      .prepare(`${SELECT} WHERE jobs.customer_id = ? ORDER BY jobs.window_start`)
      .all(customerId) as Row[];
    return rows.map(map);
  }

  get(id: string): JobRecord | null {
    const row = this.db.prepare(`${SELECT} WHERE jobs.id = ?`).get(id) as Row | undefined;
    return row ? map(row) : null;
  }

  takenKeys(verticalId: string, ignoreJobId?: string): Set<string> {
    const rows = this.db
      .prepare(
        `SELECT tech_id, window_start FROM jobs
         WHERE vertical_id = ? AND status IN ('scheduled', 'dispatched') AND window_start IS NOT NULL AND id != ?`,
      )
      .all(verticalId, ignoreJobId ?? "") as Array<{ tech_id: string; window_start: string }>;
    return new Set(rows.map((row) => `${row.tech_id}|${row.window_start}`));
  }

  checkWindows(
    config: OpsConfig,
    now: Date,
    query: { date?: string; days?: number; jobTypeId: string; priority: Priority },
  ): ReturnType<typeof listOffers> {
    return listOffers(config, now, this.takenKeys(config.verticalId), query);
  }

  insertRaw(input: {
    id?: string;
    verticalId: string;
    customerId: string;
    jobType: string;
    priority: Priority;
    status: JobStatus;
    windowStart: string | null;
    windowEnd: string | null;
    windowLabel: string;
    techId: string;
    address: string;
    description: string;
    sourceCallId?: string | null;
    createdAt?: string;
  }): JobRecord {
    const id = input.id ?? newId("job");
    const createdAt = input.createdAt ?? toUtcIso(DateTime.utc());
    this.db
      .prepare(
        `INSERT INTO jobs (
          id, vertical_id, customer_id, job_type, priority, status, window_start, window_end,
          window_label, tech_id, address, description, source_call_id, created_at, updated_at
        ) VALUES (
          @id, @verticalId, @customerId, @jobType, @priority, @status, @windowStart, @windowEnd,
          @windowLabel, @techId, @address, @description, @sourceCallId, @createdAt, @updatedAt
        )`,
      )
      .run({
        id,
        verticalId: input.verticalId,
        customerId: input.customerId,
        jobType: input.jobType,
        priority: input.priority,
        status: input.status,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        windowLabel: input.windowLabel,
        techId: input.techId,
        address: input.address,
        description: input.description,
        sourceCallId: input.sourceCallId ?? null,
        createdAt,
        updatedAt: createdAt,
      });
    const job = this.get(id);
    if (!job) throw new Error("Job insert failed");
    return job;
  }

  book(
    config: OpsConfig,
    input: {
      customerId: string;
      jobType: string;
      priority: Priority;
      windowStart: string;
      address: string;
      description: string;
      sourceCallId: string | null;
      status: JobStatus;
      now: Date;
    },
  ): { ok: true; job: JobRecord; offer: WindowOffer } | { ok: false; code: ScheduleCode; message: string } {
    const run = this.db.transaction(() => {
      const taken = this.takenKeys(config.verticalId);
      const resolved = resolveWindow(config, input.now, taken, {
        jobTypeId: input.jobType,
        priority: input.priority,
        startIso: input.windowStart,
      });
      if (!resolved.ok) return resolved;
      try {
        const id = newId("job");
        const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
        this.db
          .prepare(
            `INSERT INTO jobs (
              id, vertical_id, customer_id, job_type, priority, status, window_start, window_end,
              window_label, tech_id, address, description, source_call_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            config.verticalId,
            input.customerId,
            input.jobType,
            input.priority,
            input.status,
            resolved.offer.start,
            resolved.offer.end,
            resolved.offer.label,
            resolved.offer.techId,
            input.address,
            input.description,
            input.sourceCallId,
            stamp,
            stamp,
          );
        const job = this.get(id);
        if (!job) return { ok: false as const, code: "slot_taken" as const, message: "The job did not save." };
        return { ok: true as const, job, offer: resolved.offer };
      } catch (error) {
        if (!isSqliteConstraint(error)) throw error;
        return { ok: false as const, code: "slot_taken" as const, message: "That arrival window was just taken. Ask for another." };
      }
    });
    return run();
  }

  reschedule(
    config: OpsConfig,
    input: { jobId: string; windowStart: string; now: Date },
  ): { ok: true; job: JobRecord } | { ok: false; code: ScheduleCode | ChangeCode | "not_found"; message: string } {
    const run = this.db.transaction(() => {
      const current = this.get(input.jobId);
      if (!current || current.verticalId !== config.verticalId) {
        return { ok: false as const, code: "not_found" as const, message: "I cannot find that job." };
      }
      const gate = canChange(config, current, input.now);
      if (!gate.ok) return gate;
      if (current.windowStart === parseStart(input.windowStart)) {
        return { ok: false as const, code: "misaligned" as const, message: "That job is already in that window." };
      }
      const resolved = resolveWindow(config, input.now, this.takenKeys(config.verticalId, current.id), {
        jobTypeId: current.jobType,
        priority: current.priority === "emergency" ? "routine" : current.priority,
        startIso: input.windowStart,
      });
      if (!resolved.ok) return resolved;
      const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
      try {
        this.db
          .prepare(
            `UPDATE jobs SET window_start = ?, window_end = ?, window_label = ?, tech_id = ?, updated_at = ? WHERE id = ?`,
          )
          .run(resolved.offer.start, resolved.offer.end, resolved.offer.label, resolved.offer.techId, stamp, current.id);
      } catch (error) {
        if (!isSqliteConstraint(error)) throw error;
        return { ok: false as const, code: "slot_taken" as const, message: "That arrival window was just taken." };
      }
      const job = this.get(current.id);
      if (!job) return { ok: false as const, code: "not_found" as const, message: "I cannot find that job." };
      return { ok: true as const, job };
    });
    return run();
  }

  cancel(
    config: OpsConfig,
    input: { jobId: string; now: Date },
  ): { ok: true; job: JobRecord } | { ok: false; code: ChangeCode | "not_found"; message: string } {
    const current = this.get(input.jobId);
    if (!current || current.verticalId !== config.verticalId) {
      return { ok: false, code: "not_found", message: "I cannot find that job." };
    }
    const gate = canChange(config, current, input.now);
    if (!gate.ok) return gate;
    const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db.prepare("UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ?").run(stamp, current.id);
    const job = this.get(current.id);
    if (!job) return { ok: false, code: "not_found", message: "I cannot find that job." };
    return { ok: true, job };
  }
}

function parseStart(input: string): string | null {
  const dt = DateTime.fromISO(input, { setZone: true });
  if (!dt.isValid) return null;
  return toUtcIso(dt);
}

export { toE164 };
