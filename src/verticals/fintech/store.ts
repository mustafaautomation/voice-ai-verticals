import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { newId } from "../../platform/ids.js";
import { phoneDigits, toE164 } from "../../platform/phone.js";
import { toUtcIso } from "../../platform/time.js";
import { namesMatch, normalizeDob } from "./privacy.js";

export type CardStatus = "open" | "frozen" | "stolen";

export type AccountRecord = {
  id: string;
  name: string;
  dob: string;
  last4: string;
  phone: string;
  balanceCents: number;
  pastDueCents: number;
  cardStatus: CardStatus;
  ceaseContact: boolean;
  otpCode: string;
  createdAt: string;
};

export type TxnRecord = {
  id: string;
  accountId: string;
  postedOn: string;
  merchant: string;
  amountCents: number;
  flagged: boolean;
};

export type CaseRecord = {
  id: string;
  accountId: string;
  accountName: string;
  kind: string;
  status: string;
  summary: string;
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

type AccountRow = {
  id: string;
  name: string;
  dob: string;
  last4: string;
  phone: string;
  balance_cents: number;
  past_due_cents: number;
  card_status: CardStatus;
  cease_contact: number;
  otp_code: string;
  created_at: string;
};

function mapAccount(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    name: row.name,
    dob: row.dob,
    last4: row.last4,
    phone: row.phone,
    balanceCents: row.balance_cents,
    pastDueCents: row.past_due_cents,
    cardStatus: row.card_status,
    ceaseContact: row.cease_contact === 1,
    otpCode: row.otp_code,
    createdAt: row.created_at,
  };
}

export class FintechStore {
  constructor(private readonly db: SqliteDatabase) {}

  countAccounts(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM fintech_accounts").get() as { n: number }).n;
  }

  listAccounts(): AccountRecord[] {
    return (this.db.prepare("SELECT * FROM fintech_accounts ORDER BY name COLLATE NOCASE").all() as AccountRow[]).map(mapAccount);
  }

  getAccount(id: string): AccountRecord | null {
    const row = this.db.prepare("SELECT * FROM fintech_accounts WHERE id = ?").get(id) as AccountRow | undefined;
    return row ? mapAccount(row) : null;
  }

  findAccount(name: string, last4: string): AccountRecord | null {
    const digits = last4.replace(/\D/g, "").slice(-4);
    const rows = this.db.prepare("SELECT * FROM fintech_accounts WHERE last4 = ?").all(digits) as AccountRow[];
    return rows.map(mapAccount).find((account) => namesMatch(account.name, name)) ?? null;
  }

  insertAccount(input: {
    id?: string;
    name: string;
    dob: string;
    last4: string;
    phone: string;
    balanceCents: number;
    pastDueCents: number;
    cardStatus?: CardStatus;
    ceaseContact?: boolean;
    otpCode: string;
    createdAt?: string;
  }): AccountRecord {
    const dob = normalizeDob(input.dob);
    if (!dob) throw new Error("Invalid date of birth");
    const id = input.id ?? newId("acct");
    const phone = toE164(input.phone);
    const createdAt = input.createdAt ?? toUtcIso(DateTime.utc());
    this.db
      .prepare(
        `INSERT INTO fintech_accounts (
          id, name, dob, last4, phone, phone_digits, balance_cents, past_due_cents, card_status, cease_contact, otp_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name.trim(),
        dob,
        input.last4.replace(/\D/g, "").slice(-4),
        phone,
        phoneDigits(phone),
        input.balanceCents,
        input.pastDueCents,
        input.cardStatus ?? "open",
        input.ceaseContact ? 1 : 0,
        input.otpCode,
        createdAt,
      );
    const account = this.getAccount(id);
    if (!account) throw new Error("Account insert failed");
    return account;
  }

  setCard(id: string, status: CardStatus): void {
    this.db.prepare("UPDATE fintech_accounts SET card_status = ? WHERE id = ?").run(status, id);
  }

  setCease(id: string, cease: boolean): void {
    this.db.prepare("UPDATE fintech_accounts SET cease_contact = ? WHERE id = ?").run(cease ? 1 : 0, id);
  }

  setPastDue(id: string, cents: number): void {
    this.db.prepare("UPDATE fintech_accounts SET past_due_cents = ? WHERE id = ?").run(cents, id);
  }

  insertTxn(input: { id?: string; accountId: string; postedOn: string; merchant: string; amountCents: number; flagged?: boolean }): TxnRecord {
    const id = input.id ?? newId("txn");
    this.db
      .prepare("INSERT INTO fintech_txns (id, account_id, posted_on, merchant, amount_cents, flagged) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, input.accountId, input.postedOn, input.merchant, input.amountCents, input.flagged ? 1 : 0);
    return {
      id,
      accountId: input.accountId,
      postedOn: input.postedOn,
      merchant: input.merchant,
      amountCents: input.amountCents,
      flagged: Boolean(input.flagged),
    };
  }

  txnsFor(accountId: string): TxnRecord[] {
    const rows = this.db.prepare("SELECT * FROM fintech_txns WHERE account_id = ? ORDER BY posted_on DESC").all(accountId) as Array<{
      id: string;
      account_id: string;
      posted_on: string;
      merchant: string;
      amount_cents: number;
      flagged: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      postedOn: row.posted_on,
      merchant: row.merchant,
      amountCents: row.amount_cents,
      flagged: row.flagged === 1,
    }));
  }

  getTxn(id: string): TxnRecord | null {
    const row = this.db.prepare("SELECT * FROM fintech_txns WHERE id = ?").get(id) as
      | { id: string; account_id: string; posted_on: string; merchant: string; amount_cents: number; flagged: number }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.account_id,
      postedOn: row.posted_on,
      merchant: row.merchant,
      amountCents: row.amount_cents,
      flagged: row.flagged === 1,
    };
  }

  insertCase(input: { accountId: string; kind: string; status: string; summary: string; now: Date }): CaseRecord {
    const id = newId("case");
    const stamp = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db
      .prepare("INSERT INTO fintech_cases (id, account_id, kind, status, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, input.accountId, input.kind, input.status, input.summary, stamp);
    const found = this.listCases().find((item) => item.id === id);
    if (!found) throw new Error("Case insert failed");
    return found;
  }

  listCases(): CaseRecord[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, a.name AS account_name FROM fintech_cases c
         JOIN fintech_accounts a ON a.id = c.account_id ORDER BY c.created_at DESC`,
      )
      .all() as Array<Record<string, string>>;
    return rows.map((row) => ({
      id: row.id ?? "",
      accountId: row.account_id ?? "",
      accountName: row.account_name ?? "",
      kind: row.kind ?? "",
      status: row.status ?? "",
      summary: row.summary ?? "",
      createdAt: row.created_at ?? "",
    }));
  }

  audit(action: string, subjectId: string | null, ok: boolean, summary: string, now: Date): void {
    this.db
      .prepare("INSERT INTO fintech_audit (id, action, subject_id, ok, summary, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(newId("aud"), action, subjectId, ok ? 1 : 0, summary, toUtcIso(DateTime.fromJSDate(now, { zone: "utc" })));
  }

  listAudit(): AuditRecord[] {
    const rows = this.db.prepare("SELECT * FROM fintech_audit ORDER BY created_at DESC").all() as Array<{
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
}
