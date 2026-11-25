import type { SqliteDatabase } from "../../db/database.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { HOUSE } from "./brand.js";
import { RestaurantStore } from "./store.js";

export function seedRestaurantDesk(db: SqliteDatabase): void {
  const book = new RestaurantStore(db);
  if (book.countTickets() > 0) return;
  const calls = new CallStore(db);
  const sms = new SmsStore(db);
  const ticket = book.insertTicket({
    id: "ord_maya",
    guestName: "Maya Chen",
    phone: "2075550141",
    fulfillment: "pickup",
    address: "",
    lines: [{ sku: "farro", name: "Cider chicken", qty: 1, modifiers: ["Glaze on the side"], cents: 2400 }],
    allergy: "sesame",
    subtotalCents: 2400,
    feeCents: 0,
    taxCents: 192,
    totalCents: 2592,
    status: "firing",
    now: new Date("2026-11-20T21:10:00.000Z"),
  });
  book.insertTicket({
    id: "ord_priya",
    guestName: "Priya Shah",
    phone: "2075550148",
    fulfillment: "delivery",
    address: "4 Fog Bell, Portland, ME 04101",
    lines: [{ sku: "gem", name: "Little gem", qty: 1, modifiers: ["Dressing on the side"], cents: 1400 }],
    allergy: "",
    subtotalCents: 1400,
    feeCents: 400,
    taxCents: 112,
    totalCents: 1912,
    status: "ready",
    now: new Date("2026-11-21T22:00:00.000Z"),
  });
  book.insertReservation({
    id: "res_andre",
    guestName: "Andre Brooks",
    phone: "2075550142",
    partySize: 4,
    startsAt: "2026-12-04T22:00:00.000Z",
    endsAt: "2026-12-04T23:30:00.000Z",
    allergy: "no dairy on one plate",
    status: "scheduled",
    now: new Date("2026-11-18T21:00:00.000Z"),
  });
  const call = calls.ensure({
    id: "call_maya_table",
    verticalId: "restaurant",
    vapiCallId: "seed-larkglass-maya",
    callerName: "Maya Chen",
    callerNumber: "+12075550141",
    afterHours: false,
    now: new Date("2026-11-20T21:00:00.000Z"),
    outcome: "serviced",
    status: "completed",
    summary: "Pickup ticket with a sesame note. No safety promise.",
    transcript:
      "Host: Larkglass, this is the host stand.\nCaller: Pickup chicken. Sesame makes me sick.\nHost: I put sesame on the ticket. I can't say the plate is safe. Nothing is charged.",
  });
  calls.saveToolCall({
    callRowId: call.id,
    toolCallId: "seed-order",
    name: "place_order",
    arguments: { guestName: "Maya Chen", fulfillment: "pickup" },
    result: { ok: true, orderId: ticket.id },
    now: new Date("2026-11-20T21:06:00.000Z"),
  });
  sms.insert({
    id: "sms_maya_table",
    provider: "mock",
    fromNumber: HOUSE.phoneE164,
    status: "queued",
    createdAt: "2026-11-20T21:07:00.000Z",
    message: {
      verticalId: "restaurant",
      kind: "confirmation",
      to: "+12075550141",
      body: "Larkglass (demo): pickup ticket ord_maya for Maya Chen, $25.92. This text does not charge a card or send a driver.",
      relatedType: "order",
      relatedId: ticket.id,
    },
  });
}
