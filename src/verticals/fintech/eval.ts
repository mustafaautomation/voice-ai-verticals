import { openDatabase } from "../../db/database.js";
import { MockSmsProvider } from "../../sms/provider.js";
import { SmsStore } from "../../store/sms.js";
import { strongerOutcome, type CallOutcome } from "../../store/calls.js";
import { WRENLINE } from "./brand.js";
import { executeFintechTool, fintechOutcome, type FintechToolContext } from "./runtime.js";
import { seedFintechFixtures } from "./seed.js";
import { FintechStore } from "./store.js";
import type { FintechScenario } from "./scenarios.js";

export async function runFintechScenario(scenario: FintechScenario) {
  const now = new Date(scenario.now);
  const db = openDatabase(":memory:");
  seedFintechFixtures(db, now);
  const ctx: FintechToolContext = {
    db,
    sms: new MockSmsProvider(new SmsStore(db), WRENLINE.phoneE164),
    fromNumber: WRENLINE.phoneE164,
    onCallNumber: WRENLINE.fraudE164,
    transferNumber: WRENLINE.phoneE164,
    now,
    callRowId: null,
  };
  const trace: Array<{ name: string; result: unknown }> = [];
  let outcome: CallOutcome = "no_booking";
  for (const turn of scenario.turns) {
    for (const action of turn.actions) {
      const result = await executeFintechTool(action.name, action.arguments, ctx);
      trace.push({ name: action.name, result });
      const next = fintechOutcome(action.name, result);
      if (next) outcome = strongerOutcome(outcome, next);
    }
  }
  const store = new FintechStore(db);
  return {
    id: scenario.id,
    outcome,
    toolNames: trace.map((entry) => entry.name),
    results: trace.map((entry) => entry.result),
    sms: new SmsStore(db).list("fintech").length,
    accounts: store.listAccounts(),
  };
}

export function fintechScenarioPassed(scenario: FintechScenario, result: Awaited<ReturnType<typeof runFintechScenario>>): boolean {
  if (result.toolNames.join(",") !== scenario.expect.toolNames.join(",")) return false;
  if (result.outcome !== scenario.expect.outcome) return false;
  if (scenario.expect.sms && result.sms < 1) return false;
  if (scenario.expect.accountId && scenario.expect.cardStatus) {
    const account = result.accounts.find((item) => item.id === scenario.expect.accountId);
    if (!account || account.cardStatus !== scenario.expect.cardStatus) return false;
  }
  if (scenario.expect.noBalance) {
    const body = JSON.stringify(result.results);
    if (body.includes("186.40") || body.includes("4111111111111111") || body.includes("Available balance")) return false;
  }
  if (scenario.expect.contains && !JSON.stringify(result.results).includes(scenario.expect.contains)) return false;
  return true;
}
