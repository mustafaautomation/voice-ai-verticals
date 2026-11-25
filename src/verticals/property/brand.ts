import { DateTime } from "luxon";

export const PROPERTY_ID = "property";

export const FIRM = {
  id: PROPERTY_ID,
  name: "Bramblefen",
  city: "Providence, Rhode Island",
  address: "14 Harbor Ledger, Providence, RI 02903",
  addressNote: "Harbor Ledger and Kiln Row are not real streets. Bramblefen is not a real property manager.",
  phoneDisplay: "(401) 555-0172",
  phoneE164: "+14015550172",
  onCallDisplay: "(401) 555-0191",
  onCallE164: "+14015550191",
  leasingDisplay: "(401) 555-0160",
  leasingE164: "+14015550160",
  timezone: "America/New_York",
  tzLabel: "ET",
  hours: [
    "Leasing office: Monday–Friday 9:00 AM–5:00 PM ET",
    "Tours: weekdays 10:00 AM–3:30 PM ET, every half hour",
    "After hours: life-safety issues page the on-call resident. This demo does not dial.",
  ],
  disclaimer:
    "Portfolio demo. Bramblefen is fictional. No rent is collected, no lock is changed, and a portal link does not take a payment. If you smell gas or you are in danger, leave and call 911.",
};

export type Building = { id: string; name: string; address: string };
export type Unit = { id: string; buildingId: string; beds: number; vacant: boolean; listedRentCents: number | null };

export const BUILDINGS: Building[] = [
  { id: "lantern", name: "Lantern House", address: "14 Harbor Ledger, Providence, RI 02903" },
  { id: "glassmill", name: "Glassmill", address: "88 Kiln Row, Providence, RI 02908" },
];

export const UNITS: Unit[] = [
  { id: "LH-204", buildingId: "lantern", beds: 1, vacant: false, listedRentCents: null },
  { id: "LH-118", buildingId: "lantern", beds: 2, vacant: false, listedRentCents: null },
  { id: "LH-310", buildingId: "lantern", beds: 1, vacant: true, listedRentCents: 164000 },
  { id: "GM-110", buildingId: "glassmill", beds: 1, vacant: false, listedRentCents: null },
  { id: "GM-102", buildingId: "glassmill", beds: 2, vacant: true, listedRentCents: 189000 },
];

export type TenantSeed = {
  id: string;
  name: string;
  unitId: string;
  dob: string;
  phone: string;
  portalCode: string;
};

export const TENANTS: TenantSeed[] = [
  { id: "ten_maya", name: "Maya Chen", unitId: "LH-204", dob: "1984-03-14", phone: "4015550141", portalCode: "4412" },
  { id: "ten_andre", name: "Andre Brooks", unitId: "GM-110", dob: "1972-11-02", phone: "4015550142", portalCode: "2208" },
  { id: "ten_priya", name: "Priya Shah", unitId: "LH-118", dob: "1991-07-19", phone: "4015550143", portalCode: "7731" },
];

export function unitById(id: string): Unit | undefined {
  return UNITS.find((unit) => unit.id.toLowerCase() === id.trim().toLowerCase());
}

export function buildingById(id: string): Building | undefined {
  return BUILDINGS.find((building) => building.id === id);
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export function isDeskOpen(now: Date): boolean {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone);
  const minutes = local.hour * 60 + local.minute;
  return local.weekday >= 1 && local.weekday <= 5 && minutes >= 9 * 60 && minutes < 17 * 60;
}
