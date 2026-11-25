import type { SqliteDatabase } from "../../db/database.js";
import type { SmsProvider } from "../../sms/provider.js";
import type { CallOutcome } from "../../store/calls.js";
import { CallStore } from "../../store/calls.js";
import { MINI_MIRANDA, WRENLINE, isDeskOpen, money } from "./brand.js";
import { isThreat, maskLast4, maskPhone, namesMatch, normalizeDob, redactSensitive, sensitiveKind } from "./privacy.js";
import { isFintechTool, toolArgSchemas, type FintechToolName } from "./schemas.js";
import { FintechStore } from "./store.js";

export type FintechToolContext = {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
};

const REFUSAL = "I can't take a full card number, CVV, PIN, or password. The last four digits are enough.";
const THIRD_PARTY = "I can only discuss this account with the cardholder. I won't share a balance or a debt with a spouse, relative, or anyone else.";
const CEASE = "This cardholder asked us not to contact them about a debt. I will not discuss the balance or ask for a payment.";
const NO_THREATS = "I can't threaten arrest, a lawsuit, garnishment, or a call to an employer. If you want us to stop calling, say so and I will mark cease-contact.";

type IdentityArgs = { name: string; last4: string; dob?: string; otp?: string; relationship: "self" | "other" };

export async function executeFintechTool(name: string, args: Record<string, unknown>, ctx: FintechToolContext): Promise<unknown> {
  if (!isFintechTool(name)) return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  const store = new FintechStore(ctx.db);
  const blob = JSON.stringify(args);
  const kind = sensitiveKind(blob);
  if (kind) {
    store.audit(name, null, false, `Refused ${kind}. The value was redacted and not stored.`, ctx.now);
    return { ok: false, code: "sensitive", message: REFUSAL };
  }
  if (/\bignore (?:your|all|previous|prior) instructions\b/i.test(blob)) {
    store.audit(name, null, false, "Prompt injection refused. No account opened.", ctx.now);
    return { ok: false, code: "off_topic", message: "I only help with Wrenline cards, disputes, and demo collections. I won't follow that." };
  }
  if (isThreat(blob)) {
    store.audit(name, null, false, "Refused a collection threat.", ctx.now);
    return { ok: false, code: "no_threats", message: NO_THREATS };
  }
  const parsed = toolArgSchemas[name].safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_arguments",
      message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join("; "),
    };
  }
  try {
    return await runTool(name, parsed.data as never, ctx, store);
  } catch {
    return { ok: false, code: "tool_error", message: "I cannot reach the demo ledger right now." };
  }
}

async function runTool(name: FintechToolName, args: Record<string, unknown>, ctx: FintechToolContext, store: FintechStore): Promise<unknown> {
  switch (name) {
    case "verify_identity": {
      const who = identity(store, args as IdentityArgs, ctx);
      if (!who.ok) return who;
      store.audit("verify_identity", who.account.id, true, `Verified ${who.account.name}, card ${maskLast4(who.account.last4)}.`, ctx.now);
      return { ok: true, verified: true, card: maskLast4(who.account.last4), message: `${who.account.name} is verified for card ${maskLast4(who.account.last4)}.` };
    }
    case "lookup_account":
      return lookup(store, args as IdentityArgs, ctx);
    case "card_controls":
      return controls(store, args as IdentityArgs & { action: "freeze" | "unfreeze" }, ctx);
    case "report_lost_stolen":
      return lost(store, args as IdentityArgs, ctx);
    case "list_transactions":
      return transactions(store, args as IdentityArgs, ctx);
    case "dispute_intake":
      return dispute(store, args as IdentityArgs & { txnId: string; amountCents: number; reasonCode: string; note?: string }, ctx);
    case "record_hardship":
      return hardship(store, args as IdentityArgs & { situation: string }, ctx);
    case "promise_to_pay":
      return promise(store, args as IdentityArgs & { amountCents: number; payDate: string }, ctx);
    case "send_payment_link":
      return paymentLink(store, args as IdentityArgs, ctx);
    case "set_cease_contact":
      return cease(store, args as IdentityArgs, ctx);
    case "fraud_alert":
      return fraud(store, args as IdentityArgs & { txnId: string; decision: "yes" | "no" }, ctx);
    case "transfer_to_fraud":
      return transfer(store, ctx, "fraud", (args as { reason: string }).reason);
    case "transfer_to_human":
      return transfer(store, ctx, "human", (args as { reason: string }).reason);
    default:
      return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  }
}

