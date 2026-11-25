import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DateTime } from "luxon";
import { z } from "zod";
import type { SqliteDatabase } from "../db/database.js";
import { toUtcIso } from "../platform/time.js";
import type { SmsProvider } from "../sms/provider.js";
import { CallStore, strongerOutcome, type CallOutcome, type CallRecord } from "../store/calls.js";
import { getRuntime, toolContext, type ToolContext } from "../verticals/registry.js";
import { verifyVapiSecret } from "./auth.js";
import { directToolSchema, toolCallArguments, toolCallName, vapiEnvelopeSchema, type VapiEnvelope } from "./envelope.js";

export type VapiRouteDeps = {
  secret: string;
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: () => Date;
};

type Normalized = {
  callId: string;
  toolCallId: string;
  callerNumber?: string;
  name: string;
  args: Record<string, unknown>;
};

export async function registerVapiRoutes(app: FastifyInstance, deps: VapiRouteDeps): Promise<void> {
  app.post("/v/:verticalId/vapi/webhook", async (request, reply) => {
    if (!authorize(request, reply, deps.secret)) return;
    const verticalId = verticalParam(request);
    if (!getRuntime(verticalId)) return reply.code(404).send({ error: "unknown_vertical" });
    const parsed = vapiEnvelopeSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply, parsed.error);
    return handleEnvelope(verticalId, parsed.data, reply, deps);
  });

  app.post("/v/:verticalId/vapi/tools/:toolName", async (request, reply) => {
    if (!authorize(request, reply, deps.secret)) return;
    const verticalId = verticalParam(request);
    const runtime = getRuntime(verticalId);
    const toolName = (request.params as { toolName?: string }).toolName ?? "";
    if (!runtime || !runtime.isTool(toolName)) {
      return reply.code(404).send({ error: "unknown_tool", message: `Unknown tool ${toolName}.` });
    }
    const envelope = vapiEnvelopeSchema.safeParse(request.body);
    if (envelope.success) {
      const message = envelope.data.message;
      if (message.type !== "tool-calls" && message.type !== "function-call") {
        return reply.code(400).send({ error: "invalid_payload", issues: [{ path: "message.type", message: "Tool URL expects a tool-calls message." }] });
      }
      return handleEnvelope(verticalId, envelope.data, reply, deps, toolName);
    }
    const direct = directToolSchema.safeParse(request.body);
    if (!direct.success) return invalid(reply, direct.error);
    const result = await runOne(
      verticalId,
      {
        callId: direct.data.callId,
        toolCallId: direct.data.toolCallId ?? `direct_${toolName}`,
        callerNumber: direct.data.callerNumber,
        name: toolName,
        args: direct.data.arguments,
      },
      deps,
    );
    return reply.code(200).send({ ok: true, result });
  });
}

function verticalParam(request: FastifyRequest): string {
  return (request.params as { verticalId?: string }).verticalId ?? "";
}

