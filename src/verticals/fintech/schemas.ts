import { z } from "zod";
import { REASON_CODES } from "./brand.js";

const last4 = z.string().regex(/^\d{4}$/);
const dob = z.string().min(8).max(10);
const relationship = z.enum(["self", "other"]).default("self");

export const verifyArgs = z.object({
  name: z.string().min(1).max(120),
  last4,
  dob: dob.optional(),
  otp: z.string().regex(/^\d{4,6}$/).optional(),
  relationship,
});

export const accountArgs = verifyArgs;

export const cardArgs = verifyArgs.extend({
  action: z.enum(["freeze", "unfreeze"]),
});

export const lostArgs = verifyArgs.extend({
  note: z.string().max(200).optional(),
});

export const disputeArgs = verifyArgs.extend({
  txnId: z.string().min(1),
  amountCents: z.number().int().positive(),
  reasonCode: z.enum(REASON_CODES),
  note: z.string().max(300).optional(),
});

export const hardshipArgs = verifyArgs.extend({
  situation: z.string().min(2).max(300),
});

export const promiseArgs = verifyArgs.extend({
  amountCents: z.number().int().positive(),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const linkArgs = verifyArgs;

export const ceaseArgs = verifyArgs;

export const fraudArgs = verifyArgs.extend({
  txnId: z.string().min(1),
  decision: z.enum(["yes", "no"]),
});

export const transferArgs = z.object({
  reason: z.string().min(1).max(300),
});

export const toolArgSchemas = {
  verify_identity: verifyArgs,
  lookup_account: accountArgs,
  card_controls: cardArgs,
  report_lost_stolen: lostArgs,
  list_transactions: accountArgs,
  dispute_intake: disputeArgs,
  record_hardship: hardshipArgs,
  promise_to_pay: promiseArgs,
  send_payment_link: linkArgs,
  set_cease_contact: ceaseArgs,
  fraud_alert: fraudArgs,
  transfer_to_fraud: transferArgs,
  transfer_to_human: transferArgs,
} as const;

export type FintechToolName = keyof typeof toolArgSchemas;

export function isFintechTool(name: string): name is FintechToolName {
  return name in toolArgSchemas;
}