function identity(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext) {
  if (args.relationship !== "self") {
    store.audit("verify_identity", null, false, "Wrong party. No account opened.", ctx.now);
    return { ok: false as const, code: "third_party", verified: false, message: THIRD_PARTY };
  }
  const account = store.findAccount(args.name, args.last4);
  if (!account || !namesMatch(account.name, args.name)) {
    store.audit("verify_identity", null, false, "Name and last four did not match.", ctx.now);
    return { ok: false as const, code: "no_match", verified: false, message: "Those details don't match a Wrenline account. I can't share a balance." };
  }
  const dobOk = Boolean(args.dob && normalizeDob(args.dob) === account.dob);
  const otpOk = Boolean(args.otp && args.otp === account.otpCode);
  if (!dobOk && !otpOk) {
    store.audit("verify_identity", account.id, false, "Second factor did not match. No balance disclosed.", ctx.now);
    return { ok: false as const, code: "not_verified", verified: false, message: "I still need the date of birth or the 4-digit demo code shown in the Wrenline app." };
  }
  return { ok: true as const, account };
}

function lookup(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  const account = who.account;
  store.audit("lookup_account", account.id, true, `Balance read for ${maskLast4(account.last4)}.`, ctx.now);
  if (account.ceaseContact) {
    return { ok: true, card: maskLast4(account.last4), cardStatus: account.cardStatus, ceaseContact: true, message: CEASE };
  }
  const debt = account.pastDueCents > 0 ? `${MINI_MIRANDA} Past due ${money(account.pastDueCents)}.` : "Nothing is past due.";
  return {
    ok: true,
    card: maskLast4(account.last4),
    cardStatus: account.cardStatus,
    balance: money(account.balanceCents),
    pastDue: money(account.pastDueCents),
    ceaseContact: false,
    message: `${account.name}, card ${maskLast4(account.last4)} is ${account.cardStatus}. Available balance ${money(account.balanceCents)}. ${debt}`,
  };
}

function controls(store: FintechStore, args: IdentityArgs & { action: "freeze" | "unfreeze" }, ctx: FintechToolContext) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  const next = args.action === "freeze" ? "frozen" : "open";
  if (who.account.cardStatus === "stolen" && args.action === "unfreeze") {
    store.audit("card_controls", who.account.id, false, "Stolen card cannot be unfrozen. Reissue required.", ctx.now);
    return { ok: false, code: "stolen", message: "That card was reported stolen. I can order a reissue, not turn the old card back on." };
  }
  store.setCard(who.account.id, next);
  store.insertCase({
    accountId: who.account.id,
    kind: args.action,
    status: "done",
    summary: `Card ${maskLast4(who.account.last4)} ${next}.`,
    now: ctx.now,
  });
  store.audit("card_controls", who.account.id, true, `Card ${next}.`, ctx.now);
  return { ok: true, cardStatus: next, message: `Card ${maskLast4(who.account.last4)} is now ${next}.` };
}

function lost(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  store.setCard(who.account.id, "stolen");
  const created = store.insertCase({
    accountId: who.account.id,
    kind: "reissue",
    status: "ordered",
    summary: `Lost or stolen. Card ${maskLast4(who.account.last4)} blocked. Replacement ordered to the address on file. Demo only.`,
    now: ctx.now,
  });
  store.audit("report_lost_stolen", who.account.id, true, "Card blocked and reissue queued.", ctx.now);
  return { ok: true, caseId: created.id, cardStatus: "stolen", message: "I blocked the card and ordered a replacement. I do not need the full number." };
}

function transactions(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  const txns = store.txnsFor(who.account.id).map((txn) => ({
    id: txn.id,
    postedOn: txn.postedOn,
    merchant: txn.merchant,
    amount: money(txn.amountCents),
    flagged: txn.flagged,
  }));
  store.audit("list_transactions", who.account.id, true, `Listed ${txns.length} demo transactions.`, ctx.now);
  return { ok: true, transactions: txns, message: txns.map((txn) => `${txn.postedOn} ${txn.merchant} ${txn.amount}`).join("; ") || "No recent transactions." };
}

function dispute(
  store: FintechStore,
  args: IdentityArgs & { txnId: string; amountCents: number; reasonCode: string; note?: string },
  ctx: FintechToolContext,
) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  const txn = store.getTxn(args.txnId);
  if (!txn || txn.accountId !== who.account.id) {
    store.audit("dispute_intake", who.account.id, false, "Transaction was not on this account.", ctx.now);
    return { ok: false, code: "not_found", message: "I can't find that transaction on the verified account." };
  }
  if (txn.amountCents !== -args.amountCents && txn.amountCents !== args.amountCents) {
    store.audit("dispute_intake", who.account.id, false, "Amount did not match the transaction.", ctx.now);
    return { ok: false, code: "amount_mismatch", message: `That amount doesn't match ${txn.merchant}. The demo charge is ${money(txn.amountCents)}.` };
  }
  const provisional =
    args.reasonCode === "unauthorized"
      ? "Because this is reported as unauthorized, the demo file notes a provisional credit may post within 10 business days while it is reviewed. This is not a real credit."
      : "This is a billing-error style dispute. No provisional credit is noted for this reason code. This is not a real investigation.";
  const created = store.insertCase({
    accountId: who.account.id,
    kind: "dispute",
    status: "open",
    summary: `${txn.merchant} ${money(txn.amountCents)} reason ${args.reasonCode}. ${provisional}`,
    now: ctx.now,
  });
  store.audit("dispute_intake", who.account.id, true, `Dispute ${created.id} opened. Reason ${args.reasonCode}.`, ctx.now);
  return { ok: true, caseId: created.id, provisionalCredit: args.reasonCode === "unauthorized", message: `Dispute opened for ${txn.merchant}. ${provisional}` };
}

