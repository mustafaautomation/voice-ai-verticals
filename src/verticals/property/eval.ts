import { openDatabase } from "../../db/database.js";
import { MockSmsProvider } from "../../sms/provider.js";
import { SmsStore } from "../../store/sms.js";
import { strongerOutcome, type CallOutcome } from "../../store/calls.js";
import { FIRM, TENANTS } from "./brand.js";
import { executePropertyTool, propertyOutcome, type PropertyToolContext } from "./runtime.js";
import type { PropertyScenario } from "./scenarios.js";
import { PropertyStore } from "./store.js";

export function seedPropertyTenants(store: PropertyStore): void {
  if (store.countTenants() > 0) return;
  for (const tenant of TENANTS) store.insertTenant(tenant);
}

function seedScenario(store: PropertyStore, scenario: PropertyScenario, now: Date): void {
  seedPropertyTenants(store);
  if (scenario.id === "reschedule-tour") {
    store.insertTour({ id: "tour_move", prospectName: "Noor Adel", phone: "4015550188", unitId: "LH-310", startsAt: "2026-12-04T15:30:00.000Z", endsAt: "2026-12-04T16:00:00.000Z", now });
  }
  if (scenario.id === "cancel-tour") {
    store.insertTour({ id: "tour_cancel", prospectName: "Noor Adel", phone: "4015550188", unitId: "GM-102", startsAt: "2026-12-08T16:00:00.000Z", endsAt: "2026-12-08T16:30:00.000Z", now });
  }
  if (scenario.id === "tour-full") {
    store.insertTour({ id: "tour_full", prospectName: "Held Slot", phone: "4015550100", unitId: "LH-310", startsAt: "2026-12-02T15:30:00.000Z", endsAt: "2026-12-02T16:00:00.000Z", now });
  }
}

export async function runPropertyScenario(scenario: PropertyScenario) {
  const now = new Date(scenario.now);
  const db = openDatabase(":memory:");
  const store = new PropertyStore(db);
  seedScenario(store, scenario, now);
  const ctx: PropertyToolContext = {
    db,
    sms: new MockSmsProvider(new SmsStore(db), FIRM.phoneE164),
    fromNumber: FIRM.phoneE164,
    onCallNumber: FIRM.onCallE164,
    transferNumber: FIRM.leasingE164,
    now,
    callRowId: null,
  };
  const trace: Array<{ name: string; result: unknown }> = [];
  let outcome: CallOutcome = "no_booking";
  for (const turn of scenario.turns) {
    for (const action of turn.actions) {
      const result = await executePropertyTool(action.name, action.arguments, ctx);
      trace.push({ name: action.name, result });
      const next = propertyOutcome(action.name, result);
      if (next) outcome = strongerOutcome(outcome, next);
    }
  }
  return {
    id: scenario.id,
    outcome,
    toolNames: trace.map((entry) => entry.name),
    results: trace.map((entry) => entry.result),
    sms: new SmsStore(db).list("property").length,
    tickets: store.listTickets(),
    tours: store.listTours(),
  };
}

export function propertyScenarioPassed(scenario: PropertyScenario, result: Awaited<ReturnType<typeof runPropertyScenario>>): boolean {
  if (result.toolNames.join(",") !== scenario.expect.toolNames.join(",")) return false;
  if (result.outcome !== scenario.expect.outcome) return false;
  const body = JSON.stringify(result.results);
  if (scenario.expect.contains && !body.includes(scenario.expect.contains)) return false;
  if (scenario.expect.absent?.some((needle) => body.includes(needle))) return false;
  if (scenario.expect.sms && result.sms < scenario.expect.sms) return false;
  if (scenario.expect.tickets !== undefined && result.tickets.length !== scenario.expect.tickets) return false;
  if (scenario.expect.ticketStatus && !result.tickets.some((ticket) => ticket.status === scenario.expect.ticketStatus)) return false;
  if (scenario.expect.tours !== undefined && result.tours.filter((tour) => tour.status === "scheduled").length !== scenario.expect.tours) return false;
  return true;
}
