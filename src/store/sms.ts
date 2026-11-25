import { DateTime } from "luxon";
import type { SqliteDatabase } from "../db/database.js";
import { newId } from "../platform/ids.js";
import { toUtcIso } from "../platform/time.js";

export type SmsKind = "dispatch" | "confirmation" | "text_back" | "safety" | "refill";
export type SmsStatus = "queued" | "sent" | "failed";

export type SmsMessage = {
  id: string;
  verticalId: string;
  provider: string;
  kind: SmsKind;
  toNumber: string;
  fromNumber: string;
  body: string;
  status: SmsStatus;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
};

export type OutboundSms = {
  verticalId: string;
  kind: SmsKind;
  to: string;
  body: string;
  from?: string;
  relatedType?: string;
  relatedId?: string;
};

type Row = {
  id: string;
  vertical_id: string;
  provider: string;
  kind: SmsKind;
  to_number: string;
  from_number: string;
  body: string;
  status: SmsStatus;
  related_type: string | null;
  related_id: string | null;
  created_at: string;
};

function map(row: Row): SmsMessage {
  return {
    id: row.id,
    verticalId: row.vertical_id,
    provider: row.provider,
    kind: row.kind,
    toNumber: row.to_number,
    fromNumber: row.from_number,
    body: row.body,
    status: row.status,
    relatedType: row.related_type,
    relatedId: row.related_id,
    createdAt: row.created_at,
  };
}

export class SmsStore {
  constructor(private readonly db: SqliteDatabase) {}

  list(verticalId: string): SmsMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM sms_messages WHERE vertical_id = ? ORDER BY created_at DESC")
      .all(verticalId) as Row[];
    return rows.map(map);
  }

  hasKind(verticalId: string, kind: SmsKind, relatedId: string): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM sms_messages WHERE vertical_id = ? AND kind = ? AND related_id = ? AND status != 'failed' LIMIT 1",
      )
      .get(verticalId, kind, relatedId) as { id: string } | undefined;
    return Boolean(row);
  }

  insert(input: {
    id?: string;
    provider: string;
    fromNumber: string;
    status: SmsStatus;
    message: OutboundSms;
    createdAt?: string;
  }): SmsMessage {
    const record: SmsMessage = {
      id: input.id ?? newId("sms"),
      verticalId: input.message.verticalId,
      provider: input.provider,
      kind: input.message.kind,
      toNumber: input.message.to,
      fromNumber: input.fromNumber,
      body: input.message.body,
      status: input.status,
      relatedType: input.message.relatedType ?? null,
      relatedId: input.message.relatedId ?? null,
      createdAt: input.createdAt ?? toUtcIso(DateTime.utc()),
    };
    this.db
      .prepare(
        `INSERT INTO sms_messages (
          id, vertical_id, provider, kind, to_number, from_number, body, status, related_type, related_id, created_at
        ) VALUES (
          @id, @verticalId, @provider, @kind, @toNumber, @fromNumber, @body, @status, @relatedType, @relatedId, @createdAt
        )`,
      )
      .run(record);
    return record;
  }
}
