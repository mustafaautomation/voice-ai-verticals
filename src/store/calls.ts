import { DateTime } from "luxon";
import type { SqliteDatabase } from "../db/database.js";
import { isSqliteConstraint } from "../db/database.js";
import { newId } from "../platform/ids.js";
import type { Priority } from "../platform/schedule.js";
import { toUtcIso } from "../platform/time.js";

export type CallStatus = "in_progress" | "completed";

export type CallOutcome =
  | "in_progress"
  | "booked"
  | "rescheduled"
  | "cancelled"
  | "transferred"
  | "escalated"
  | "text_back"
  | "slot_unavailable"
  | "off_topic"
  | "refused"
  | "refill"
  | "serviced"
  | "completed"
  | "no_booking";

const RANK: Record<CallOutcome, number> = {
  in_progress: 0,
  completed: 10,
  no_booking: 10,
  off_topic: 20,
  refused: 25,
  slot_unavailable: 30,
  text_back: 40,
  transferred: 50,
  cancelled: 60,
  rescheduled: 70,
  refill: 75,
  serviced: 78,
  booked: 80,
  escalated: 90,
};

export function strongerOutcome(current: CallOutcome, next: CallOutcome): CallOutcome {
  return (RANK[next] ?? 0) >= (RANK[current] ?? 0) ? next : current;
}

export type CallRecord = {
  id: string;
  verticalId: string;
  vapiCallId: string;
  callerNumber: string | null;
  callerName: string | null;
  startedAt: string;
  endedAt: string | null;
  status: CallStatus;
  outcome: CallOutcome;
  summary: string | null;
  transcript: string | null;
  endedReason: string | null;
  afterHours: boolean;
};

export type ToolCallRecord = {
  id: string;
  callRowId: string;
  toolCallId: string;
  name: string;
  arguments: unknown;
  result: unknown;
  createdAt: string;
};

type CallRow = {
  id: string;
  vertical_id: string;
  vapi_call_id: string;
  caller_number: string | null;
  caller_name: string | null;
  started_at: string;
  ended_at: string | null;
  status: CallStatus;
  outcome: CallOutcome;
  summary: string | null;
  transcript: string | null;
  ended_reason: string | null;
  after_hours: number;
};

function mapCall(row: CallRow): CallRecord {
  return {
    id: row.id,
    verticalId: row.vertical_id,
    vapiCallId: row.vapi_call_id,
    callerNumber: row.caller_number,
    callerName: row.caller_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    outcome: row.outcome,
    summary: row.summary,
    transcript: row.transcript,
    endedReason: row.ended_reason,
    afterHours: row.after_hours === 1,
  };
}

function nowIso(now: Date): string {
  return toUtcIso(DateTime.fromJSDate(now, { zone: "utc" }));
}

export class CallStore {
  constructor(private readonly db: SqliteDatabase) {}

  counts(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM calls").get() as { n: number };
    return row.n;
  }

  getById(id: string): CallRecord | null {
    const row = this.db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as CallRow | undefined;
    return row ? mapCall(row) : null;
  }

  getByVapiId(verticalId: string, vapiCallId: string): CallRecord | null {
    const row = this.db
      .prepare("SELECT * FROM calls WHERE vertical_id = ? AND vapi_call_id = ?")
      .get(verticalId, vapiCallId) as CallRow | undefined;
    return row ? mapCall(row) : null;
  }

