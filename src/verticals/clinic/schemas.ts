import { z } from "zod";
import { VISIT_TYPES } from "./brand.js";

const visitType = z.enum(VISIT_TYPES);
const dob = z.string().min(8).max(10);

export const verifyArgs = z.object({
  name: z.string().min(1).max(120),
  dob,
  phone: z.string().min(7).max(32).optional(),
  relationship: z.enum(["self", "other"]).default("self"),
});

export const triageArgs = z.object({
  description: z.string().min(1).max(500),
});

export const slotArgs = z.object({
  visitType,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(14).optional(),
  providerId: z.string().optional(),
});

export const bookArgs = z.object({
  name: z.string().min(1).max(120),
  dob,
  phone: z.string().min(7).max(32),
  relationship: z.enum(["self", "other"]).default("self"),
  visitType,
  start: z.string().min(1),
  providerId: z.string().min(1),
  reason: z.string().min(1).max(300),
});

export const moveArgs = z.object({
  name: z.string().min(1).max(120),
  dob,
  relationship: z.enum(["self", "other"]).default("self"),
  appointmentId: z.string().min(1),
  start: z.string().min(1),
  providerId: z.string().optional(),
});

export const cancelArgs = z.object({
  name: z.string().min(1).max(120),
  dob,
  relationship: z.enum(["self", "other"]).default("self"),
  appointmentId: z.string().min(1),
  reason: z.string().max(300).optional(),
});

export const insuranceArgs = z.object({
  name: z.string().min(1).max(120),
  dob,
  relationship: z.enum(["self", "other"]).default("self"),
  payer: z.string().min(2).max(80),
  memberId: z.string().min(4).max(40),
});

export const refillArgs = z.object({
  name: z.string().min(1).max(120),
  dob,
  phone: z.string().min(7).max(32),
  relationship: z.enum(["self", "other"]).default("self"),
  medication: z.string().min(2).max(120),
  pharmacy: z.string().min(2).max(160),
});

export const nurseArgs = z.object({
  reason: z.string().min(1).max(300),
  description: z.string().min(1).max(500),
});

export const transferArgs = z.object({
  reason: z.string().min(1).max(300),
});

export const textArgs = z.object({
  phone: z.string().min(7).max(32),
  reason: z.string().max(200).optional(),
});

export const toolArgSchemas = {
  verify_identity: verifyArgs,
  triage_symptoms: triageArgs,
  check_slots: slotArgs,
  book_visit: bookArgs,
  reschedule_visit: moveArgs,
  cancel_visit: cancelArgs,
  capture_insurance: insuranceArgs,
  request_refill: refillArgs,
  transfer_to_nurse: nurseArgs,
  transfer_to_human: transferArgs,
  send_text_back: textArgs,
} as const;

export type ClinicToolName = keyof typeof toolArgSchemas;

export function isClinicTool(name: string): name is ClinicToolName {
  return name in toolArgSchemas;
}
