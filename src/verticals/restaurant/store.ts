import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { newId } from "../../platform/ids.js";
import { toE164 } from "../../platform/phone.js";
import { toUtcIso } from "../../platform/time.js";

export type Line = { sku: string; name: string; qty: number; modifiers: string[]; cents: number };
export type Ticket = {
  id: string;
  guestName: string;
  phone: string;
  fulfillment: string;
  address: string;
  lines: Line[];
  allergy: string;
  subtotalCents: number;
  feeCents: number;
  taxCents: number;
  totalCents: number;
  status: string;
  createdAt: string;
};
export type Reservation = {
  id: string;
  guestName: string;
  phone: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  allergy: string;
  status: string;
};

function parseLines(raw: string): Line[] {
  const parsed = JSON.parse(raw) as Line[];
  return Array.isArray(parsed) ? parsed : [];
}

export class RestaurantStore {
  constructor(private readonly db: SqliteDatabase) {}

  countTickets(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM restaurant_orders").get() as { n: number }).n;
  }

  insertTicket(input: Omit<Ticket, "id" | "createdAt"> & { id?: string; now: Date }): Ticket {
    const id = input.id ?? newId("ord");
    const createdAt = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db
      .prepare(
        `INSERT INTO restaurant_orders (
          id, guest_name, phone, fulfillment, address, lines_json, allergy, subtotal_cents, fee_cents, tax_cents, total_cents, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.guestName,
        toE164(input.phone),
        input.fulfillment,
        input.address,
        JSON.stringify(input.lines),
        input.allergy,
        input.subtotalCents,
        input.feeCents,
        input.taxCents,
        input.totalCents,
        input.status,
        createdAt,
      );
    const ticket = this.listTickets().find((item) => item.id === id);
    if (!ticket) throw new Error("Ticket insert failed");
    return ticket;
  }

  listTickets(): Ticket[] {
    const rows = this.db.prepare("SELECT * FROM restaurant_orders ORDER BY created_at DESC").all() as Array<Record<string, string | number>>;
    return rows.map((row) => ({
      id: String(row.id),
      guestName: String(row.guest_name),
      phone: String(row.phone),
      fulfillment: String(row.fulfillment),
      address: String(row.address ?? ""),
      lines: parseLines(String(row.lines_json ?? "[]")),
      allergy: String(row.allergy ?? ""),
      subtotalCents: Number(row.subtotal_cents),
      feeCents: Number(row.fee_cents),
      taxCents: Number(row.tax_cents),
      totalCents: Number(row.total_cents),
      status: String(row.status),
      createdAt: String(row.created_at),
    }));
  }

  getTicket(id: string): Ticket | null {
    return this.listTickets().find((item) => item.id === id) ?? null;
  }

  insertReservation(input: Omit<Reservation, "id"> & { id?: string; now: Date }): Reservation {
    const id = input.id ?? newId("res");
    this.db
      .prepare(
        `INSERT INTO restaurant_reservations (
          id, guest_name, phone, party_size, starts_at, ends_at, allergy, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.guestName, toE164(input.phone), input.partySize, input.startsAt, input.endsAt, input.allergy, input.status, toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" })));
    const row = this.listReservations().find((item) => item.id === id);
    if (!row) throw new Error("Reservation insert failed");
    return row;
  }

  listReservations(): Reservation[] {
    const rows = this.db.prepare("SELECT * FROM restaurant_reservations ORDER BY starts_at").all() as Array<Record<string, string | number>>;
    return rows.map((row) => ({
      id: String(row.id),
      guestName: String(row.guest_name),
      phone: String(row.phone),
      partySize: Number(row.party_size),
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      allergy: String(row.allergy ?? ""),
      status: String(row.status),
    }));
  }

  getReservation(id: string): Reservation | null {
    return this.listReservations().find((item) => item.id === id) ?? null;
  }

  moveReservation(id: string, start: string, end: string): void {
    this.db.prepare("UPDATE restaurant_reservations SET starts_at = ?, ends_at = ? WHERE id = ?").run(start, end, id);
  }

  cancelReservation(id: string): void {
    this.db.prepare("UPDATE restaurant_reservations SET status = 'cancelled' WHERE id = ?").run(id);
  }
}
