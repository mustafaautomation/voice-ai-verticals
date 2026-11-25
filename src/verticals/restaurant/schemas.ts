import { z } from "zod";

const line = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1).max(4),
  modifiers: z.array(z.string()).max(4).optional().default([]),
});

const fulfillment = z.enum(["pickup", "delivery"]);

export const screenArgs = z.object({ description: z.string().min(1).max(500) });
export const menuArgs = z.object({ query: z.string().max(80).optional().default("") });
export const quoteArgs = z.object({
  items: z.array(line).min(1).max(6),
  fulfillment,
  address: z.string().max(160).optional().default(""),
  allergyNote: z.string().max(200).optional().default(""),
});
export const orderArgs = quoteArgs.extend({
  guestName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
});
export const tableArgs = z.object({
  partySize: z.number().int().min(1).max(20),
  days: z.number().int().min(1).max(14).optional(),
});
export const bookArgs = z.object({
  guestName: z.string().min(1).max(120),
  phone: z.string().min(7).max(32),
  partySize: z.number().int().min(1).max(20),
  start: z.string().min(1),
  allergyNote: z.string().max(200).optional().default(""),
});
export const moveArgs = z.object({
  reservationId: z.string().min(1),
  start: z.string().min(1),
});
export const cancelArgs = z.object({ reservationId: z.string().min(1) });
export const textArgs = z.object({ orderId: z.string().min(1) });
export const transferArgs = z.object({ reason: z.string().min(1).max(300) });

export const toolArgSchemas = {
  screen_request: screenArgs,
  lookup_menu: menuArgs,
  quote_order: quoteArgs,
  place_order: orderArgs,
  check_tables: tableArgs,
  book_table: bookArgs,
  reschedule_table: moveArgs,
  cancel_table: cancelArgs,
  send_confirmation: textArgs,
  transfer_to_manager: transferArgs,
} as const;

export type RestaurantToolName = keyof typeof toolArgSchemas;

export function isRestaurantTool(name: string): name is RestaurantToolName {
  return name in toolArgSchemas;
}