function hardship(store: FintechStore, args: IdentityArgs & { situation: string }, ctx: FintechToolContext) {
  const who = debtAccount(store, args, ctx, "record_hardship");
  if (!who.ok) return who;
  const created = store.insertCase({
    accountId: who.account.id,
    kind: "hardship",
    status: "open",
    summary: `Hardship noted. Options offered: a smaller promise-to-pay, or a date within 30 days. No fees invented. ${redactSensitive(args.situation).slice(0, 140)}`,
    now: ctx.now,
  });
  store.audit("record_hardship", who.account.id, true, "Hardship options offered. No threat.", ctx.now);
  return {
    ok: true,
    caseId: created.id,
    message: `${MINI_MIRANDA} I can note a hardship. Options are a smaller promise-to-pay or a new date within 30 days. I can't waive a real balance because this demo has none.`,
  };
}

function promise(store: FintechStore, args: IdentityArgs & { amountCents: number; payDate: string }, ctx: FintechToolContext) {
  const who = debtAccount(store, args, ctx, "promise_to_pay");
  if (!who.ok) return who;
  if (args.amountCents > who.account.pastDueCents) {
    return { ok: false, code: "amount_too_high", message: `A promise can't be more than the past-due demo amount of ${money(who.account.pastDueCents)}.` };
  }
  const created = store.insertCase({
    accountId: who.account.id,
    kind: "promise",
    status: "open",
    summary: `Promise to pay ${money(args.amountCents)} on ${args.payDate}. Not a real payment.`,
    now: ctx.now,
  });
  store.audit("promise_to_pay", who.account.id, true, `Promise ${money(args.amountCents)} on ${args.payDate}.`, ctx.now);
  return { ok: true, caseId: created.id, message: `${MINI_MIRANDA} I noted a promise to pay ${money(args.amountCents)} on ${args.payDate}. Nothing is charged.` };
}

async function paymentLink(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext) {
  const who = debtAccount(store, args, ctx, "send_payment_link");
  if (!who.ok) return who;
  const url = `https://demo.wrenline.invalid/pay/${who.account.last4}`;
  await ctx.sms.send({
    verticalId: "fintech",
    kind: "dispatch",
    to: who.account.phone,
    from: WRENLINE.phoneE164,
    body: `${WRENLINE.name} (demo): payment link ${url}. This link does not charge a card and is not a real payment page. ${MINI_MIRANDA}`,
    relatedType: "account",
    relatedId: who.account.id,
  });
  store.audit("send_payment_link", who.account.id, true, "Demo payment link queued. No charge.", ctx.now);
  return { ok: true, message: "I queued a demo text with a payment link. It does not charge a real card." };
}

function cease(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  store.setCease(who.account.id, true);
  store.insertCase({
    accountId: who.account.id,
    kind: "cease_contact",
    status: "done",
    summary: "Cease-contact recorded. No further debt discussion.",
    now: ctx.now,
  });
  store.audit("set_cease_contact", who.account.id, true, "Cease-contact set.", ctx.now);
  return { ok: true, message: "I marked cease-contact. I will not discuss the debt or ask for a payment on this demo account." };
}

function fraud(store: FintechStore, args: IdentityArgs & { txnId: string; decision: "yes" | "no" }, ctx: FintechToolContext) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  const txn = store.getTxn(args.txnId);
  if (!txn || txn.accountId !== who.account.id) {
    return { ok: false, code: "not_found", message: "I can't find that alert on the verified account." };
  }
  if (args.decision === "yes") {
    store.audit("fraud_alert", who.account.id, true, `Cardholder confirmed ${txn.merchant}.`, ctx.now);
    return { ok: true, confirmed: true, message: `You confirmed ${txn.merchant} ${money(txn.amountCents)}. I won't open a fraud case.` };
  }
  const created = store.insertCase({
    accountId: who.account.id,
    kind: "fraud",
    status: "open",
    summary: `Cardholder did not recognize ${txn.merchant} ${money(txn.amountCents)}.`,
    now: ctx.now,
  });
  store.audit("fraud_alert", who.account.id, true, "Unrecognized charge. Fraud case opened.", ctx.now);
  return {
    ok: true,
    confirmed: false,
    caseId: created.id,
    message: `I opened a fraud case for ${txn.merchant}. I can freeze the card or transfer you to the fraud desk. This demo does not dial.`,
  };
}

