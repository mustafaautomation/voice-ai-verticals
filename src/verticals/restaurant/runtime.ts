import type { SqliteDatabase } from "../../db/database.js";
import { phoneDigits } from "../../platform/phone.js";
import type { SmsProvider } from "../../sms/provider.js";
import type { CallOutcome } from "../../store/calls.js";
import { DELIVERY_FEE_CENTS, HOUSE, MENU, TAX_RATE, isDeskOpen, itemBySku, money, tablesFor } from "./brand.js";
import { listOpenings, noticeOk, slotOk, type Hold } from "./schedule.js";
import { allergensIn, offTopic, promiseScript, reactionNow, reactionScript, wantsGuarantee } from "./screen.js";
import { isRestaurantTool, toolArgSchemas, type RestaurantToolName } from "./schemas.js";
import { RestaurantStore, type Line } from "./store.js";

export type RestaurantToolContext = {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
};

type Priced = { ok: true; lines: Line[]; subtotal: number; fee: number; tax: number; total: number; hold: boolean } | { ok: false; code: string; message: string };

export async function executeRestaurantTool(name: string, args: Record<string, unknown>, ctx: RestaurantToolContext): Promise<unknown> {
  if (!isRestaurantTool(name)) return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  const parsed = toolArgSchemas[name].safeParse(args);
  if (!parsed.success) return { ok: false, code: "invalid_arguments", message: "I need a complete order or reservation before I can do that." };
  try {
    return await run(name, parsed.data as never, ctx, new RestaurantStore(ctx.db));
  } catch {
    return { ok: false, code: "tool_error", message: "The book is not answering right now." };
  }
}

async function run(name: RestaurantToolName, args: Record<string, unknown>, ctx: RestaurantToolContext, store: RestaurantStore): Promise<unknown> {
  switch (name) {
    case "screen_request":
      return screen(args as { description: string });
    case "lookup_menu":
      return menu(args as { query: string });
    case "quote_order":
      return quote(args as never);
    case "place_order":
      return place(store, args as never, ctx);
    case "check_tables":
      return tables(store, args as { partySize: number; days?: number }, ctx);
    case "book_table":
      return book(store, args as never, ctx);
    case "reschedule_table":
      return move(store, args as { reservationId: string; start: string }, ctx);
    case "cancel_table":
      return cancel(store, args as { reservationId: string }, ctx);
    case "send_confirmation":
      return confirm(store, args as { orderId: string }, ctx);
    case "transfer_to_manager":
      return transfer(args as { reason: string }, ctx);
    default:
      return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  }
}

function screen(args: { description: string }) {
  if (reactionNow(args.description)) return { ok: true, route: "911", message: reactionScript() };
  if (wantsGuarantee(args.description)) return { ok: false, code: "promise", message: promiseScript() };
  if (offTopic(args.description)) return { ok: false, code: "off_topic", message: "I only help with Larkglass orders and reservations." };
  return { ok: true, route: "service", message: "I can take a pickup or delivery order, or a reservation. I can't promise an allergen-free plate." };
}

function menu(args: { query: string }) {
  const needle = args.query.trim().toLowerCase();
  const items = MENU.filter((item) => !needle || `${item.name} ${item.detail} ${item.sku}`.toLowerCase().includes(needle));
  if (!items.length) return { ok: false, code: "unknown_item", message: "That isn't on the Larkglass menu." };
  return {
    ok: true,
    items: items.map((item) => ({
      sku: item.sku,
      name: item.name,
      price: money(item.cents),
      allergens: item.allergens,
      modifiers: Object.keys(item.modifiers),
    })),
    message: items.map((item) => `${item.name} ${money(item.cents)}${item.allergens.length ? `, contains ${item.allergens.join(", ")}` : ""}`).join("; "),
  };
}