function authorize(request: FastifyRequest, reply: FastifyReply, secret: string): boolean {
  if (!verifyVapiSecret(request.headers["x-vapi-secret"], secret)) {
    void reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}

function invalid(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.code(400).send({
    error: "invalid_payload",
    issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  });
}

async function handleEnvelope(
  verticalId: string,
  envelope: VapiEnvelope,
  reply: FastifyReply,
  deps: VapiRouteDeps,
  expectedTool?: string,
): Promise<FastifyReply> {
  const type = envelope.message.type;
  if (type === "end-of-call-report") return handleEndOfCall(verticalId, envelope, reply, deps);
  if (type === "tool-calls" || type === "function-call") return handleToolCalls(verticalId, envelope, reply, deps, expectedTool);
  return reply.code(200).send({ ok: true, ignored: type });
}

async function handleToolCalls(
  verticalId: string,
  envelope: VapiEnvelope,
  reply: FastifyReply,
  deps: VapiRouteDeps,
  expectedTool?: string,
): Promise<FastifyReply> {
  const callId = envelope.message.call?.id;
  if (!callId) return reply.code(400).send({ error: "invalid_payload", issues: [{ path: "message.call.id", message: "Required" }] });
  const listed = envelope.message.toolCallList ?? envelope.message.toolCalls ?? [];
  if (listed.length === 0) {
    return reply.code(400).send({ error: "invalid_payload", issues: [{ path: "message.toolCallList", message: "At least one tool call is required." }] });
  }
  const results = [];
  for (const toolCall of listed) {
    let args: Record<string, unknown>;
    try {
      args = toolCallArguments(toolCall);
    } catch {
      results.push({ toolCallId: toolCall.id, result: { ok: false, code: "invalid_arguments", message: "Tool arguments must be a JSON object." } });
      continue;
    }
    const name = toolCallName(toolCall);
    if (expectedTool && name && name !== expectedTool) {
      results.push({ toolCallId: toolCall.id, result: { ok: false, code: "tool_mismatch", message: `This URL only accepts ${expectedTool}.` } });
      continue;
    }
    const result = await runOne(
      verticalId,
      { callId, toolCallId: toolCall.id, callerNumber: envelope.message.call?.customer?.number, name: name || expectedTool || "", args },
      deps,
    );
    results.push({ toolCallId: toolCall.id, result });
  }
  // Vapi requires each result (or error) to be a single-line string. Objects are ignored as "no result returned".
  return reply.code(200).send({
    results: results.map((row) => ({
      toolCallId: row.toolCallId,
      result: typeof row.result === "string" ? row.result : JSON.stringify(row.result),
    })),
  });
}

async function runOne(verticalId: string, call: Normalized, deps: VapiRouteDeps): Promise<unknown> {
  const runtime = getRuntime(verticalId);
  if (!runtime) return { ok: false, code: "unknown_vertical", message: "Unknown vertical." };
  const now = deps.now();
  const calls = new CallStore(deps.db);
  const record = calls.ensure({
    verticalId,
    vapiCallId: call.callId,
    callerNumber: call.callerNumber,
    afterHours: !runtime.deskOpen(now),
    now,
  });
  const cached = calls.findToolCall(record.id, call.toolCallId);
  if (cached) return cached.result;
  const ctx: ToolContext = toolContext({
    db: deps.db,
    sms: deps.sms,
    fromNumber: deps.fromNumber,
    onCallNumber: deps.onCallNumber,
    transferNumber: deps.transferNumber,
    now,
    callRowId: record.id,
  });
  const result = await runtime.execute(call.name, call.args, ctx);
  const raced = calls.saveToolCallSafe({
    callRowId: record.id,
    toolCallId: call.toolCallId,
    name: call.name,
    arguments: call.args,
    result,
    now,
  });
  if (raced) return raced.result;
  applyOutcome(calls, runtime, record, call.name, call.args, result);
  return result;
}

function applyOutcome(
  calls: CallStore,
  runtime: NonNullable<ReturnType<typeof getRuntime>>,
  record: CallRecord,
  name: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  const current = calls.getById(record.id) ?? record;
  const next = runtime.outcomeFor(name, result);
  const who = runtime.callerFromTool(name, args, result);
  const outcome = next ? strongerOutcome(current.outcome, next) : current.outcome;
  const callerName = who.name ?? current.callerName;
  const callerNumber = who.phone ?? current.callerNumber;
  if (outcome === current.outcome && callerName === current.callerName && callerNumber === current.callerNumber) return;
  calls.update({ ...current, callerName, callerNumber, outcome });
}

async function handleEndOfCall(verticalId: string, envelope: VapiEnvelope, reply: FastifyReply, deps: VapiRouteDeps): Promise<FastifyReply> {
  const runtime = getRuntime(verticalId);
  const vapiCallId = envelope.message.call?.id;
  if (!runtime || !vapiCallId) {
    return reply.code(400).send({ error: "invalid_payload", issues: [{ path: "message.call.id", message: "Required" }] });
  }
  const calls = new CallStore(deps.db);
  const key = `eoc:${verticalId}:${vapiCallId}`;
  const cached = calls.getIdempotency(key);
  if (isFinal(cached)) return reply.code(200).send(cached);
  const now = deps.now();
  if (!calls.insertIdempotency(key, { pending: true }, now)) {
    const again = calls.getIdempotency(key);
    if (isFinal(again)) return reply.code(200).send(again);
    return reply.code(409).send({ error: "in_progress" });
  }
  try {
    const record = calls.ensure({
      verticalId,
      vapiCallId,
      callerNumber: envelope.message.call?.customer?.number,
      afterHours: !runtime.deskOpen(now),
      now,
    });
    const summary = envelope.message.analysis?.summary || envelope.message.summary || record.summary || "";
    const transcript = envelope.message.artifact?.transcript || transcriptFrom(envelope.message.artifact?.messages ?? []) || record.transcript || "";
    const ctx = toolContext({
      db: deps.db,
      sms: deps.sms,
      fromNumber: deps.fromNumber,
      onCallNumber: deps.onCallNumber,
      transferNumber: deps.transferNumber,
      now,
      callRowId: record.id,
    });
    const fresh = calls.getById(record.id) ?? record;
    const extra = await runtime.onEndOfCall(ctx, fresh, envelope.message.endedReason ?? null);
    let outcome: CallOutcome = fresh.outcome;
    if (extra) outcome = strongerOutcome(outcome, extra);
    if (outcome === "in_progress") outcome = "completed";
    calls.update({
      ...fresh,
      status: "completed",
      outcome,
      summary: summary || fresh.summary,
      transcript: transcript.slice(0, 50_000),
      endedReason: envelope.message.endedReason ?? null,
      endedAt: toUtcIso(DateTime.fromJSDate(now, { zone: "utc" })),
    });
    const body = { ok: true, callId: record.id, outcome };
    calls.saveIdempotency(key, body, now);
    return reply.code(200).send(body);
  } catch (error) {
    calls.deleteIdempotency(key);
    throw error;
  }
}

function isFinal(value: unknown): value is { ok: true; callId: string } {
  return Boolean(value && typeof value === "object" && (value as { ok?: boolean }).ok === true && !("pending" in (value as object)));
}

function transcriptFrom(messages: unknown[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const row = message as { role?: string; message?: string; content?: string };
    const text = typeof row.message === "string" ? row.message : typeof row.content === "string" ? row.content : "";
    if (!text) continue;
    lines.push(`${row.role ?? "unknown"}: ${text}`);
  }
  return lines.join("\n");
}
