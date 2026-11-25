import { openDatabase } from "../../db/database.js";
import { MockSmsProvider } from "../../sms/provider.js";
import { SmsStore } from "../../store/sms.js";
import { strongerOutcome, type CallOutcome } from "../../store/calls.js";
import { HOUSE } from "./brand.js";
import { executeRestaurantTool, restaurantOutcome, type RestaurantToolContext } from "./runtime.js";
import type { RestaurantScenario } from "./scenarios.js";
import { RestaurantStore } from "./store.js";

function seedScenario(store: RestaurantStore, scenario: RestaurantScenario, now: Date): void {
  if (scenario.id === "tables-full") {
    for (let index = 0; index < 4; index += 1) {
      store.insertReservation({
        id: `res_full_${index}`,
        guestName: `Party ${index}`,
        phone: "2075550100",
        partySize: 4,
        startsAt: "2026-12-02T22:00:00.000Z",
        endsAt: "2026-12-02T23:30:00.000Z",
        allergy: "",
        status: "scheduled",
        now,
      });
    }
  }
  if (scenario.id === "reschedule") {
    store.insertReservation({
      id: "res_move",
      guestName: "Owen Blake",
      phone: "2075550155",
      partySize: 2,
      startsAt: "2026-12-04T22:00:00.000Z",
      endsAt: "2026-12-04T23:30:00.000Z",
      allergy: "",
      status: "scheduled",
      now,
    });
  }
  if (scenario.id === "cancel") {
    store.insertReservation({
      id: "res_cancel",
      guestName: "Owen Blake",
      phone: "2075550155",
      partySize: 2,
      startsAt: "2026-12-05T23:00:00.000Z",
      endsAt: "2026-12-06T00:30:00.000Z",
      allergy: "",
      status: "scheduled",
      now,
    });
  }
  if (scenario.id === "confirmation") {
    store.insertTicket({
      id: "ord_text",
      guestName: "Lena Ortiz",
      phone: "2075550144",
      fulfillment: "pickup",
      address: "",
      lines: [{ sku: "spritz", name: "House spritz", qty: 1, modifiers: [], cents: 800 }],
      allergy: "",
      subtotalCents: 800,
      feeCents: 0,
      taxCents: 64,
      totalCents: 864,
      status: "new",
      now,
    });
  }
}

export async function runRestaurantScenario(scenario: RestaurantScenario) {
  const now = new Date(scenario.now);
  const db = openDatabase(":memory:");
  const store = new RestaurantStore(db);
  seedScenario(store, scenario, now);
  const ctx: RestaurantToolContext = {
    db,
    sms: new MockSmsProvider(new SmsStore(db), HOUSE.phoneE164),
    fromNumber: HOUSE.phoneE164,
    onCallNumber: HOUSE.managerE164,
    transferNumber: HOUSE.managerE164,
    now,
    callRowId: null,
  };
  const trace: Array<{ name: string; result: unknown }> = [];
  let outcome: CallOutcome = "no_booking";
  for (const turn of scenario.turns) {
    for (const action of turn.actions) {
      const result = await executeRestaurantTool(action.name, action.arguments, ctx);
      trace.push({ name: action.name, result });
      const next = restaurantOutcome(action.name, result);
      if (next) outcome = strongerOutcome(outcome, next);
    }
  }
  return {
    id: scenario.id,
    outcome,
    toolNames: trace.map((entry) => entry.name),
    results: trace.map((entry) => entry.result),
    sms: new SmsStore(db).list("restaurant").length,
    tickets: store.listTickets(),
    reservations: store.listReservations(),
  };
}

export function restaurantScenarioPassed(scenario: RestaurantScenario, result: Awaited<ReturnType<typeof runRestaurantScenario>>): boolean {
  if (result.toolNames.join(",") !== scenario.expect.toolNames.join(",")) return false;
  if (result.outcome !== scenario.expect.outcome) return false;
  const body = JSON.stringify(result.results);
  if (scenario.expect.contains && !body.includes(scenario.expect.contains)) return false;
  if (scenario.expect.absent?.some((needle) => body.includes(needle))) return false;
  if (scenario.expect.sms && result.sms < scenario.expect.sms) return false;
  if (scenario.expect.tickets !== undefined && result.tickets.length !== scenario.expect.tickets) return false;
  if (scenario.expect.ticketStatus && !result.tickets.some((ticket) => ticket.status === scenario.expect.ticketStatus)) return false;
  if (scenario.expect.reservations !== undefined) {
    const live = result.reservations.filter((item) => item.status === "scheduled");
    if (scenario.id === "book-table" && live.length !== scenario.expect.reservations) return false;
  }
  return true;
}
