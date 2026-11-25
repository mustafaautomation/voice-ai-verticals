import { z } from "zod";

const jsonRecord = z.record(z.string(), z.unknown());
const looseArgs = z.union([z.string(), jsonRecord]).optional();

export const vapiToolCallSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),
    function: z.object({ name: z.string().optional(), arguments: looseArgs }).optional(),
    name: z.string().optional(),
    parameters: jsonRecord.optional(),
    arguments: looseArgs,
  })
  .passthrough();

const vapiPartySchema = z.object({ number: z.string().optional() }).partial();

export const vapiMessageSchema = z
  .object({
    type: z.string(),
    call: z
      .object({
        id: z.string().min(1).optional(),
        customer: vapiPartySchema.optional(),
      })
      .passthrough()
      .optional(),
    chat: z
      .object({
        id: z.string().min(1).optional(),
        sessionId: z.string().min(1).optional(),
      })
      .passthrough()
      .optional(),
    customer: vapiPartySchema.optional(),
    toolCallList: z.array(vapiToolCallSchema).optional(),
    toolCalls: z.array(vapiToolCallSchema).optional(),
    toolWithToolCallList: z
      .array(z.object({ toolCall: vapiToolCallSchema.optional() }).passthrough())
      .optional(),
    endedReason: z.string().optional(),
    summary: z.string().optional(),
    artifact: z
      .object({
        transcript: z.string().optional(),
        messages: z.array(z.unknown()).optional(),
      })
      .partial()
      .optional(),
    analysis: z.object({ summary: z.string().optional() }).partial().optional(),
  })
  .passthrough();

export const vapiEnvelopeSchema = z.object({ message: vapiMessageSchema });

export const directToolSchema = z.object({
  callId: z.string().min(1),
  toolCallId: z.string().min(1).optional(),
  callerNumber: z.string().optional(),
  arguments: jsonRecord.optional().default({}),
});

export type VapiEnvelope = z.infer<typeof vapiEnvelopeSchema>;

export type VapiMessage = z.infer<typeof vapiMessageSchema>;

export function envelopeSessionId(message: VapiMessage): string | undefined {
  return message.call?.id || message.chat?.id || message.chat?.sessionId;
}

export function envelopeCallerNumber(message: VapiMessage): string | undefined {
  const customer = message.call?.customer ?? message.customer;
  return customer && "number" in customer ? customer.number : undefined;
}

export function listedToolCalls(message: VapiMessage): Array<z.infer<typeof vapiToolCallSchema>> {
  const fromLists = [...(message.toolCallList ?? []), ...(message.toolCalls ?? [])];
  const seen = new Set<string>();
  const out: Array<z.infer<typeof vapiToolCallSchema>> = [];
  for (const call of fromLists) {
    if (seen.has(call.id)) continue;
    seen.add(call.id);
    out.push(call);
  }
  if (out.length > 0) return out;
  for (const wrapped of message.toolWithToolCallList ?? []) {
    const call = wrapped.toolCall;
    if (!call || seen.has(call.id)) continue;
    seen.add(call.id);
    out.push(call);
  }
  return out;
}


export function readArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    throw new Error("Tool arguments must be a JSON object");
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

export function toolCallName(call: z.infer<typeof vapiToolCallSchema>): string {
  return call.function?.name ?? call.name ?? "";
}

export function toolCallArguments(call: z.infer<typeof vapiToolCallSchema>): Record<string, unknown> {
  const raw = call.function?.arguments ?? call.arguments ?? call.parameters ?? {};
  return readArguments(raw);
}
