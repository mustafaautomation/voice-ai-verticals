import type { SqliteDatabase } from "../db/database.js";
import { isDeskOpen } from "../platform/schedule.js";
import type { SmsProvider } from "../sms/provider.js";
import type { CallOutcome, CallRecord } from "../store/calls.js";
import { HVAC_OPS } from "./hvac/brand.js";
import {
  callerFromTool,
  executeHvacTool,
  maybeTextBack,
  outcomeForTool,
  simulateMissedCall,
  type HvacToolContext,
} from "./hvac/runtime.js";
import { isHvacTool } from "./hvac/schemas.js";
import { isDeskOpen as clinicDeskOpen } from "./clinic/schedule.js";
import {
  clinicCaller,
  clinicOutcome,
  executeClinicTool,
  maybeClinicTextBack,
  simulateClinicMissedCall,
} from "./clinic/runtime.js";
import { isClinicTool } from "./clinic/schemas.js";

export type ToolContext = HvacToolContext;

export type VerticalRuntime = {
  id: string;
  isTool: (name: string) => boolean;
  execute: (name: string, args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
  outcomeFor: (name: string, result: unknown) => CallOutcome | null;
  callerFromTool: (name: string, args: Record<string, unknown>, result: unknown) => { name?: string; phone?: string };
  deskOpen: (now: Date) => boolean;
  onEndOfCall: (ctx: ToolContext, call: CallRecord, endedReason: string | null) => Promise<CallOutcome | null>;
  simulateMissedCall: (ctx: ToolContext, input: { name: string; phone: string }) => Promise<{ ok: true; callId: string } | { ok: false; message: string }>;
};

export const RUNTIMES: Record<string, VerticalRuntime> = {
  hvac: {
    id: "hvac",
    isTool: isHvacTool,
    execute: executeHvacTool,
    outcomeFor: outcomeForTool,
    callerFromTool,
    deskOpen: (now) => isDeskOpen(HVAC_OPS, now),
    onEndOfCall: async (ctx, call, endedReason) => ((await maybeTextBack(ctx, call, endedReason)) ? "text_back" : null),
    simulateMissedCall,
  },
  clinic: {
    id: "clinic",
    isTool: isClinicTool,
    execute: executeClinicTool,
    outcomeFor: clinicOutcome,
    callerFromTool: clinicCaller,
    deskOpen: clinicDeskOpen,
    onEndOfCall: async (ctx, call, endedReason) => ((await maybeClinicTextBack(ctx, call, endedReason)) ? "text_back" : null),
    simulateMissedCall: simulateClinicMissedCall,
  },
};

export function getRuntime(id: string): VerticalRuntime | null {
  return RUNTIMES[id] ?? null;
}

export function toolContext(input: {
  db: SqliteDatabase;
  sms: SmsProvider;
  fromNumber: string;
  onCallNumber: string;
  transferNumber: string;
  now: Date;
  callRowId: string | null;
}): ToolContext {
  return input;
}
