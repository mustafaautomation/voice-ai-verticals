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

export const vapiMessageSchema = z
  .object({
    type: z.string(),
    call: z
      .object({
        id: z.string().min(1),
        customer: z.object({ number: z.string().optional() }).partial().optional(),
      })
      .optional(),
    toolCallList: z.array(vapiToolCallSchema).optional(),
    toolCalls: z.array(vapiToolCallSchema).optional(),
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
