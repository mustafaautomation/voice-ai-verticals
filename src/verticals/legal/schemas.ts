import { z } from "zod";
import { HANDLED } from "./brand.js";

const practice = z.enum(HANDLED);
const role = z.enum(["client", "opposing", "other"]).default("client");

export const screenArgs = z.object({
  description: z.string().min(1).max(500),
  role,
});

export const conflictArgs = z.object({
  callerName: z.string().min(1).max(120),
  opposingParty: z.string().min(1).max(160),
  role,
});

export const matterArgs = z.object({
  callerName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
  practice,
  opposingParty: z.string().max(160).optional().default(""),
  incidentDate: z.string().optional().default(""),
  jurisdiction: z.string().max(80).optional().default("Denver, Colorado"),
  summary: z.string().min(1).max(400),
  role,
});

export const slotsArgs = z.object({
  practice,
  days: z.number().int().min(1).max(14).optional(),
});

export const bookArgs = z.object({
  matterId: z.string().min(1),
  attorneyId: z.string().min(1),
  start: z.string().min(1),
  consultType: z.enum(["free", "paid"]).default("free"),
});

export const moveArgs = z.object({
  consultId: z.string().min(1),
  start: z.string().min(1),
  attorneyId: z.string().optional(),
});

export const cancelArgs = z.object({
  consultId: z.string().min(1),
  reason: z.string().max(200).optional(),
});

export const summaryArgs = z.object({
  matterId: z.string().min(1),
});

export const pageArgs = z.object({
  callerName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
  location: z.string().min(2).max(160),
});

export const transferArgs = z.object({
  reason: z.string().min(1).max(300),
});

export const toolArgSchemas = {
  screen_inquiry: screenArgs,
  conflict_check: conflictArgs,
  open_matter: matterArgs,
  check_consults: slotsArgs,
  book_consult: bookArgs,
  reschedule_consult: moveArgs,
  cancel_consult: cancelArgs,
  send_intake_summary: summaryArgs,
  page_attorney: pageArgs,
  transfer_to_paralegal: transferArgs,
  transfer_to_human: transferArgs,
} as const;

export type LegalToolName = keyof typeof toolArgSchemas;

export function isLegalTool(name: string): name is LegalToolName {
  return name in toolArgSchemas;
}
