import { openDatabase } from "../../db/database.js";
import { strongerOutcome, type CallOutcome } from "../../store/calls.js";
import { CallStore } from "../../store/calls.js";
import { SmsStore } from "../../store/sms.js";
import { MockSmsProvider } from "../../sms/provider.js";
import { CLINIC } from "./brand.js";
import { clinicOutcome, executeClinicTool, maybeClinicTextBack, type ClinicToolContext } from "./runtime.js";
import { ClinicStore } from "./store.js";
import type { ClinicAction, ClinicScenario } from "./scenarios.js";

export type ClinicScenarioResult = {
  id: string;
  outcome: string;
  toolNames: string[];
  openVisits: number;
  smsKinds: string[];
  visits: ReturnType<ClinicStore["listAppointments"]>;
  results: unknown[];
};

export async function runClinicScenario(scenario: ClinicScenario): Promise<ClinicScenarioResult> {
  const now = new Date(scenario.now);
  const db = openDatabase(":memory:");
  const store = new ClinicStore(db);
  for (const patient of scenario.patients ?? []) store.insertPatient(patient);
  for (const visit of scenario.visits ?? []) store.insertAppointment(visit);
  const ctx: ClinicToolContext = {
    db,
    sms: new MockSmsProvider(new SmsStore(db), CLINIC.phoneE164),
    fromNumber: CLINIC.phoneE164,
    onCallNumber: CLINIC.nurseE164,
    transferNumber: CLINIC.phoneE164,
    now,
    callRowId: null,
  };
  const trace: Array<{ name: string; result: unknown }> = [];
  let outcome: CallOutcome = "no_booking";
  for (const turn of scenario.turns) {
    for (const action of turn.actions) {
      const args = materialize(action, trace);
      const result = await executeClinicTool(action.name, args, ctx);
      trace.push({ name: action.name, result });
      const next = clinicOutcome(action.name, result);
      if (next) outcome = strongerOutcome(outcome, next);
    }
  }
  if (scenario.endOfCall) {
    const call = new CallStore(db).ensure({
      verticalId: "clinic",
      vapiCallId: `eval_${scenario.id}`,
      callerNumber: scenario.endOfCall.callerNumber,
      callerName: scenario.endOfCall.callerName ?? null,
      afterHours: true,
      now,
      outcome,
    });
    if (await maybeClinicTextBack(ctx, call, scenario.endOfCall.endedReason)) outcome = strongerOutcome(outcome, "text_back");
  }
  if (trace.length === 0 && !scenario.endOfCall) outcome = "no_booking";
  return {
    id: scenario.id,
    outcome,
    toolNames: trace.map((entry) => entry.name),
    openVisits: store.openCount(),
    smsKinds: new SmsStore(db).list("clinic").map((message) => message.kind).reverse(),
    visits: store.listAppointments(),
    results: trace.map((entry) => entry.result),
  };
}

export function clinicScenarioPassed(scenario: ClinicScenario, result: ClinicScenarioResult): boolean {
  if (result.toolNames.join(",") !== scenario.expect.toolNames.join(",")) return false;
  if (result.outcome !== scenario.expect.outcome) return false;
  if (result.openVisits !== scenario.expect.openVisits) return false;
  if (scenario.expect.smsKinds && [...result.smsKinds].sort().join(",") !== [...scenario.expect.smsKinds].sort().join(",")) return false;
  if (scenario.expect.visitId) {
    const visit = result.visits.find((item) => item.id === scenario.expect.visitId);
    if (!visit) return false;
    if (scenario.expect.visitStatus && visit.status !== scenario.expect.visitStatus) return false;
    if (scenario.expect.startsAt && visit.startsAt !== scenario.expect.startsAt) return false;
  }
  if (scenario.expect.startsAt && !scenario.expect.visitId) {
    if (!result.visits.some((visit) => visit.startsAt === scenario.expect.startsAt && visit.status === "scheduled")) return false;
  }
  if (scenario.expect.noChart) {
    const body = JSON.stringify(result.results);
    if (body.includes("vis_secret") || body.includes("appointments")) return false;
  }
  return true;
}

function materialize(action: ClinicAction, trace: Array<{ name: string; result: unknown }>): Record<string, unknown> {
  if ("pick" in action) {
    const slot = firstSlot(trace);
    return {
      name: action.nameOnFile,
      dob: action.dob,
      phone: action.phone,
      relationship: "self",
      visitType: action.visitType,
      start: slot.start,
      providerId: slot.providerId,
      reason: action.reason,
    };
  }
  return action.arguments;
}

function firstSlot(trace: Array<{ name: string; result: unknown }>): { start: string; providerId: string } {
  const checks = trace.filter((entry) => entry.name === "check_slots");
  const latest = checks[checks.length - 1];
  const slots = (latest?.result as { slots?: Array<{ start?: string; providerId?: string }> } | undefined)?.slots ?? [];
  const slot = slots[0];
  if (!slot?.start || !slot.providerId) throw new Error("Scripted model expected an open slot");
  return { start: slot.start, providerId: slot.providerId };
}
