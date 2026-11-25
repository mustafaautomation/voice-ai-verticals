import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { toUtcIso } from "../../platform/time.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { WRENLINE, money } from "./brand.js";
import { maskLast4, redactSensitive } from "./privacy.js";
import { FintechStore } from "./store.js";

export function seedFintechFixtures(db: SqliteDatabase, now: Date): void {
  const store = new FintechStore(db);
  if (store.countAccounts() > 0) return;
  const stamp = toUtcIso(DateTime.fromJSDate(now, { zone: "utc" }));
  store.insertAccount({
    id: "acct_maya",
    name: "Maya Chen",
    dob: "1984-03-14",
    last4: "4412",
    phone: "512-555-0141",
    balanceCents: 24000,
    pastDueCents: 18640,
    otpCode: "2468",
    createdAt: stamp,
  });
  store.insertAccount({
    id: "acct_andre",
    name: "Andre Brooks",
    dob: "1972-11-02",
    last4: "2208",
    phone: "512-555-0142",
    balanceCents: 50000,
    pastDueCents: 0,
    otpCode: "1357",
    createdAt: stamp,
  });
  store.insertAccount({
    id: "acct_priya",
    name: "Priya Shah",
    dob: "1991-07-19",
    last4: "7731",
    phone: "512-555-0143",
    balanceCents: 1200,
    pastDueCents: 9000,
    ceaseContact: true,
    otpCode: "9090",
    createdAt: stamp,
  });
  store.insertTxn({ id: "txn_grocery", accountId: "acct_maya", postedOn: "2026-11-28", merchant: "Quill Grocery", amountCents: -4280 });
  store.insertTxn({ id: "txn_night", accountId: "acct_maya", postedOn: "2026-11-29", merchant: "Night Market", amountCents: -8620, flagged: true });
  store.insertTxn({ id: "txn_transit", accountId: "acct_andre", postedOn: "2026-11-20", merchant: "Lakeshore Transit", amountCents: -350 });
}

export function seedFintechDesk(db: SqliteDatabase, now: Date): void {
  seedFintechFixtures(db, now);
  const calls = new CallStore(db);
  if (calls.list("fintech").length > 0) return;
  const store = new FintechStore(db);
  const stamp = (hoursAgo: number) => toUtcIso(DateTime.fromJSDate(now, { zone: "utc" }).minus({ hours: hoursAgo }));
  calls.ensure({
    id: "call_fin_maya",
    verticalId: "fintech",
    vapiCallId: "seed_fin_maya",
    callerName: "Maya Chen",
    callerNumber: "+15125550141",
    afterHours: false,
    now: new Date(stamp(5)),
    outcome: "serviced",
    status: "completed",
    summary: "Verified with last four and opened a dispute. Full card number was not collected.",
    transcript: redactSensitive(
      "Caller: I'm Maya Chen, last four 4412, born 1984-03-14. My number is 512-555-0141. Please dispute Quill Grocery.\nAgent: You are verified. I opened a dispute. I will not repeat a full card number.",
    ),
  });
  calls.ensure({
    id: "call_fin_wife",
    verticalId: "fintech",
    vapiCallId: "seed_fin_wife",
    callerName: "Caller",
    callerNumber: "+15125550199",
    afterHours: false,
    now: new Date(stamp(3)),
    outcome: "refused",
    status: "completed",
    summary: "Wrong party. No balance discussed.",
    transcript: "Caller: I'm his wife. What's the balance?\nAgent: I can only discuss the account with the cardholder.",
  });
  store.insertCase({
    accountId: "acct_maya",
    kind: "dispute",
    status: "open",
    summary: `Quill Grocery ${money(-4280)} reason unauthorized. Provisional credit noted for the demo file only.`,
    now: new Date(stamp(5)),
  });
  store.audit("verify_identity", "acct_maya", true, `Verified Maya Chen, card ${maskLast4("4412")}.`, new Date(stamp(5)));
  store.audit("dispute_intake", "acct_maya", true, "Dispute opened. Reason unauthorized.", new Date(stamp(5)));
  store.audit("verify_identity", null, false, "Wrong party. No account opened.", new Date(stamp(3)));
  new SmsStore(db).insert({
    id: "sms_fin_link",
    provider: "mock",
    fromNumber: WRENLINE.phoneE164,
    status: "queued",
    createdAt: stamp(4),
    message: {
      verticalId: "fintech",
      kind: "dispatch",
      to: "+15125550141",
      body: `${WRENLINE.name} (demo): payment link https://demo.wrenline.invalid/pay/4412 does not charge a card.`,
      relatedType: "account",
      relatedId: "acct_maya",
    },
  });
}
