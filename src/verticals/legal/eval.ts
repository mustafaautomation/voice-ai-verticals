import { openDatabase } from "../../db/database.js";
import { MockSmsProvider } from "../../sms/provider.js";
import { SmsStore } from "../../store/sms.js";
import { strongerOutcome, type CallOutcome } from "../../store/calls.js";
import { FIRM } from "./brand.js";
import { executeLegalTool, legalOutcome, type LegalToolContext } from "./runtime.js";
import type { LegalScenario } from "./scenarios.js";
import { LegalStore } from "./store.js";

function seedScenario(store: LegalStore, scenario: LegalScenario, now: Date): void {
  store.insertParty({ id: "pty_maya", name: "Maya Chen", side: "client", matterLabel: "Employment, closed" });
  store.insertParty({ id: "pty_north", name: "Northline Logistics", side: "adverse", matterLabel: "Employment, closed" });
  store.insertParty({ id: "pty_andre", name: "Andre Brooks", side: "client", matterLabel: "Family, active" });
  store.insertParty({ id: "pty_priya", name: "Priya Shah", side: "adverse", matterLabel: "Family, active" });
  if (scenario.id === "book-consult" || scenario.id === "reschedule" || scenario.id === "cancel" || scenario.id === "intake-text") {
    const id = scenario.id === "book-consult" ? "mat_book" : scenario.id === "reschedule" ? "mat_move" : scenario.id === "cancel" ? "mat_cancel" : "mat_text";
    const practice = scenario.id === "reschedule" ? "family" : scenario.id === "cancel" || scenario.id === "intake-text" ? "estate" : "personal_injury";
    store.insertMatter({
      id,
      callerName: "Lena Ortiz",
      phone: "3035550144",
      practice,
      opposing: "Cedar Mile Transit",
      incidentDate: "2026-11-02",
      jurisdiction: "Denver, Colorado",
      summary: "Demo intake already open.",
      status: "new",
      urgent: false,
      now,
    });
  }
  if (scenario.id === "reschedule") {
    store.insertConsult({
      id: "con_move",
      matterId: "mat_move",
      attorneyId: "atty_hale",
      consultType: "free",
      startsAt: "2026-12-08T16:00:00.000Z",
      endsAt: "2026-12-08T16:30:00.000Z",
      now,
    });
  }
  if (scenario.id === "cancel") {
    store.insertConsult({
      id: "con_cancel",
      matterId: "mat_cancel",
      attorneyId: "atty_hale",
      consultType: "paid",
      startsAt: "2026-12-11T17:00:00.000Z",
      endsAt: "2026-12-11T17:30:00.000Z",
      now,
    });
  }
}

export async function runLegalScenario(scenario: LegalScenario) {
  const now = new Date(scenario.now);
  const db = openDatabase(":memory:");
  const store = new LegalStore(db);
  seedScenario(store, scenario, now);
  const ctx: LegalToolContext = {
    db,
    sms: new MockSmsProvider(new SmsStore(db), FIRM.phoneE164),
    fromNumber: FIRM.phoneE164,
    onCallNumber: FIRM.urgentE164,
    transferNumber: FIRM.paralegalE164,
    now,
    callRowId: null,
  };
  const trace: Array<{ name: string; result: unknown }> = [];
  let outcome: CallOutcome = "no_booking";
  for (const turn of scenario.turns) {
    for (const action of turn.actions) {
      const result = await executeLegalTool(action.name, action.arguments, ctx);
      trace.push({ name: action.name, result });
      const next = legalOutcome(action.name, result);
      if (next) outcome = strongerOutcome(outcome, next);
    }
  }
  return {
    id: scenario.id,
    outcome,
    toolNames: trace.map((entry) => entry.name),
    results: trace.map((entry) => entry.result),
    sms: new SmsStore(db).list("legal").length,
    matters: store.listMatters(),
    consults: store.listConsults(),
  };
}

export function legalScenarioPassed(scenario: LegalScenario, result: Awaited<ReturnType<typeof runLegalScenario>>): boolean {
  if (result.toolNames.join(",") !== scenario.expect.toolNames.join(",")) return false;
  if (result.outcome !== scenario.expect.outcome) return false;
  const body = JSON.stringify(result.results);
  if (scenario.expect.contains && !body.includes(scenario.expect.contains)) return false;
  if (scenario.expect.absent?.some((needle) => body.includes(needle))) return false;
  if (scenario.expect.sms && result.sms < 1) return false;
  if (scenario.expect.urgentMatter && !result.matters.some((matter) => matter.urgent)) return false;
  if (scenario.expect.consultId && scenario.expect.consultStatus) {
    const consult =
      scenario.expect.consultId === "next"
        ? result.consults.find((item) => item.status === scenario.expect.consultStatus)
        : result.consults.find((item) => item.id === scenario.expect.consultId);
    if (!consult || consult.status !== scenario.expect.consultStatus) return false;
  }
  return true;
}