function price(args: { items: Array<{ sku: string; qty: number; modifiers: string[] }>; fulfillment: "pickup" | "delivery"; address: string; allergyNote: string }): Priced {
  if (reactionNow(args.allergyNote)) return { ok: false, code: "danger", message: reactionScript() };
  if (wantsGuarantee(args.allergyNote)) return { ok: false, code: "promise", message: promiseScript() };
  if (args.fulfillment === "delivery" && !args.address.trim()) return { ok: false, code: "invalid_arguments", message: "Delivery needs a Portland address. Use a made-up street in this demo." };
  if (args.fulfillment === "delivery" && !inZone(args.address)) return { ok: false, code: "outside_zone", message: "Delivery in this demo stays in Portland, Maine. I can do pickup instead." };
  const lines: Line[] = [];
  let hold = false;
  const noted = allergensIn(args.allergyNote);
  for (const item of args.items) {
    const dish = itemBySku(item.sku);
    if (!dish) return { ok: false, code: "unknown_item", message: `${item.sku} isn't on the menu.` };
    let cents = dish.cents;
    const labels: string[] = [];
    for (const modifier of item.modifiers) {
      const option = dish.modifiers[modifier];
      if (!option) return { ok: false, code: "bad_modifier", message: `${modifier} isn't a choice on ${dish.name}.` };
      cents += option.cents;
      labels.push(option.label);
    }
    if (noted.some((name) => dish.allergens.includes(name))) hold = true;
    lines.push({ sku: dish.sku, name: dish.name, qty: item.qty, modifiers: labels, cents: cents * item.qty });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.cents, 0);
  const fee = args.fulfillment === "delivery" ? DELIVERY_FEE_CENTS : 0;
  const tax = Math.round(subtotal * TAX_RATE);
  return { ok: true, lines, subtotal, fee, tax, total: subtotal + fee + tax, hold };
}

function inZone(address: string): boolean {
  const text = address.toLowerCase();
  return text.includes("portland") && (text.includes("me") || text.includes("maine") || /\b041\d{2}\b/.test(text));
}

function quote(args: { items: Array<{ sku: string; qty: number; modifiers: string[] }>; fulfillment: "pickup" | "delivery"; address: string; allergyNote: string }) {
  const priced = price(args);
  if (!priced.ok) return priced;
  const allergy = args.allergyNote ? ` Allergy note saved for the kitchen. ${promiseScript()}` : "";
  const hold = priced.hold ? " This plate overlaps the allergy note, so the ticket would be held for a manager." : "";
  return { ok: true, totalCents: priced.total, message: `Demo total ${money(priced.total)} (${money(priced.subtotal)} food, ${money(priced.fee)} delivery, ${money(priced.tax)} demo tax). Nothing is charged.${allergy}${hold}` };
}

async function place(store: RestaurantStore, args: { guestName: string; phone: string; items: Array<{ sku: string; qty: number; modifiers: string[] }>; fulfillment: "pickup" | "delivery"; address: string; allergyNote: string }, ctx: RestaurantToolContext) {
  if (!isDeskOpen(ctx.now)) return { ok: false, code: "closed", message: `The phone desk is closed. ${HOUSE.hours[0]}.` };
  if (phoneDigits(args.phone).length < 10) return { ok: false, code: "invalid_arguments", message: "I need a 10-digit callback number. Use a 555 number in this demo." };
  const priced = price(args);
  if (!priced.ok) return priced;
  const ticket = store.insertTicket({
    guestName: args.guestName,
    phone: args.phone,
    fulfillment: args.fulfillment,
    address: args.address,
    lines: priced.lines,
    allergy: args.allergyNote,
    subtotalCents: priced.subtotal,
    feeCents: priced.fee,
    taxCents: priced.tax,
    totalCents: priced.total,
    status: priced.hold ? "hold" : "new",
    now: ctx.now,
  });
  const caution = args.allergyNote ? ` Allergy noted. ${promiseScript()}` : "";
  const held = priced.hold ? " The ticket is on hold because a dish overlaps that allergy." : " The kitchen ticket is on the board.";
  return { ok: true, orderId: ticket.id, status: ticket.status, message: `Ticket ${ticket.id} for ${args.guestName}, ${args.fulfillment}, ${money(ticket.totalCents)}.${held}${caution} Nothing is charged.` };
}

function holds(store: RestaurantStore): Hold[] {
  return store.listReservations().map((item) => ({ id: item.id, partySize: item.partySize, start: item.startsAt, end: item.endsAt, status: item.status }));
}

function tables(store: RestaurantStore, args: { partySize: number; days?: number }, ctx: RestaurantToolContext) {
  if (!tablesFor(args.partySize)) return { ok: true, transfer: true, message: "Parties larger than 8 need the manager. This demo does not dial." };
  const openings = listOpenings(ctx.now, args.partySize, holds(store), args.days ?? 5);
  return { ok: true, openings, message: openings.length ? `Open seatings: ${openings.map((item) => item.label).join("; ")}.` : "No seatings in that range." };
}

