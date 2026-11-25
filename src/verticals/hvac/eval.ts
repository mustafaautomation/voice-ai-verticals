import { openDatabase } from "../../db/database.js";
import { strongerOutcome, type CallOutcome } from "../../store/calls.js";
import { CallStore } from "../../store/calls.js";
import { CustomerStore } from "../../store/customers.js";
import { JobStore } from "../../store/jobs.js";
import { SmsStore } from "../../store/sms.js";
import { MockSmsProvider } from "../../sms/provider.js";
import { BRAND } from "./brand.js";
import { maybeTextBack, executeHvacTool, outcomeForTool, type HvacToolContext } from "./runtime.js";
import type { Scenario, ScriptAction } from "./scenarios.js";

export type ScenarioResult = {
  id: string;
  outcome: string;
  toolNames: string[];
  openJobs: number;
  smsKinds: string[];
  jobs: ReturnType<JobStore["list"]>;
};

export async function runHvacScenario(scenario: Scenario): Promise<ScenarioResult> {
  const now = new Date(scenario.now);
  const db = openDatabase(":memory:");
  const customers = new CustomerStore(db);
  const jobs = new JobStore(db);
  for (const customer of scenario.customers ?? []) {
    customers.insert({ ...customer, verticalId: "hvac" });
  }
  for (const job of scenario.jobs ?? []) {
    jobs.insertRaw({ ...job, verticalId: "hvac", createdAt: "2026-12-01T15:00:00Z" });
  }
  const sms = new MockSmsProvider(new SmsStore(db), BRAND.phoneE164);
  const ctx: HvacToolContext = {
    db,
    sms,
    fromNumber: BRAND.phoneE164,
    onCallNumber: BRAND.onCallE164,
    transferNumber: BRAND.phoneE164,
    now,
    callRowId: null,
  };
  const trace: Array<{ name: string; result: unknown }> = [];
  let outcome: CallOutcome = "no_booking";
  for (const turn of scenario.turns) {
    for (const action of turn.actions) {
      const args = materialize(action, trace);
      const result = await executeHvacTool(action.name, args, ctx);
      trace.push({ name: action.name, result });
      const next = outcomeForTool(action.name, result);
      if (next) outcome = strongerOutcome(outcome, next);
    }
  }
  if (scenario.endOfCall) {
    const calls = new CallStore(db);
    const call = calls.ensure({
      verticalId: "hvac",
      vapiCallId: `eval_${scenario.id}`,
      callerNumber: scenario.endOfCall.callerNumber,
      callerName: scenario.endOfCall.callerName ?? null,
      afterHours: true,
      now,
      outcome,
    });
    const sent = await maybeTextBack(ctx, call, scenario.endOfCall.endedReason);
    if (sent) outcome = strongerOutcome(outcome, "text_back");
  }
  if (trace.length === 0 && !scenario.endOfCall) outcome = "no_booking";
  const smsKinds = new SmsStore(db).list("hvac").map((message) => message.kind).reverse();
  const listed = jobs.list("hvac");
  return { id: scenario.id, outcome, toolNames: trace.map((entry) => entry.name), openJobs: jobs.openCount("hvac"), smsKinds, jobs: listed };
}

export function scenarioPassed(scenario: Scenario, result: ScenarioResult): boolean {
  if (result.toolNames.join(",") !== scenario.expect.toolNames.join(",")) return false;
  if (result.outcome !== scenario.expect.outcome) return false;
  if (result.openJobs !== scenario.expect.openJobs) return false;
  if (scenario.expect.smsKinds) {
    const kinds = [...result.smsKinds].sort().join(",");
    const expected = [...scenario.expect.smsKinds].sort().join(",");
    if (kinds !== expected) return false;
  }
  if (scenario.expect.jobId) {
    const job = result.jobs.find((item) => item.id === scenario.expect.jobId);
    if (!job) return false;
    if (scenario.expect.jobStatus && job.status !== scenario.expect.jobStatus) return false;
    if (scenario.expect.windowStart && job.windowStart !== scenario.expect.windowStart) return false;
  }
  if (scenario.expect.windowStart && !scenario.expect.jobId) {
    const match = result.jobs.find((job) => job.windowStart === scenario.expect.windowStart && job.status !== "cancelled");
    if (!match) return false;
  }
  return true;
}

function materialize(action: ScriptAction, trace: Array<{ name: string; result: unknown }>): Record<string, unknown> {
  if ("pick" in action) {
    return {
      windowStart: firstWindow(trace),
      customerName: action.customerName,
      phone: action.phone,
      address: action.address,
      jobType: action.jobType,
      description: action.description,
      ...(action.priority ? { priority: action.priority } : {}),
      ...(action.outdoorTempF !== undefined ? { outdoorTempF: action.outdoorTempF } : {}),
      ...(action.vulnerableOccupant !== undefined ? { vulnerableOccupant: action.vulnerableOccupant } : {}),
    };
  }
  return action.arguments;
}

function firstWindow(trace: Array<{ name: string; result: unknown }>): string {
  const checks = trace.filter((entry) => entry.name === "check_windows");
  const latest = checks[checks.length - 1];
  const windows = (latest?.result as { windows?: Array<{ start?: string }> } | undefined)?.windows ?? [];
  const start = windows[0]?.start;
  if (!start) throw new Error("Scripted model expected an open window and none was returned");
  return start;
}
