import { z } from "zod";
import { JOB_TYPE_IDS } from "./brand.js";

const jobType = z.enum(JOB_TYPE_IDS);
const priority = z.enum(["emergency", "urgent", "routine"]);

export const triageArgs = z.object({
  description: z.string().min(1).max(500),
  outdoorTempF: z.number().min(-80).max(140).optional(),
  vulnerableOccupant: z.boolean().optional(),
  jobType: jobType.optional(),
});

export const checkArgs = z.object({
  jobType: jobType,
  priority: priority.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(14).optional(),
});

export const lookupArgs = z.object({
  phone: z.string().min(7).max(32),
});

export const bookArgs = z.object({
  windowStart: z.string().min(1),
  customerName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
  address: z.string().min(5).max(200),
  jobType: jobType,
  priority: priority.optional(),
  description: z.string().min(1).max(500),
  outdoorTempF: z.number().min(-80).max(140).optional(),
  vulnerableOccupant: z.boolean().optional(),
  email: z.string().email().optional(),
});

export const rescheduleArgs = z.object({
  jobId: z.string().min(1),
  windowStart: z.string().min(1),
});

export const cancelArgs = z.object({
  jobId: z.string().min(1),
  reason: z.string().max(300).optional(),
});

export const escalateArgs = z.object({
  reason: z.string().min(1).max(300),
  customerName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
  address: z.string().min(5).max(200),
  description: z.string().min(1).max(500),
});

export const transferArgs = z.object({
  reason: z.string().min(1).max(300),
});

export const textBackArgs = z.object({
  phone: z.string().min(7).max(32),
  reason: z.string().max(300).optional(),
});

export const toolArgSchemas = {
  triage_issue: triageArgs,
  lookup_customer: lookupArgs,
  check_windows: checkArgs,
  book_job: bookArgs,
  reschedule_job: rescheduleArgs,
  cancel_job: cancelArgs,
  escalate_on_call: escalateArgs,
  transfer_to_human: transferArgs,
  send_text_back: textBackArgs,
} as const;

export type HvacToolName = keyof typeof toolArgSchemas;

export function isHvacTool(name: string): name is HvacToolName {
  return name in toolArgSchemas;
}