  list(verticalId: string, query = ""): CallRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM calls WHERE vertical_id = ? ORDER BY started_at DESC")
      .all(verticalId) as CallRow[];
    const needle = query.trim().toLowerCase();
    return rows
      .map(mapCall)
      .filter((call) => {
        if (!needle) return true;
        const hay = [call.callerName, call.callerNumber, call.outcome, call.summary, call.transcript]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
  }

  ensure(input: {
    id?: string;
    verticalId: string;
    vapiCallId: string;
    callerNumber?: string | null;
    callerName?: string | null;
    afterHours: boolean;
    now: Date;
    outcome?: CallOutcome;
    summary?: string | null;
    transcript?: string | null;
    status?: CallStatus;
    endedReason?: string | null;
  }): CallRecord {
    const existing = this.getByVapiId(input.verticalId, input.vapiCallId);
    if (existing) {
      if (input.callerNumber && !existing.callerNumber) {
        this.update({ ...existing, callerNumber: input.callerNumber });
        return this.getById(existing.id) ?? existing;
      }
      return existing;
    }
    const record: CallRecord = {
      id: input.id ?? newId("call"),
      verticalId: input.verticalId,
      vapiCallId: input.vapiCallId,
      callerNumber: input.callerNumber ?? null,
      callerName: input.callerName ?? null,
      startedAt: nowIso(input.now),
      endedAt: input.status === "completed" ? nowIso(input.now) : null,
      status: input.status ?? "in_progress",
      outcome: input.outcome ?? "in_progress",
      summary: input.summary ?? null,
      transcript: input.transcript ?? null,
      endedReason: input.endedReason ?? null,
      afterHours: input.afterHours,
    };
    this.db
      .prepare(
        `INSERT INTO calls (
          id, vertical_id, vapi_call_id, caller_number, caller_name, started_at, ended_at,
          status, outcome, summary, transcript, ended_reason, after_hours
        ) VALUES (
          @id, @verticalId, @vapiCallId, @callerNumber, @callerName, @startedAt, @endedAt,
          @status, @outcome, @summary, @transcript, @endedReason, @afterHours
        )`,
      )
      .run({ ...record, afterHours: record.afterHours ? 1 : 0 });
    return record;
  }

  update(record: CallRecord): void {
    this.db
      .prepare(
        `UPDATE calls SET caller_number = @callerNumber, caller_name = @callerName, ended_at = @endedAt,
         status = @status, outcome = @outcome, summary = @summary, transcript = @transcript,
         ended_reason = @endedReason, after_hours = @afterHours WHERE id = @id`,
      )
      .run({ ...record, afterHours: record.afterHours ? 1 : 0 });
  }

  findToolCall(callRowId: string, toolCallId: string): ToolCallRecord | null {
    const row = this.db
      .prepare("SELECT * FROM tool_calls WHERE call_row_id = ? AND tool_call_id = ?")
      .get(callRowId, toolCallId) as
      | {
          id: string;
          call_row_id: string;
          tool_call_id: string;
          name: string;
          arguments_json: string;
          result_json: string;
          created_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      callRowId: row.call_row_id,
      toolCallId: row.tool_call_id,
      name: row.name,
      arguments: JSON.parse(row.arguments_json) as unknown,
      result: JSON.parse(row.result_json) as unknown,
      createdAt: row.created_at,
    };
  }

  listToolCalls(callRowId: string): ToolCallRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM tool_calls WHERE call_row_id = ? ORDER BY created_at")
      .all(callRowId) as Array<{
      id: string;
      call_row_id: string;
      tool_call_id: string;
      name: string;
      arguments_json: string;
      result_json: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      callRowId: row.call_row_id,
      toolCallId: row.tool_call_id,
      name: row.name,
      arguments: JSON.parse(row.arguments_json) as unknown,
      result: JSON.parse(row.result_json) as unknown,
      createdAt: row.created_at,
    }));
  }

  saveToolCall(input: {
    callRowId: string;
    toolCallId: string;
    name: string;
    arguments: unknown;
    result: unknown;
    now: Date;
  }): void {
    this.db
      .prepare(
        `INSERT INTO tool_calls (id, call_row_id, tool_call_id, name, arguments_json, result_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId("tool"),
        input.callRowId,
        input.toolCallId,
        input.name,
        JSON.stringify(input.arguments),
        JSON.stringify(input.result),
        nowIso(input.now),
      );
  }

  saveToolCallSafe(input: {
    callRowId: string;
    toolCallId: string;
    name: string;
    arguments: unknown;
    result: unknown;
    now: Date;
  }): ToolCallRecord | null {
    try {
      this.saveToolCall(input);
      return null;
    } catch (error) {
      if (!isSqliteConstraint(error)) throw error;
      return this.findToolCall(input.callRowId, input.toolCallId);
    }
  }

  getIdempotency(key: string): unknown {
    const row = this.db.prepare("SELECT body_json FROM idempotency WHERE key = ?").get(key) as { body_json: string } | undefined;
    return row ? (JSON.parse(row.body_json) as unknown) : undefined;
  }

  insertIdempotency(key: string, body: unknown, now: Date): boolean {
    try {
      this.db.prepare("INSERT INTO idempotency (key, body_json, created_at) VALUES (?, ?, ?)").run(key, JSON.stringify(body), nowIso(now));
      return true;
    } catch (error) {
      if (!isSqliteConstraint(error)) throw error;
      return false;
    }
  }

  saveIdempotency(key: string, body: unknown, now: Date): void {
    this.db
      .prepare("INSERT INTO idempotency (key, body_json, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET body_json = excluded.body_json")
      .run(key, JSON.stringify(body), nowIso(now));
  }

  deleteIdempotency(key: string): void {
    this.db.prepare("DELETE FROM idempotency WHERE key = ?").run(key);
  }
}

export type { Priority };
