import { DateTime } from "luxon";
import type { SqliteDatabase } from "../../db/database.js";
import { newId } from "../../platform/ids.js";
import { toE164 } from "../../platform/phone.js";
import { toUtcIso } from "../../platform/time.js";

export type Tenant = { id: string; name: string; unitId: string; dob: string; phone: string; portalCode: string };
export type Ticket = {
  id: string;
  callerName: string;
  unitId: string;
  category: string;
  priority: string;
  summary: string;
  status: string;
  createdAt: string;
};
export type Tour = {
  id: string;
  prospectName: string;
  phone: string;
  unitId: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export class PropertyStore {
  constructor(private readonly db: SqliteDatabase) {}

  countTickets(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM property_tickets").get() as { n: number }).n;
  }

  countTenants(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM property_tenants").get() as { n: number }).n;
  }

  insertTenant(input: Tenant): void {
    this.db
      .prepare("INSERT INTO property_tenants (id, name, unit_id, dob, phone, portal_code) VALUES (?, ?, ?, ?, ?, ?)")
      .run(input.id, input.name, input.unitId, input.dob, toE164(input.phone), input.portalCode);
  }

  listTenants(): Tenant[] {
    const rows = this.db.prepare("SELECT * FROM property_tenants ORDER BY name").all() as Array<Record<string, string>>;
    return rows.map((row) => ({
      id: row.id ?? "",
      name: row.name ?? "",
      unitId: row.unit_id ?? "",
      dob: row.dob ?? "",
      phone: row.phone ?? "",
      portalCode: row.portal_code ?? "",
    }));
  }

  matchTenant(name: string, unitId: string, dob: string, portalCode: string): Tenant | null {
    const wanted = norm(name);
    const unit = unitId.trim().toLowerCase();
    return (
      this.listTenants().find((tenant) => {
        if (norm(tenant.name) !== wanted || tenant.unitId.toLowerCase() !== unit) return false;
        if (portalCode && tenant.portalCode === portalCode) return true;
        return Boolean(dob) && tenant.dob === dob;
      }) ?? null
    );
  }

  insertTicket(input: Omit<Ticket, "id" | "createdAt"> & { id?: string; now: Date }): Ticket {
    const id = input.id ?? newId("tix");
    const createdAt = toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" }));
    this.db
      .prepare("INSERT INTO property_tickets (id, caller_name, unit_id, category, priority, summary, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, input.callerName, input.unitId, input.category, input.priority, input.summary, input.status, createdAt);
    const ticket = this.listTickets().find((item) => item.id === id);
    if (!ticket) throw new Error("Ticket insert failed");
    return ticket;
  }

  listTickets(): Ticket[] {
    const rows = this.db.prepare("SELECT * FROM property_tickets ORDER BY created_at DESC").all() as Array<Record<string, string>>;
    return rows.map((row) => ({
      id: row.id ?? "",
      callerName: row.caller_name ?? "",
      unitId: row.unit_id ?? "",
      category: row.category ?? "",
      priority: row.priority ?? "",
      summary: row.summary ?? "",
      status: row.status ?? "",
      createdAt: row.created_at ?? "",
    }));
  }

  insertTour(input: Omit<Tour, "id" | "status"> & { id?: string; now: Date }): Tour {
    const id = input.id ?? newId("tour");
    this.db
      .prepare("INSERT INTO property_tours (id, prospect_name, phone, unit_id, starts_at, ends_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)")
      .run(id, input.prospectName, toE164(input.phone), input.unitId, input.startsAt, input.endsAt, toUtcIso(DateTime.fromJSDate(input.now, { zone: "utc" })));
    const tour = this.listTours().find((item) => item.id === id);
    if (!tour) throw new Error("Tour insert failed");
    return tour;
  }

  listTours(): Tour[] {
    const rows = this.db.prepare("SELECT * FROM property_tours ORDER BY starts_at").all() as Array<Record<string, string>>;
    return rows.map((row) => ({
      id: row.id ?? "",
      prospectName: row.prospect_name ?? "",
      phone: row.phone ?? "",
      unitId: row.unit_id ?? "",
      startsAt: row.starts_at ?? "",
      endsAt: row.ends_at ?? "",
      status: row.status ?? "",
    }));
  }

  getTour(id: string): Tour | null {
    return this.listTours().find((item) => item.id === id) ?? null;
  }

  moveTour(id: string, start: string, end: string): void {
    this.db.prepare("UPDATE property_tours SET starts_at = ?, ends_at = ? WHERE id = ?").run(start, end, id);
  }

  cancelTour(id: string): void {
    this.db.prepare("UPDATE property_tours SET status = 'cancelled' WHERE id = ?").run(id);
  }
}
