import type { SqliteDatabase } from "../../db/database.js";
import { phoneDigits } from "../../platform/phone.js";
import type { SmsProvider } from "../../sms/provider.js";
import type { CallOutcome } from "../../store/calls.js";
import { attorneyById, FIRM, PRACTICE_LABELS, isDeskOpen, solFlag } from "./brand.js";
import { adviceScript, custodyScript, dangerScript, redactSsn, referralScript, screenInquiry } from "./screen.js";
import { listConsults, noticeOk, slotOk } from "./schedule.js";
import { isLegalTool, toolArgSchemas, type LegalToolName } from "./schemas.js";
import { LegalStore } from "./store.js";

export type LegalToolContext = {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
};

const NO_RELATIONSHIP = "Speaking with me does not create an attorney-client relationship, and I can't give legal advice.";

export async function executeLegalTool(name: string, args: Record<string, unknown>, ctx: LegalToolContext): Promise<unknown> {
  if (!isLegalTool(name)) return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  const store = new LegalStore(ctx.db);
  const blob = JSON.stringify(args);
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(blob)) {
    store.audit(name, null, false, "Social Security number refused and redacted.", ctx.now);
    return { ok: false, code: "sensitive", message: "Don't tell me a Social Security number. I don't need it for intake." };
  }
  const parsed = toolArgSchemas[name].safeParse(args);
  if (!parsed.success) {
    return { ok: false, code: "invalid_arguments", message: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  try {
    return await run(name, parsed.data as never, ctx, store);
  } catch {
    return { ok: false, code: "tool_error", message: "I can't reach the intake desk right now." };
  }
}

async function run(name: LegalToolName, args: Record<string, unknown>, ctx: LegalToolContext, store: LegalStore): Promise<unknown> {
  switch (name) {
    case "screen_inquiry":
      return screen(store, args as { description: string; role: "client" | "opposing" | "other" }, ctx);
    case "conflict_check":
      return conflict(store, args as { callerName: string; opposingParty: string; role: "client" | "opposing" | "other" }, ctx);
    case "open_matter":
      return openMatter(store, args as never, ctx);
    case "check_consults":
      return consults(store, args as { practice: string; days?: number }, ctx);
    case "book_consult":
      return book(store, args as { matterId: string; attorneyId: string; start: string; consultType: "free" | "paid" }, ctx);
    case "reschedule_consult":
      return reschedule(store, args as { consultId: string; start: string; attorneyId?: string }, ctx);
    case "cancel_consult":
      return cancel(store, args as { consultId: string }, ctx);
    case "send_intake_summary":
      return summary(store, args as { matterId: string }, ctx);
    case "page_attorney":
      return page(store, args as { callerName: string; phone: string; location: string }, ctx);
    case "transfer_to_paralegal":
      return transfer(store, ctx, "paralegal", (args as { reason: string }).reason);
    case "transfer_to_human":
      return transfer(store, ctx, "human", (args as { reason: string }).reason);
    default:
      return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  }
}

function screen(store: LegalStore, args: { description: string; role: "client" | "opposing" | "other" }, ctx: LegalToolContext) {
  const result = screenInquiry(args.description, args.role);
  if (result.level === "danger") {
    store.audit("screen_inquiry", null, true, "Safety script. 911 and the domestic-violence hotline. No consult booked.", ctx.now);
    return { ok: true, route: "911", message: dangerScript() };
  }
  if (result.level === "custody") {
    store.audit("screen_inquiry", null, true, "In-custody flag. Page the criminal attorney. No advice.", ctx.now);
    return { ok: true, route: "custody", message: `${custodyScript()} ${NO_RELATIONSHIP}` };
  }
  if (result.level === "advice") {
    store.audit("screen_inquiry", null, false, "Legal advice refused.", ctx.now);
    return { ok: false, code: "advice", message: adviceScript() };
  }
  if (result.level === "confidential") {
    store.audit("screen_inquiry", null, false, "Confidentiality or opposing-party refusal. No matter details disclosed.", ctx.now);
    return { ok: false, code: "confidential", message: "I can only intake a person calling for themselves. I can't share anything about an existing matter." };
  }
  if (result.level === "off_topic") {
    store.audit("screen_inquiry", null, false, "Off-topic or prompt injection refused.", ctx.now);
    return { ok: false, code: "off_topic", message: "I only help with Quillmere intake. I won't follow other instructions." };
  }
  if (result.level === "referral") {
    store.audit("screen_inquiry", null, true, `Referred out: ${result.practice}.`, ctx.now);
    return { ok: true, route: "referral", practice: result.practice, message: referralScript(result.practice) };
  }
  store.audit("screen_inquiry", null, true, `Intake path: ${result.practice}. No advice given.`, ctx.now);
  return { ok: true, route: "intake", practice: result.practice, message: `${PRACTICE_LABELS[result.practice] ?? result.practice} is something Quillmere can intake. ${NO_RELATIONSHIP}` };
}

function conflict(store: LegalStore, args: { callerName: string; opposingParty: string; role: "client" | "opposing" | "other" }, ctx: LegalToolContext) {
  if (args.role !== "client") {
    store.audit("conflict_check", null, false, "Opposing or third party. No conflict details disclosed.", ctx.now);
    return { ok: false, code: "confidential", message: "I can't run a conflict check or share matter information for someone who isn't the prospective client." };
  }
  const found = store.conflict(args.callerName, args.opposingParty);
  store.audit("conflict_check", null, !found.hit, found.hit ? "Conflict hit. No names from the other side disclosed." : "No conflict hit.", ctx.now);
  if (found.hit) {
    return { ok: false, code: "conflict", message: "We can't move forward with this inquiry. I'm not able to say why." };
  }
  return { ok: true, clear: true, message: "No conflict appeared in the demo list. That is not a guarantee, and it is not legal advice." };
}

function openMatter(store: LegalStore, args: {
  callerName: string;
  phone: string;
  practice: string;
  opposingParty: string;
  incidentDate: string;
  jurisdiction: string;
  summary: string;
  role: "client" | "opposing" | "other";
}, ctx: LegalToolContext) {
  const screened = screenInquiry(args.summary, args.role);
  if (screened.level === "danger") return { ok: false, code: "danger", message: dangerScript() };
  if (screened.level === "advice") return { ok: false, code: "advice", message: adviceScript() };
  if (screened.level === "confidential" || args.role !== "client") {
    store.audit("open_matter", null, false, "Refused intake for a non-client.", ctx.now);
    return { ok: false, code: "confidential", message: "I can only open an intake for the person seeking counsel for themselves." };
  }
  if (screened.level === "referral") return { ok: false, code: "referral", message: referralScript(screened.practice) };
  if (phoneDigits(args.phone).length < 10) return { ok: false, code: "invalid_arguments", message: "I need a 10-digit callback number. Use a 555 number in this demo." };
  const hit = store.conflict(args.callerName, args.opposingParty);
  if (hit.hit) {
    store.audit("open_matter", null, false, "Conflict hit. Matter not opened. No adverse details stored in the reply.", ctx.now);
    return { ok: false, code: "conflict", message: "We can't move forward with this inquiry. I'm not able to say why." };
  }
  const sol = solFlag(args.practice, args.incidentDate, ctx.now);
  const matter = store.insertMatter({
    callerName: args.callerName,
    phone: args.phone,
    practice: args.practice,
    opposing: args.opposingParty,
    incidentDate: args.incidentDate,
    jurisdiction: args.jurisdiction,
    summary: redactSsn(args.summary),
    status: sol.urgent || screened.level === "custody" ? "priority" : "new",
    urgent: sol.urgent || screened.level === "custody",
    now: ctx.now,
  });
  store.audit("open_matter", matter.id, true, `${matter.practice} intake. Urgent screening: ${matter.urgent}. No advice given.`, ctx.now);
  return { ok: true, matterId: matter.id, urgent: matter.urgent, message: `Intake ${matter.id} is open for ${PRACTICE_LABELS[args.practice] ?? args.practice}. ${sol.note} ${NO_RELATIONSHIP}` };
}

function consults(store: LegalStore, args: { practice: string; days?: number }, ctx: LegalToolContext) {
  const slots = listConsults(ctx.now, args.practice, store.busy(), args.days ?? 7);
  store.audit("check_consults", null, true, `Listed ${slots.length} consults for ${args.practice}.`, ctx.now);
  return {
    ok: true,
    slots,
    message: slots.length ? `Open consults: ${slots.map((slot) => slot.label).join("; ")}. A free consult is 30 minutes. A paid consult is the same length in this demo and is not charged.` : "No consults in that range.",
  };
}

function book(store: LegalStore, args: { matterId: string; attorneyId: string; start: string; consultType: "free" | "paid" }, ctx: LegalToolContext) {
  const matter = store.getMatter(args.matterId);
  const attorney = attorneyById(args.attorneyId);
  if (!matter) return { ok: false, code: "not_found", message: "I can't find that intake." };
  if (!attorney || !attorney.practices.includes(matter.practice)) {
    return { ok: false, code: "no_attorney", message: "That lawyer does not take this kind of matter." };
  }
  const slot = slotOk(ctx.now, attorney, args.start, store.busy());
  if (!slot.ok) return slot;
  const consult = store.insertConsult({ matterId: matter.id, attorneyId: attorney.id, consultType: args.consultType, startsAt: slot.start, endsAt: slot.end, now: ctx.now });
  const fee = args.consultType === "paid" ? "The demo lists a $250 consult fee. Nothing is charged." : "This consult is marked free. Nothing is charged.";
  store.audit("book_consult", matter.id, true, `Consult ${consult.id} with ${attorney.name}. ${args.consultType}.`, ctx.now);
  return { ok: true, consultId: consult.id, message: `Booked ${slot.label}. ${fee} ${NO_RELATIONSHIP}` };
}

function reschedule(store: LegalStore, args: { consultId: string; start: string; attorneyId?: string }, ctx: LegalToolContext) {
  const consult = store.getConsult(args.consultId);
  if (!consult || consult.status !== "scheduled") return { ok: false, code: "not_found", message: "I can't find that consult." };
  const gate = noticeOk(consult.startsAt, ctx.now);
  if (!gate.ok) return gate;
  const attorney = attorneyById(args.attorneyId ?? consult.attorneyId);
  if (!attorney) return { ok: false, code: "no_attorney", message: "I can't find that lawyer." };
  const busy = store.busy().filter((item) => item.start !== consult.startsAt);
  const slot = slotOk(ctx.now, attorney, args.start, busy, consult.startsAt);
  if (!slot.ok) return slot;
  store.moveConsult(consult.id, attorney.id, slot.start, slot.end, ctx.now);
  store.audit("reschedule_consult", consult.id, true, `Moved to ${slot.label}.`, ctx.now);
  return { ok: true, message: `Moved to ${slot.label}.` };
}

function cancel(store: LegalStore, args: { consultId: string }, ctx: LegalToolContext) {
  const consult = store.getConsult(args.consultId);
  if (!consult || consult.status !== "scheduled") return { ok: false, code: "not_found", message: "I can't find that consult." };
  const gate = noticeOk(consult.startsAt, ctx.now);
  if (!gate.ok) return gate;
  store.cancelConsult(consult.id, ctx.now);
  store.audit("cancel_consult", consult.id, true, "Consult cancelled.", ctx.now);
  return { ok: true, message: `Cancelled consult ${consult.id}. No engagement was formed.` };
}

async function summary(store: LegalStore, args: { matterId: string }, ctx: LegalToolContext) {
  const matter = store.getMatter(args.matterId);
  if (!matter) return { ok: false, code: "not_found", message: "I can't find that intake." };
  const url = `https://demo.quillmere.invalid/engage/${matter.id}`;
  await ctx.sms.send({
    verticalId: "legal",
    kind: "confirmation",
    to: matter.phone,
    from: FIRM.phoneE164,
    body: `${FIRM.name} (demo): intake summary for ${matter.callerName}, ${PRACTICE_LABELS[matter.practice] ?? matter.practice}. Engagement link ${url} does not hire the firm. ${NO_RELATIONSHIP}`,
    relatedType: "matter",
    relatedId: matter.id,
  });
  store.audit("send_intake_summary", matter.id, true, "Intake text queued. Link does not create an engagement.", ctx.now);
  return { ok: true, message: "I queued a text with the intake summary and a demo engagement link. The link does not hire the firm." };
}

async function page(store: LegalStore, args: { callerName: string; phone: string; location: string }, ctx: LegalToolContext) {
  const matter = store.insertMatter({
    callerName: args.callerName,
    phone: args.phone,
    practice: "criminal",
    opposing: "",
    incidentDate: "",
    jurisdiction: args.location,
    summary: "In-custody page. Facts of the case were not taken.",
    status: "urgent",
    urgent: true,
    now: ctx.now,
  });
  await ctx.sms.send({
    verticalId: "legal",
    kind: "dispatch",
    to: FIRM.urgentE164,
    from: FIRM.phoneE164,
    body: `${FIRM.name} on-call (demo): in-custody intake ${matter.id} for ${args.callerName} at ${args.location}. No case facts included. Not a real page.`,
    relatedType: "matter",
    relatedId: matter.id,
  });
  store.audit("page_attorney", matter.id, true, "On-call criminal attorney texted. No advice and no case facts.", ctx.now);
  return { ok: true, matterId: matter.id, message: `${custodyScript()} I texted the on-call demo line ${FIRM.urgentDisplay}. This does not place a real call.` };
}

function transfer(store: LegalStore, ctx: LegalToolContext, who: "paralegal" | "human", reason: string) {
  if (/\b(joke|poem|football)\b/i.test(reason)) {
    store.audit("transfer", null, false, "Off-topic transfer refused.", ctx.now);
    return { ok: false, code: "off_topic", message: "I only help with Quillmere intake." };
  }
  const destination = who === "paralegal" ? FIRM.paralegalE164 : FIRM.phoneE164;
  const label = who === "paralegal" ? "a paralegal" : "the intake desk";
  store.audit(who === "paralegal" ? "transfer_to_paralegal" : "transfer_to_human", null, true, `Transfer to ${label}.`, ctx.now);
  return {
    ok: true,
    transfer: true,
    destination,
    afterHours: !isDeskOpen(ctx.now),
    message: `I can transfer you to ${label}. This demo does not dial. ${NO_RELATIONSHIP}`,
  };
}

export function legalOutcome(name: string, result: unknown): CallOutcome | null {
  const body = result as { ok?: boolean; code?: string; route?: string };
  if (!body.ok && (body.code === "advice" || body.code === "conflict" || body.code === "confidential" || body.code === "sensitive")) return "refused";
  if (!body.ok && body.code === "off_topic") return "off_topic";
  if (body.ok && body.route === "911") return "escalated";
  if (body.ok && body.route === "referral") return "serviced";
  if (body.ok && (body.route === "custody" || name === "page_attorney")) return "escalated";
  if (body.ok && (name === "transfer_to_paralegal" || name === "transfer_to_human")) return "transferred";
  if (body.ok && name === "send_intake_summary") return "text_back";
  if (body.ok && ["open_matter", "book_consult", "reschedule_consult", "cancel_consult", "conflict_check"].includes(name)) return "serviced";
  return null;
}

export function legalCaller(_name: string, args: Record<string, unknown>): { name?: string; phone?: string } {
  const name = typeof args.callerName === "string" ? args.callerName : undefined;
  const phone = typeof args.phone === "string" ? args.phone : undefined;
  return { name, phone };
}
