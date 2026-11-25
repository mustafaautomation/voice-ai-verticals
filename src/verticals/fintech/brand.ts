import { DateTime } from "luxon";

export const FINTECH_ID = "fintech";

export const WRENLINE = {
  id: FINTECH_ID,
  name: "Wrenline",
  product: "Wrenline Card",
  city: "Austin, Texas",
  address: "18 Quill Wharf, Austin, TX 78702",
  addressNote: "Quill Wharf is not a real street. Wrenline is not a bank and is not FDIC insured.",
  phoneDisplay: "(512) 555-0148",
  phoneE164: "+15125550148",
  fraudDisplay: "(512) 555-0190",
  fraudE164: "+15125550190",
  timezone: "America/Chicago",
  tzLabel: "CT",
  hours: [
    "Support desk: Monday–Friday 8:00 AM–8:00 PM CT",
    "Saturday: 9:00 AM–5:00 PM CT",
    "Sunday: desk closed",
    "Fraud desk: the transfer number is fictional and this demo does not dial it.",
  ],
  disclaimer:
    "Portfolio demo. Wrenline is a fictional card app, not a bank, not a creditor, and not FDIC insured. Balances, debts, and cards are made up. Do not speak a real card number, CVV, PIN, or password. No payment on this demo moves money.",
};

export const MINI_MIRANDA =
  "This is an attempt to collect a debt, and any information obtained will be used for that purpose. Wrenline is a fictional demo, not a real creditor, and nothing on this call can collect a real payment.";

export const REASON_CODES = ["unauthorized", "not_received", "duplicate", "wrong_amount", "canceled_recurring", "quality"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export function isDeskOpen(now: Date): boolean {
  const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(WRENLINE.timezone);
  const minutes = local.hour * 60 + local.minute;
  if (local.weekday === 7) return false;
  if (local.weekday === 6) return minutes >= 9 * 60 && minutes < 17 * 60;
  return minutes >= 8 * 60 && minutes < 20 * 60;
}

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
