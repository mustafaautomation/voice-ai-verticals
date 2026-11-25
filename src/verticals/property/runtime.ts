import type { SqliteDatabase } from "../../db/database.js";
import { phoneDigits } from "../../platform/phone.js";
import type { SmsProvider } from "../../sms/provider.js";
import type { CallOutcome } from "../../store/calls.js";
import { FIRM, UNITS, buildingById, isDeskOpen, money, unitById } from "./brand.js";
import { listTours, noticeOk, slotOk } from "./schedule.js";
import { classifyIssue, floodScript, gasScript, heatScript, lockScript, sensitiveKind } from "./triage.js";
import { isPropertyTool, toolArgSchemas, type PropertyToolName } from "./schemas.js";
import { PropertyStore, type Tenant } from "./store.js";

export type PropertyToolContext = {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
};

type Who = { name: string; unit: string; dob: string; portalCode: string; relationship: "self" | "other" };

export async function executePropertyTool(name: string, args: Record<string, unknown>, ctx: PropertyToolContext): Promise<unknown> {
  if (!isPropertyTool(name)) return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  if (sensitiveKind(JSON.stringify(args))) return { ok: false, code: "sensitive", message: "Don't tell me a card number, routing number, or password. Rent is paid in the portal, and this demo does not charge anything." };
  const parsed = toolArgSchemas[name].safeParse(args);
  if (!parsed.success) return { ok: false, code: "invalid_arguments", message: "I need a name, a unit, and either a date of birth or the 4-digit portal code." };
  try {
    return await run(name, parsed.data as never, ctx, new PropertyStore(ctx.db));
  } catch {
    return { ok: false, code: "tool_error", message: "The office book is not answering right now." };
  }
}

async function run(name: PropertyToolName, args: Record<string, unknown>, ctx: PropertyToolContext, store: PropertyStore): Promise<unknown> {
  switch (name) {
    case "screen_issue":
      return screen(args as { description: string });
    case "verify_tenant":
      return verify(store, args as Who);
    case "open_ticket":
      return ticket(store, args as Who & { description: string }, ctx);
    case "list_units":
      return units(args as { beds?: number });
    case "check_tours":
      return tours(store, args as { unitId: string; days?: number }, ctx);
    case "book_tour":
      return book(store, args as { prospectName: string; phone: string; unitId: string; start: string }, ctx);
    case "reschedule_tour":
      return move(store, args as { tourId: string; start: string }, ctx);
    case "cancel_tour":
      return cancel(store, args as { tourId: string }, ctx);
    case "rent_faq":
      return faq(store, args as Who & { question: string });
    case "send_portal_link":
      return link(store, args as Who, ctx);
    case "transfer_to_leasing":
      return transfer(args as { reason: string }, ctx);
    default:
      return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  }
}

function screen(args: { description: string }) {
  const issue = classifyIssue(args.description);
  if (issue === "off_topic") return { ok: false, code: "off_topic", message: "I only help with Bramblefen maintenance, tours, and portal questions." };
  if (issue === "gas") return { ok: true, route: "911", message: gasScript() };
  if (issue === "flood") return { ok: true, route: "emergency", message: floodScript() };
  if (issue === "heat") return { ok: true, route: "emergency", message: heatScript() };
  if (issue === "lockout") return { ok: true, route: "lockout", transfer: true, message: lockScript() };
  return { ok: true, route: "routine", message: "That can be a routine ticket for the next office day. I still need to match the resident first." };
}

function verify(store: PropertyStore, args: Who): { ok: true; unitId: string; building: string; message: string } | { ok: false; code: string; message: string } {
  if (args.relationship !== "self") return { ok: false, code: "third_party", message: "I can only look up a unit for the resident. I can't share who else lives here." };
  const tenant = store.matchTenant(args.name, args.unit, args.dob, args.portalCode);
  if (!tenant) return { ok: false, code: "not_verified", message: "I can't match that name and unit. I won't guess who lives there." };
  const home = unitById(tenant.unitId);
  const building = home ? buildingById(home.buildingId) : undefined;
  return { ok: true, unitId: tenant.unitId, building: building?.name ?? "", message: `Matched ${tenant.name} at ${tenant.unitId}${building ? `, ${building.name}` : ""}.` };
}

