import { z } from "zod";

const who = {
  name: z.string().min(1).max(120),
  unit: z.string().min(2).max(20),
  dob: z.string().optional().default(""),
  portalCode: z.string().optional().default(""),
  relationship: z.enum(["self", "other"]).default("self"),
};

export const screenArgs = z.object({ description: z.string().min(1).max(500) });
export const verifyArgs = z.object(who);
export const ticketArgs = z.object({ ...who, description: z.string().min(1).max(400) });
export const unitArgs = z.object({ beds: z.number().int().min(0).max(4).optional() });
export const checkArgs = z.object({ unitId: z.string().min(2).max(20), days: z.number().int().min(1).max(14).optional() });
export const bookArgs = z.object({
  prospectName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
  unitId: z.string().min(2).max(20),
  start: z.string().min(1),
});
export const moveArgs = z.object({ tourId: z.string().min(1), start: z.string().min(1) });
export const cancelArgs = z.object({ tourId: z.string().min(1) });
export const faqArgs = z.object({ ...who, question: z.string().min(1).max(300) });
export const linkArgs = z.object(who);
export const transferArgs = z.object({ reason: z.string().min(1).max(300) });

export const toolArgSchemas = {
  screen_issue: screenArgs,
  verify_tenant: verifyArgs,
  open_ticket: ticketArgs,
  list_units: unitArgs,
  check_tours: checkArgs,
  book_tour: bookArgs,
  reschedule_tour: moveArgs,
  cancel_tour: cancelArgs,
  rent_faq: faqArgs,
  send_portal_link: linkArgs,
  transfer_to_leasing: transferArgs,
} as const;

export type PropertyToolName = keyof typeof toolArgSchemas;

export function isPropertyTool(name: string): name is PropertyToolName {
  return name in toolArgSchemas;
}
