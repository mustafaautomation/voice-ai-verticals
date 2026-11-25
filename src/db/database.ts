import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export function openDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

export function migrate(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_digits TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customers_phone ON customers(vertical_id, phone_digits);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      window_start TEXT,
      window_end TEXT,
      window_label TEXT NOT NULL,
      tech_id TEXT NOT NULL,
      address TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_call_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS jobs_tech_window
      ON jobs(vertical_id, tech_id, window_start)
      WHERE status IN ('scheduled', 'dispatched') AND window_start IS NOT NULL;
    CREATE INDEX IF NOT EXISTS jobs_vertical ON jobs(vertical_id, status);

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      vapi_call_id TEXT NOT NULL,
      caller_number TEXT,
      caller_name TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      outcome TEXT NOT NULL,
      summary TEXT,
      transcript TEXT,
      ended_reason TEXT,
      after_hours INTEGER NOT NULL DEFAULT 0,
      UNIQUE(vertical_id, vapi_call_id)
    );
    CREATE INDEX IF NOT EXISTS calls_vertical ON calls(vertical_id, started_at);

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      call_row_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(call_row_id, tool_call_id)
    );

    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT PRIMARY KEY,
      body_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY,
      vertical_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      to_number TEXT NOT NULL,
      from_number TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      related_type TEXT,
      related_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sms_vertical ON sms_messages(vertical_id, created_at);

    CREATE TABLE IF NOT EXISTS clinic_patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dob TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_digits TEXT NOT NULL,
      payer TEXT NOT NULL DEFAULT '',
      member_id TEXT NOT NULL DEFAULT '',
      pcp_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS clinic_patients_name ON clinic_patients(name);

    CREATE TABLE IF NOT EXISTS clinic_appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      visit_type TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      source_call_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS clinic_provider_start
      ON clinic_appointments(provider_id, starts_at)
      WHERE status = 'scheduled';

    CREATE TABLE IF NOT EXISTS clinic_refills (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      medication TEXT NOT NULL,
      pharmacy TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clinic_audit (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      subject_id TEXT,
      ok INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fintech_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      dob TEXT NOT NULL,
      last4 TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_digits TEXT NOT NULL,
      balance_cents INTEGER NOT NULL,
      past_due_cents INTEGER NOT NULL,
      card_status TEXT NOT NULL,
      cease_contact INTEGER NOT NULL DEFAULT 0,
      otp_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fintech_txns (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      posted_on TEXT NOT NULL,
      merchant TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      flagged INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fintech_cases (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fintech_audit (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      subject_id TEXT,
      ok INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function isSqliteConstraint(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: string }).code === "string" &&
    (error as { code: string }).code.startsWith("SQLITE_CONSTRAINT")
  );
}