async function ticket(store: PropertyStore, args: Who & { description: string }, ctx: PropertyToolContext) {
  const issue = classifyIssue(args.description);
  if (issue === "off_topic") return { ok: false, code: "off_topic", message: "I only help with Bramblefen maintenance, tours, and portal questions." };
  if (issue === "gas") {
    await page(ctx, "gas", args.unit || "unknown unit", "Caller was told to leave and call 911. No routine visit.");
    const row = store.insertTicket({ callerName: args.name || "Unknown", unitId: args.unit || "", category: "gas", priority: "emergency", summary: "Gas or CO. Caller told to leave and call 911.", status: "safety", now: ctx.now });
    return { ok: true, route: "911", ticketId: row.id, message: gasScript() };
  }
  const who = verify(store, args);
  if (!who.ok) return who;
  if (issue === "flood" || issue === "heat" || issue === "lockout") {
    const script = issue === "flood" ? floodScript() : issue === "heat" ? heatScript() : lockScript();
    await page(ctx, issue, who.unitId, script);
    const row = store.insertTicket({
      callerName: args.name,
      unitId: who.unitId,
      category: issue,
      priority: "emergency",
      summary: args.description.slice(0, 240),
      status: issue === "lockout" ? "on_call" : "emergency",
      now: ctx.now,
    });
    return { ok: true, route: issue === "lockout" ? "lockout" : "emergency", transfer: issue === "lockout", ticketId: row.id, message: `${script} Ticket ${row.id} is on the board.` };
  }
  const row = store.insertTicket({
    callerName: args.name,
    unitId: who.unitId,
    category: "routine",
    priority: "routine",
    summary: args.description.slice(0, 240),
    status: "queued",
    now: ctx.now,
  });
  const when = isDeskOpen(ctx.now) ? "The office has it for a routine visit." : "The office is closed. This waits for the next weekday.";
  return { ok: true, ticketId: row.id, message: `Routine ticket ${row.id} for ${who.unitId}. ${when} Nothing is charged.` };
}

async function page(ctx: PropertyToolContext, kind: string, unit: string, note: string): Promise<void> {
  await ctx.sms.send({
    verticalId: "property",
    kind: "dispatch",
    to: FIRM.onCallE164,
    from: FIRM.phoneE164,
    body: `${FIRM.name} on-call (demo): ${kind} at ${unit}. ${note} Not a real page.`,
    relatedType: "ticket",
    relatedId: unit,
  });
}

function units(args: { beds?: number }) {
  const open = UNITS.filter((unit) => unit.vacant && (args.beds === undefined || unit.beds === args.beds));
  if (!open.length) return { ok: false, code: "none", message: "No vacant demo units match that." };
  const lines = open.map((unit) => {
    const building = buildingById(unit.buildingId);
    return `${unit.id} at ${building?.name ?? unit.buildingId}, ${unit.beds} bed, listed ${money(unit.listedRentCents ?? 0)} (not a charge)`;
  });
  return { ok: true, units: open.map((unit) => unit.id), message: lines.join("; ") };
}

function tours(store: PropertyStore, args: { unitId: string; days?: number }, ctx: PropertyToolContext) {
  const unit = unitById(args.unitId);
  if (!unit) return { ok: false, code: "unknown_unit", message: "I don't have that unit." };
  if (!unit.vacant) return { ok: false, code: "occupied", message: "That unit is not on the tour list. I won't say who lives there." };
  const busy = store.listTours().filter((tour) => tour.status === "scheduled").map((tour) => ({ start: tour.startsAt }));
  const openings = listTours(ctx.now, busy, args.days ?? 5);
  return { ok: true, openings, message: openings.length ? `Open tours for ${unit.id}: ${openings.map((item) => item.label).join("; ")}.` : "No tour times in that range." };
}

function book(store: PropertyStore, args: { prospectName: string; phone: string; unitId: string; start: string }, ctx: PropertyToolContext) {
  if (phoneDigits(args.phone).length < 10) return { ok: false, code: "invalid_arguments", message: "I need a 10-digit callback number. Use a 555 number in this demo." };
  const unit = unitById(args.unitId);
  if (!unit) return { ok: false, code: "unknown_unit", message: "I don't have that unit." };
  if (!unit.vacant) return { ok: false, code: "occupied", message: "That unit is not available to tour." };
  const busy = store.listTours().filter((tour) => tour.status === "scheduled").map((tour) => ({ start: tour.startsAt }));
  const slot = slotOk(ctx.now, args.start, busy);
  if (!slot.ok) return slot;
  const tour = store.insertTour({ prospectName: args.prospectName, phone: args.phone, unitId: unit.id, startsAt: slot.start, endsAt: slot.end, now: ctx.now });
  const building = buildingById(unit.buildingId);
  return { ok: true, tourId: tour.id, message: `Booked ${slot.label} at ${unit.id}, ${building?.name ?? ""}. Listed rent ${money(unit.listedRentCents ?? 0)} is not a charge.` };
}

