import { DateTime } from "luxon";

export const LEGAL_ID = "legal";

export const FIRM = {
  id: LEGAL_ID,
  name: "Quillmere Law LLP",
  city: "Denver, Colorado",
  address: "90 Birch Ledger Lane, Denver, CO 80205",
  addressNote: "Birch Ledger Lane is not a real street. Quillmere Law LLP is not a real law firm.",
  phoneDisplay: "(303) 555-0184",
  phoneE164: "+13035550184",
  paralegalDisplay: "(303) 555-0166",
  paralegalE164: "+13035550166",
  urgentDisplay: "(303) 555-0194",
  urgentE164: "+13035550194",
  dvHotline: "800-799-7233",
  timezone: "America/Denver",
  tzLabel: "MT",
  hours: [
    "Intake desk: Monday–Friday 9:00 AM–5:00 PM MT",
    "Saturday and Sunday: desk closed",
    "In-custody criminal calls page the on-call attorney. This demo does not dial.",
  ],
  disclaimer:
    "Portfolio demo. Quillmere Law LLP is fictional. Nothing here is legal advice, and speaking to this agent does not create an attorney-client relationship. Do not share a real Social Security number. If you are in danger, call 911. The National Domestic Violence Hotline is 800-799-7233.",
};

export const HANDLED = ["personal_injury", "family", "employment", "estate", "criminal"] as const;
export const REFERRED = ["immigration", "bankruptcy", "tax", "intellectual_property"] as const;
export type Practice = (typeof HANDLED)[number] | (typeof REFERRED)[number];

export const PRACTICE_LABELS: Record<string, string> = {
  personal_injury: "Personal injury",
  family: "Family",
  employment: "Employment",
  estate: "Estate planning",
  criminal: "Criminal defense",
  immigration: "Immigration",
  bankruptcy: "Bankruptcy",
  tax: "Tax",
  intellectual_property: "Intellectual property",
};

export type Attorney = {
  id: string;
  name: string;
  practices: string[];
  weekdays: number[];
};

export const ATTORNEYS: Attorney[] = [
  { id: "atty_quill", name: "Ada Quill", practices: ["personal_injury", "employment"], weekdays: [1, 2, 3, 4] },
  { id: "atty_hale", name: "Jonah Hale", practices: ["family", "estate"], weekdays: [2, 3, 4, 5] },
  { id: "atty_okoye", name: "Nia Okoye", practices: ["criminal"], weekdays: [1, 2, 3, 4, 5] },
];

export function attorneyById(id: string): Attorney | undefined {
  return ATTORNEYS.find((attorney) => attorney.id === id);
}

export function isDeskOpen(now: Date): boolean {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone);
  const minutes = local.hour * 60 + local.minute;
  return local.weekday >= 1 && local.weekday <= 5 && minutes >= 9 * 60 && minutes < 17 * 60;
}

/** Screening flag only. Not a legal opinion about whether a claim is timely. */
export function solFlag(practice: string, incidentDate: string, now: Date): { urgent: boolean; note: string } {
  const years = practice === "personal_injury" ? 2 : practice === "employment" ? 0.5 : 0;
  if (!years || !/^\d{4}-\d{2}-\d{2}$/.test(incidentDate)) {
    return { urgent: false, note: "No screening deadline is calculated for this practice. This is not a legal opinion." };
  }
  const incident = DateTime.fromISO(incidentDate, { zone: FIRM.timezone });
  const deadline = incident.plus({ days: Math.round(years * 365) });
  const days = deadline.diff(DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone), "days").days;
  if (days < 45) {
    return {
      urgent: true,
      note: `Screening flag: a demo deadline window is within ${Math.max(0, Math.floor(days))} days or has passed. This is not a statute-of-limitations opinion. A lawyer needs to call back first.`,
    };
  }
  return { urgent: false, note: "No urgent screening flag. This is not a statute-of-limitations opinion." };
}