function book(store: RestaurantStore, args: { guestName: string; phone: string; partySize: number; start: string; allergyNote: string }, ctx: RestaurantToolContext) {
  if (reactionNow(args.allergyNote)) return { ok: false, code: "danger", message: reactionScript() };
  if (!tablesFor(args.partySize)) return { ok: true, transfer: true, destination: HOUSE.managerE164, message: `A party of ${args.partySize} needs the manager at ${HOUSE.managerDisplay}. This demo does not dial.` };
  if (!isDeskOpen(ctx.now)) return { ok: false, code: "closed", message: `The phone desk is closed. ${HOUSE.hours[0]}.` };
  if (phoneDigits(args.phone).length < 10) return { ok: false, code: "invalid_arguments", message: "I need a 10-digit callback number. Use a 555 number in this demo." };
  const slot = slotOk(ctx.now, args.start, args.partySize, holds(store));
  if (!slot.ok) return slot;
  const reservation = store.insertReservation({
    guestName: args.guestName,
    phone: args.phone,
    partySize: args.partySize,
    startsAt: slot.start,
    endsAt: slot.end,
    allergy: args.allergyNote,
    status: "scheduled",
    now: ctx.now,
  });
  const allergy = args.allergyNote ? ` Allergy noted for the table. ${promiseScript()}` : "";
  return { ok: true, reservationId: reservation.id, message: `Booked ${slot.label} for ${args.partySize}. ${allergy}`.trim() };
}

function move(store: RestaurantStore, args: { reservationId: string; start: string }, ctx: RestaurantToolContext) {
  const reservation = store.getReservation(args.reservationId);
  if (!reservation || reservation.status !== "scheduled") return { ok: false, code: "not_found", message: "I can't find that reservation." };
  const gate = noticeOk(reservation.startsAt, ctx.now);
  if (!gate.ok) return gate;
  const slot = slotOk(ctx.now, args.start, reservation.partySize, holds(store), reservation.id);
  if (!slot.ok) return slot;
  store.moveReservation(reservation.id, slot.start, slot.end);
  return { ok: true, message: `Moved to ${slot.label}.` };
}

function cancel(store: RestaurantStore, args: { reservationId: string }, ctx: RestaurantToolContext) {
  const reservation = store.getReservation(args.reservationId);
  if (!reservation || reservation.status !== "scheduled") return { ok: false, code: "not_found", message: "I can't find that reservation." };
  const gate = noticeOk(reservation.startsAt, ctx.now);
  if (!gate.ok) return gate;
  store.cancelReservation(reservation.id);
  return { ok: true, message: `Cancelled reservation ${reservation.id}.` };
}

async function confirm(store: RestaurantStore, args: { orderId: string }, ctx: RestaurantToolContext) {
  const ticket = store.getTicket(args.orderId);
  if (!ticket) return { ok: false, code: "not_found", message: "I can't find that ticket." };
  await ctx.sms.send({
    verticalId: "restaurant",
    kind: "confirmation",
    to: ticket.phone,
    from: HOUSE.phoneE164,
    body: `${HOUSE.name} (demo): ${ticket.fulfillment} ticket ${ticket.id} for ${ticket.guestName}, ${money(ticket.totalCents)}. This text does not charge a card or send a driver.`,
    relatedType: "order",
    relatedId: ticket.id,
  });
  return { ok: true, message: "I queued a confirmation text. It does not charge a card." };
}

function transfer(args: { reason: string }, ctx: RestaurantToolContext) {
  if (offTopic(args.reason)) return { ok: false, code: "off_topic", message: "I only help with Larkglass orders and reservations." };
  return {
    ok: true,
    transfer: true,
    destination: HOUSE.managerE164,
    afterHours: !isDeskOpen(ctx.now),
    message: `I can transfer you to the manager at ${HOUSE.managerDisplay}. This demo does not dial.`,
  };
}

export function restaurantOutcome(name: string, result: unknown): CallOutcome | null {
  const body = result as { ok?: boolean; code?: string; route?: string; transfer?: boolean };
  if (body.ok && body.route === "911") return "escalated";
  if (!body.ok && (body.code === "promise" || body.code === "unknown_item" || body.code === "outside_zone" || body.code === "danger")) return "refused";
  if (!body.ok && body.code === "off_topic") return "off_topic";
  if (!body.ok && body.code === "full") return "slot_unavailable";
  if (body.ok && (body.transfer || name === "transfer_to_manager")) return "transferred";
  if (body.ok && name === "send_confirmation") return "text_back";
  if (body.ok && name === "book_table") return "booked";
  if (body.ok && name === "reschedule_table") return "rescheduled";
  if (body.ok && name === "cancel_table") return "cancelled";
  if (body.ok && (name === "place_order" || name === "quote_order" || name === "lookup_menu" || name === "check_tables")) return "serviced";
  return null;
}

export function restaurantCaller(_name: string, args: Record<string, unknown>): { name?: string; phone?: string } {
  const name = typeof args.guestName === "string" ? args.guestName : undefined;
  const phone = typeof args.phone === "string" ? args.phone : undefined;
  return { name, phone };
}