function move(store: PropertyStore, args: { tourId: string; start: string }, ctx: PropertyToolContext) {
  const tour = store.getTour(args.tourId);
  if (!tour || tour.status !== "scheduled") return { ok: false, code: "not_found", message: "I can't find that tour." };
  const gate = noticeOk(tour.startsAt, ctx.now);
  if (!gate.ok) return gate;
  const busy = store.listTours().filter((item) => item.status === "scheduled" && item.id !== tour.id).map((item) => ({ start: item.startsAt }));
  const slot = slotOk(ctx.now, args.start, busy);
  if (!slot.ok) return slot;
  store.moveTour(tour.id, slot.start, slot.end);
  return { ok: true, message: `Moved to ${slot.label}.` };
}

function cancel(store: PropertyStore, args: { tourId: string }, ctx: PropertyToolContext) {
  const tour = store.getTour(args.tourId);
  if (!tour || tour.status !== "scheduled") return { ok: false, code: "not_found", message: "I can't find that tour." };
  const gate = noticeOk(tour.startsAt, ctx.now);
  if (!gate.ok) return gate;
  store.cancelTour(tour.id);
  return { ok: true, message: `Cancelled tour ${tour.id}.` };
}

function faq(store: PropertyStore, args: Who & { question: string }) {
  if (classifyIssue(args.question) === "off_topic") return { ok: false, code: "off_topic", message: "I only help with Bramblefen maintenance, tours, and portal questions." };
  const who = verify(store, args);
  if (!who.ok) return who;
  return { ok: true, message: "Rent is paid in the resident portal. I can't take a card, a routing number, or a bank login, and this demo does not show a balance." };
}

async function link(store: PropertyStore, args: Who, ctx: PropertyToolContext) {
  const who = verify(store, args);
  if (!who.ok) return who;
  const tenant = store.matchTenant(args.name, args.unit, args.dob, args.portalCode) as Tenant;
  await ctx.sms.send({
    verticalId: "property",
    kind: "confirmation",
    to: tenant.phone,
    from: FIRM.phoneE164,
    body: `${FIRM.name} (demo): portal link https://demo.bramblefen.invalid/portal/${tenant.unitId} does not take a payment.`,
    relatedType: "tenant",
    relatedId: tenant.id,
  });
  return { ok: true, message: "I queued a portal link. It does not take a payment." };
}

function transfer(args: { reason: string }, ctx: PropertyToolContext) {
  if (classifyIssue(args.reason) === "off_topic") return { ok: false, code: "off_topic", message: "I only help with Bramblefen maintenance, tours, and portal questions." };
  return {
    ok: true,
    transfer: true,
    destination: FIRM.leasingE164,
    afterHours: !isDeskOpen(ctx.now),
    message: `I can transfer you to leasing at ${FIRM.leasingDisplay}. This demo does not dial.`,
  };
}

export function propertyOutcome(name: string, result: unknown): CallOutcome | null {
  const body = result as { ok?: boolean; code?: string; route?: string; transfer?: boolean };
  if (body.ok && body.route === "911") return "escalated";
  if (body.ok && (body.route === "emergency" || body.route === "flood" || body.route === "heat")) return "escalated";
  if (!body.ok && (body.code === "sensitive" || body.code === "third_party" || body.code === "not_verified" || body.code === "occupied")) return "refused";
  if (!body.ok && body.code === "off_topic") return "off_topic";
  if (!body.ok && body.code === "full") return "slot_unavailable";
  if (body.ok && (body.transfer || body.route === "lockout" || name === "transfer_to_leasing")) return "transferred";
  if (body.ok && name === "send_portal_link") return "text_back";
  if (body.ok && name === "book_tour") return "booked";
  if (body.ok && name === "reschedule_tour") return "rescheduled";
  if (body.ok && name === "cancel_tour") return "cancelled";
  if (body.ok && ["open_ticket", "verify_tenant", "list_units", "check_tours", "rent_faq", "screen_issue"].includes(name)) return "serviced";
  return null;
}

export function propertyCaller(_name: string, args: Record<string, unknown>): { name?: string; phone?: string } {
  const name = typeof args.name === "string" ? args.name : typeof args.prospectName === "string" ? args.prospectName : undefined;
  const phone = typeof args.phone === "string" ? args.phone : undefined;
  return { name, phone };
}
