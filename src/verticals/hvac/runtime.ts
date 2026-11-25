import type { SqliteDatabase } from "../../db/database.js";
import { formatPhone, phoneDigits } from "../../platform/phone.js";
import { isDeskOpen, onCallTech, techById } from "../../platform/schedule.js";
import type { SmsProvider } from "../../sms/provider.js";
import type { CallOutcome } from "../../store/calls.js";
import { CallStore } from "../../store/calls.js";
import { CustomerStore } from "../../store/customers.js";
import { JobStore } from "../../store/jobs.js";
import { SmsStore } from "../../store/sms.js";
import { BRAND, HVAC_ID, HVAC_OPS, jobLabel } from "./brand.js";
import { confirmationSms, dispatchSms, missedCallReason, safetySms, textBackSms } from "./messages.js";
import { isHvacTool, toolArgSchemas, type HvacToolName } from "./schemas.js";
import { triageIssue } from "./triage.js";

export type HvacToolContext = {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
};

export async function executeHvacTool(name: string, args: Record<string, unknown>, ctx: HvacToolContext): Promise<unknown> {
  if (!isHvacTool(name)) return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  const parsed = toolArgSchemas[name].safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_arguments",
      message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "arguments"}: ${issue.message}`).join("; "),
    };
  }
  try {
    return await runTool(name, parsed.data as never, ctx);
  } catch {
    return { ok: false, code: "tool_error", message: "I cannot reach the job board right now. I can transfer you to a person." };
  }
}

async function runTool(name: HvacToolName, args: Record<string, unknown>, ctx: HvacToolContext): Promise<unknown> {
  switch (name) {
    case "triage_issue":
      return triageIssue(args as never);
    case "lookup_customer":
      return lookup(ctx, (args as { phone: string }).phone);
    case "check_windows":
      return check(ctx, args as never);
    case "book_job":
      return book(ctx, args as never);
    case "reschedule_job":
      return reschedule(ctx, args as never);
    case "cancel_job":
      return cancel(ctx, args as never);
    case "escalate_on_call":
      return escalate(ctx, args as never);
    case "transfer_to_human":
      return transfer(ctx, (args as { reason: string }).reason);
    case "send_text_back":
      return textBack(ctx, args as { phone: string; reason?: string });
    default:
      return { ok: false, code: "unknown_tool", message: `Unknown tool ${name}.` };
  }
}

function lookup(ctx: HvacToolContext, phone: string): unknown {
  const customers = new CustomerStore(ctx.db);
  const customer = customers.findByPhone(HVAC_ID, phone);
  if (!customer) {
    return { ok: true, found: false, message: "No customer on file for that number. Collect name and address before booking." };
  }
  const jobs = new JobStore(ctx.db).forCustomer(customer.id).filter((job) => job.status === "scheduled" || job.status === "dispatched");
  return {
    ok: true,
    found: true,
    customer: { id: customer.id, name: customer.name, phone: formatPhone(customer.phone), address: customer.address },
    openJobs: jobs.map(publicJob),
    message: jobs.length
      ? `${customer.name} is on file at ${customer.address}. Open jobs: ${jobs.map((job) => `${job.id} ${jobLabel(job.jobType)} ${job.windowLabel}`).join("; ")}.`
      : `${customer.name} is on file at ${customer.address}. No open jobs.`,
  };
}

function check(ctx: HvacToolContext, args: { jobType: string; priority?: "emergency" | "urgent" | "routine"; date?: string; days?: number }): unknown {
  const result = new JobStore(ctx.db).checkWindows(HVAC_OPS, ctx.now, {
    jobTypeId: args.jobType,
    priority: args.priority ?? "routine",
    date: args.date,
    days: args.days,
  });
  if (!result.ok) return { ok: false, code: result.code, message: result.message };
  return {
    ok: true,
    deskOpen: isDeskOpen(HVAC_OPS, ctx.now),
    windows: result.windows,
    message: result.message,
  };
}

async function book(ctx: HvacToolContext, args: {
  windowStart: string;
  customerName: string;
  phone: string;
  address: string;
  jobType: string;
  priority?: "emergency" | "urgent" | "routine";
  description: string;
  outdoorTempF?: number;
  vulnerableOccupant?: boolean;
  email?: string;
}): Promise<unknown> {
  if (phoneDigits(args.phone).length < 10) {
    return { ok: false, code: "invalid_arguments", message: "Ask for a 10-digit callback number. Use a 555 number in this demo." };
  }
  const triage = triageIssue({
    description: args.description,
    outdoorTempF: args.outdoorTempF,
    vulnerableOccupant: args.vulnerableOccupant,
    jobType: args.jobType,
  });
  if (triage.priority === "emergency") {
    return { ok: false, code: "emergency_do_not_book", message: triage.callerScript };
  }
  if (triage.priority === "off_topic") return { ok: false, code: "off_topic", message: triage.callerScript };
  if (triage.priority === "needs_detail" && !triage.jobType) {
    return { ok: false, code: "needs_detail", message: triage.callerScript };
  }
  const priority = triage.priority === "urgent" ? "urgent" : "routine";
  const jobType = triage.jobType ?? args.jobType;
  const deskOpen = isDeskOpen(HVAC_OPS, ctx.now);
  const status = priority === "urgent" && !deskOpen ? "dispatched" : "scheduled";
  const customer = new CustomerStore(ctx.db).upsert({
    verticalId: HVAC_ID,
    name: args.customerName,
    phone: args.phone,
    address: args.address,
    email: args.email,
  });
  const booked = new JobStore(ctx.db).book(HVAC_OPS, {
    customerId: customer.id,
    jobType,
    priority,
    windowStart: args.windowStart,
    address: args.address,
    description: args.description,
    sourceCallId: ctx.callRowId,
    status,
    now: ctx.now,
  });
  if (!booked.ok) return { ok: false, code: booked.code, message: booked.message };
  const tech = techById(HVAC_OPS, booked.job.techId);
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "dispatch",
    to: tech?.phone ?? ctx.onCallNumber,
    body: dispatchSms({
      priority,
      jobType,
      customerName: customer.name,
      address: args.address,
      windowLabel: booked.job.windowLabel,
      phone: customer.phone,
      jobId: booked.job.id,
    }),
    relatedType: "job",
    relatedId: booked.job.id,
  });
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "confirmation",
    to: customer.phone,
    body: confirmationSms({ jobType, windowLabel: booked.job.windowLabel, techName: tech?.name ?? "the on-call technician" }),
    relatedType: "job",
    relatedId: booked.job.id,
  });
  return {
    ok: true,
    job: publicJob({ ...booked.job, customerName: customer.name, phone: customer.phone }),
    message: `${customer.name} is ${status === "dispatched" ? "dispatched" : "booked"} for ${jobLabel(jobType)} ${booked.job.windowLabel} with ${tech?.name ?? "a technician"}.`,
  };
}

async function reschedule(ctx: HvacToolContext, args: { jobId: string; windowStart: string }): Promise<unknown> {
  const moved = new JobStore(ctx.db).reschedule(HVAC_OPS, { jobId: args.jobId, windowStart: args.windowStart, now: ctx.now });
  if (!moved.ok) return { ok: false, code: moved.code, message: moved.message };
  const tech = techById(HVAC_OPS, moved.job.techId);
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "confirmation",
    to: moved.job.phone,
    body: `${BRAND.name} (demo): job ${moved.job.id} moved to ${moved.job.windowLabel} with ${tech?.name ?? "a technician"}.`,
    relatedType: "job",
    relatedId: moved.job.id,
  });
  return { ok: true, job: publicJob(moved.job), message: `Moved to ${moved.job.windowLabel} with ${tech?.name ?? "a technician"}.` };
}

async function cancel(ctx: HvacToolContext, args: { jobId: string; reason?: string }): Promise<unknown> {
  const cancelled = new JobStore(ctx.db).cancel(HVAC_OPS, { jobId: args.jobId, now: ctx.now });
  if (!cancelled.ok) return { ok: false, code: cancelled.code, message: cancelled.message };
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "confirmation",
    to: cancelled.job.phone,
    body: `${BRAND.name} (demo): job ${cancelled.job.id} is cancelled${args.reason ? ` (${args.reason})` : ""}.`,
    relatedType: "job",
    relatedId: cancelled.job.id,
  });
  return { ok: true, job: publicJob(cancelled.job), message: `Cancelled job ${cancelled.job.id}.` };
}

async function escalate(ctx: HvacToolContext, args: {
  reason: string;
  customerName: string;
  phone: string;
  address: string;
  description: string;
}): Promise<unknown> {
  const triage = triageIssue({ description: args.description });
  if (triage.priority !== "emergency") {
    return {
      ok: false,
      code: "not_an_emergency",
      message: "On-call escalation is for gas odor and CO alarms. For no heat or no cooling, book the soonest window.",
    };
  }
  const tech = onCallTech(HVAC_OPS, ctx.now, ["furnace"]);
  if (!tech) return { ok: false, code: "no_tech", message: "No on-call technician is configured." };
  const customer = new CustomerStore(ctx.db).upsert({
    verticalId: HVAC_ID,
    name: args.customerName,
    phone: args.phone,
    address: args.address,
    notes: args.reason,
  });
  const job = new JobStore(ctx.db).insertRaw({
    verticalId: HVAC_ID,
    customerId: customer.id,
    jobType: triage.jobType ?? "gas_odor",
    priority: "emergency",
    status: "dispatched",
    windowStart: null,
    windowEnd: null,
    windowLabel: "ASAP — caller told to leave and call 911",
    techId: tech.id,
    address: args.address,
    description: args.description,
    sourceCallId: ctx.callRowId,
    createdAt: ctx.now.toISOString().replace(/\.\d{3}Z$/, "Z"),
  });
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "dispatch",
    to: tech.phone,
    body: dispatchSms({
      priority: "emergency",
      jobType: job.jobType,
      customerName: customer.name,
      address: args.address,
      windowLabel: job.windowLabel,
      phone: customer.phone,
      jobId: job.id,
    }),
    relatedType: "job",
    relatedId: job.id,
  });
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "safety",
    to: customer.phone,
    body: safetySms(),
    relatedType: "job",
    relatedId: job.id,
  });
  return {
    ok: true,
    transfer: true,
    destination: ctx.onCallNumber,
    techName: tech.name,
    job: publicJob({ ...job, customerName: customer.name, phone: customer.phone }),
    message: `${triage.callerScript} On-call technician ${tech.name} has been texted. Destination ${formatPhone(ctx.onCallNumber)}.`,
  };
}

function transfer(ctx: HvacToolContext, reason: string): unknown {
  const deskOpen = isDeskOpen(HVAC_OPS, ctx.now);
  const destination = deskOpen ? ctx.transferNumber : ctx.onCallNumber;
  return {
    ok: true,
    transfer: true,
    destination,
    afterHours: !deskOpen,
    reason,
    message: deskOpen
      ? `Transfer the caller to the desk at ${formatPhone(destination)}.`
      : `The desk is closed. Transfer the caller to the on-call line at ${formatPhone(destination)}.`,
  };
}

async function textBack(ctx: HvacToolContext, args: { phone: string; reason?: string }): Promise<unknown> {
  if (phoneDigits(args.phone).length < 10) {
    return { ok: false, code: "invalid_arguments", message: "Ask for a 10-digit number before texting." };
  }
  const sent = await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "text_back",
    to: args.phone,
    body: textBackSms(),
    relatedType: "call",
    relatedId: ctx.callRowId ?? undefined,
  });
  return { ok: true, smsId: sent.id, message: "Text queued in the demo inbox. Nothing was sent to a real phone." };
}

export async function maybeTextBack(
  ctx: HvacToolContext,
  call: { id: string; callerNumber: string | null; outcome: string },
  endedReason: string | null,
): Promise<boolean> {
  if (!missedCallReason(endedReason) || !call.callerNumber) return false;
  if (call.outcome === "booked" || call.outcome === "rescheduled" || call.outcome === "escalated") return false;
  const store = new SmsStore(ctx.db);
  if (store.hasKind(HVAC_ID, "text_back", call.id)) return false;
  await ctx.sms.send({
    verticalId: HVAC_ID,
    kind: "text_back",
    to: call.callerNumber,
    body: textBackSms(),
    relatedType: "call",
    relatedId: call.id,
  });
  return true;
}

export async function simulateMissedCall(
  ctx: HvacToolContext,
  input: { name: string; phone: string },
): Promise<{ ok: true; callId: string } | { ok: false; message: string }> {
  if (phoneDigits(input.phone).length < 10) return { ok: false, message: "Use a 10-digit 555 number." };
  const calls = new CallStore(ctx.db);
  const call = calls.ensure({
    verticalId: HVAC_ID,
    vapiCallId: `missed_${ctx.now.getTime()}_${phoneDigits(input.phone)}`,
    callerNumber: input.phone,
    callerName: input.name || "Unknown caller",
    afterHours: !isDeskOpen(HVAC_OPS, ctx.now),
    now: ctx.now,
    outcome: "text_back",
    status: "completed",
    summary: "Missed call. Demo text-back queued.",
    transcript: "Caller did not connect. The desk queued a text-back.",
    endedReason: "customer-did-not-answer",
  });
  await maybeTextBack(ctx, call, "customer-did-not-answer");
  return { ok: true, callId: call.id };
}

export function outcomeForTool(name: string, result: unknown): CallOutcome | null {
  const body = result as { ok?: boolean; code?: string; priority?: string };
  if (name === "book_job" && body.ok) return "booked";
  if (name === "reschedule_job" && body.ok) return "rescheduled";
  if (name === "cancel_job" && body.ok) return "cancelled";
  if (name === "escalate_on_call" && body.ok) return "escalated";
  if (name === "transfer_to_human" && body.ok) return "transferred";
  if (name === "send_text_back" && body.ok) return "text_back";
  if (name === "book_job" && body.code === "slot_taken") return "slot_unavailable";
  if (name === "triage_issue" && body.priority === "off_topic") return "off_topic";
  return null;
}

export function callerFromTool(name: string, args: Record<string, unknown>, result: unknown): { name?: string; phone?: string } {
  const body = result as { ok?: boolean; job?: { customerName?: string; phone?: string } };
  if (body.ok && body.job?.customerName) return { name: body.job.customerName, phone: body.job.phone };
  if (typeof args.customerName === "string") return { name: args.customerName, phone: typeof args.phone === "string" ? args.phone : undefined };
  return {};
}

function publicJob(job: {
  id: string;
  jobType: string;
  priority: string;
  status: string;
  windowLabel: string;
  windowStart: string | null;
  techId: string;
  customerName: string;
  phone: string;
  address: string;
}): unknown {
  const tech = techById(HVAC_OPS, job.techId);
  return {
    id: job.id,
    jobType: job.jobType,
    label: jobLabel(job.jobType),
    priority: job.priority,
    status: job.status,
    windowLabel: job.windowLabel,
    windowStart: job.windowStart,
    techName: tech?.name ?? job.techId,
    customerName: job.customerName,
    phone: job.phone,
    address: job.address,
  };
}
