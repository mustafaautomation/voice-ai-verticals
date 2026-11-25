import type { SqliteDatabase } from "../db/database.js";
import { newId } from "../platform/ids.js";
import { phoneDigits, toE164 } from "../platform/phone.js";
import { toUtcIso } from "../platform/time.js";
import { DateTime } from "luxon";

export type Customer = {
  id: string;
  verticalId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
};

type Row = {
  id: string;
  vertical_id: string;
  name: string;
  phone: string;
  phone_digits: string;
  email: string;
  address: string;
  notes: string;
  created_at: string;
};

function map(row: Row): Customer {
  return {
    id: row.id,
    verticalId: row.vertical_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export class CustomerStore {
  constructor(private readonly db: SqliteDatabase) {}

  list(verticalId: string): Customer[] {
    const rows = this.db
      .prepare("SELECT * FROM customers WHERE vertical_id = ? ORDER BY name COLLATE NOCASE")
      .all(verticalId) as Row[];
    return rows.map(map);
  }

  get(id: string): Customer | null {
    const row = this.db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as Row | undefined;
    return row ? map(row) : null;
  }

  findByPhone(verticalId: string, phone: string): Customer | null {
    const row = this.db
      .prepare("SELECT * FROM customers WHERE vertical_id = ? AND phone_digits = ?")
      .get(verticalId, phoneDigits(phone)) as Row | undefined;
    return row ? map(row) : null;
  }

  insert(input: {
    id?: string;
    verticalId: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
    createdAt?: string;
  }): Customer {
    const createdAt = input.createdAt ?? toUtcIso(DateTime.utc());
    const customer: Customer = {
      id: input.id ?? newId("cust"),
      verticalId: input.verticalId,
      name: input.name,
      phone: toE164(input.phone),
      email: input.email ?? "",
      address: input.address ?? "",
      notes: input.notes ?? "",
      createdAt,
    };
    this.db
      .prepare(
        `INSERT INTO customers (id, vertical_id, name, phone, phone_digits, email, address, notes, created_at)
         VALUES (@id, @verticalId, @name, @phone, @digits, @email, @address, @notes, @createdAt)`,
      )
      .run({ ...customer, digits: phoneDigits(customer.phone) });
    return customer;
  }

  upsert(input: {
    verticalId: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    notes?: string;
  }): Customer {
    const existing = this.findByPhone(input.verticalId, input.phone);
    if (!existing) return this.insert(input);
    const next = {
      ...existing,
      name: input.name || existing.name,
      address: input.address || existing.address,
      email: input.email || existing.email,
      notes: input.notes || existing.notes,
    };
    this.db
      .prepare("UPDATE customers SET name = ?, address = ?, email = ?, notes = ? WHERE id = ?")
      .run(next.name, next.address, next.email, next.notes, existing.id);
    return next;
  }
}