function transfer(store: FintechStore, ctx: FintechToolContext, desk: "fraud" | "human", reason: string) {
  if (/\b(joke|poem|football|weather)\b/i.test(reason)) {
    store.audit("transfer_to_human", null, false, "Off-topic transfer refused.", ctx.now);
    return { ok: false, code: "off_topic", message: "I only help with Wrenline cards and demo collections." };
  }
  const closed = !isDeskOpen(ctx.now);
  const destination = desk === "fraud" ? WRENLINE.fraudE164 : WRENLINE.phoneE164;
  const label = desk === "fraud" ? "fraud specialist" : "support desk";
  store.audit(desk === "fraud" ? "transfer_to_fraud" : "transfer_to_human", null, true, `Transfer to ${label}.`, ctx.now);
  return {
    ok: true,
    transfer: true,
    destination,
    afterHours: closed,
    message: `Warm transfer to the ${label} at ${maskPhone(destination)}. ${closed ? "The desk is closed, so this is the after-hours path." : ""} This demo does not place the call.`,
  };
}

function debtAccount(store: FintechStore, args: IdentityArgs, ctx: FintechToolContext, action: string) {
  const who = identity(store, args, ctx);
  if (!who.ok) return who;
  if (who.account.ceaseContact) {
    store.audit(action, who.account.id, false, "Blocked by cease-contact.", ctx.now);
    return { ok: false as const, code: "cease_contact", message: CEASE };
  }
  if (who.account.pastDueCents <= 0 && action !== "record_hardship") {
    store.audit(action, who.account.id, false, "No past-due demo balance.", ctx.now);
    return { ok: false as const, code: "not_past_due", message: "This demo account is not past due, so I won't run a collections script." };
  }
  return who;
}

export async function simulateReminder(ctx: FintechToolContext, accountId: string): Promise<{ ok: true; callId: string } | { ok: false; message: string }> {
  const store = new FintechStore(ctx.db);
  const account = store.getAccount(accountId);
  if (!account) return { ok: false, message: "No such demo account." };
  if (account.ceaseContact) return { ok: false, message: "That account is cease-contact. The reminder was not started." };
  const script = `${MINI_MIRANDA} Hello ${account.name}. Wrenline's demo ledger shows ${money(account.pastDueCents)} past due on card ${maskLast4(account.last4)}. I can take a promise-to-pay or text a link that does not charge a card.`;
  const call = new CallStore(ctx.db).ensure({
    verticalId: "fintech",
    vapiCallId: `reminder_${account.id}_${ctx.now.getTime()}`,
    callerName: account.name,
    callerNumber: account.phone,
    afterHours: !isDeskOpen(ctx.now),
    now: ctx.now,
    outcome: "serviced",
    status: "completed",
    summary: "Simulated outbound payment reminder. Mini-Miranda included. No real call was placed.",
    transcript: `Agent: ${script}`,
    endedReason: "assistant-ended-call",
  });
  await ctx.sms.send({
    verticalId: "fintech",
    kind: "dispatch",
    to: account.phone,
    from: WRENLINE.phoneE164,
    body: `${WRENLINE.name} reminder (demo): ${money(account.pastDueCents)} past due. Link https://demo.wrenline.invalid/pay/${account.last4} does not charge a card.`,
    relatedType: "call",
    relatedId: call.id,
  });
  store.audit("outbound_reminder", account.id, true, "Simulated outbound reminder. Mini-Miranda included.", ctx.now);
  return { ok: true, callId: call.id };
}

export function fintechOutcome(name: string, result: unknown): CallOutcome | null {
  const body = result as { ok?: boolean; code?: string };
  if (!body.ok && (body.code === "sensitive" || body.code === "third_party" || body.code === "cease_contact" || body.code === "no_threats")) return "refused";
  if (!body.ok && body.code === "off_topic") return "off_topic";
  if (body.ok && (name === "transfer_to_fraud" || name === "transfer_to_human")) return "transferred";
  if (body.ok && name === "send_payment_link") return "text_back";
  if (
    body.ok &&
    ["card_controls", "report_lost_stolen", "dispute_intake", "record_hardship", "promise_to_pay", "set_cease_contact", "fraud_alert"].includes(name)
  ) {
    return "serviced";
  }
  return null;
}

export function fintechCaller(_name: string, args: Record<string, unknown>): { name?: string; phone?: string } {
  return { name: typeof args.name === "string" ? args.name : undefined };
}
