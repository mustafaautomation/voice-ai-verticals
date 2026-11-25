import type { SqliteDatabase } from "../../db/database.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { FIRM } from "./brand.js";
import { seedPropertyTenants } from "./eval.js";
import { PropertyStore } from "./store.js";

export function seedPropertyDesk(db: SqliteDatabase): void {
  const book = new PropertyStore(db);
  seedPropertyTenants(book);
  if (book.countTickets() > 0) return;
  const calls = new CallStore(db);
  const sms = new SmsStore(db);
  book.insertTicket({
    id: "tix_flood",
    callerName: "Maya Chen",
    unitId: "LH-204",
    category: "flood",
    priority: "emergency",
    summary: "Water through the ceiling. On-call text queued. Not a real dispatch.",
    status: "emergency",
    now: new Date("2026-11-20T15:10:00.000Z"),
  });
  book.insertTicket({
    id: "tix_drip",
    callerName: "Andre Brooks",
    unitId: "GM-110",
    category: "routine",
    priority: "routine",
    summary: "Kitchen faucet drip. Next office day.",
    status: "queued",
    now: new Date("2026-11-21T16:00:00.000Z"),
  });
  book.insertTour({
    id: "tour_noor",
    prospectName: "Noor Adel",
    phone: "4015550188",
    unitId: "LH-310",
    startsAt: "2026-12-04T15:30:00.000Z",
    endsAt: "2026-12-04T16:00:00.000Z",
    now: new Date("2026-11-18T15:00:00.000Z"),
  });
  const call = calls.ensure({
    id: "call_maya_unit",
    verticalId: "property",
    vapiCallId: "seed-bramblefen-maya",
    callerName: "Maya Chen",
    callerNumber: "+14015550141",
    afterHours: false,
    now: new Date("2026-11-20T15:00:00.000Z"),
    outcome: "escalated",
    status: "completed",
    summary: "Ceiling leak. On-call paged. Caller told to keep clear of the water.",
    transcript: "Desk: Bramblefen. If you smell gas, leave and call 911.\nCaller: Water is pouring through the ceiling in LH-204.\nDesk: I'm texting the on-call resident. If it is near outlets, leave and call 911.",
  });
  calls.saveToolCall({
    callRowId: call.id,
    toolCallId: "seed-ticket",
    name: "open_ticket",
    arguments: { name: "Maya Chen", unit: "LH-204" },
    result: { ok: true, route: "emergency" },
    now: new Date("2026-11-20T15:04:00.000Z"),
  });
  sms.insert({
    id: "sms_oncall",
    provider: "mock",
    fromNumber: FIRM.phoneE164,
    status: "queued",
    createdAt: "2026-11-20T15:05:00.000Z",
    message: {
      verticalId: "property",
      kind: "dispatch",
      to: FIRM.onCallE164,
      body: "Bramblefen on-call (demo): flood at LH-204. Not a real page.",
      relatedType: "ticket",
      relatedId: "tix_flood",
    },
  });
}
