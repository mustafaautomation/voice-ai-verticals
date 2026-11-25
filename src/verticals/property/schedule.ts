import { DateTime } from "luxon";
import { toUtcIso } from "../../platform/time.js";
import { FIRM } from "./brand.js";

export type Busy = { start: string };

function utcKey(value: string): string {
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? toUtcIso(parsed) : value;
}

export function slotOk(now: Date, startIso: string, busy: Busy[]): { ok: true; start: string; end: string; label: string } | { ok: false; code: string; message: string } {
  const start = DateTime.fromISO(startIso, { setZone: true });
  if (!start.isValid) return { ok: false, code: "invalid_time", message: "That time is not valid." };
  const utc = toUtcIso(start);
  const local = DateTime.fromISO(utc, { zone: "utc" }).setZone(FIRM.timezone);
  const nowLocal = DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone);
  if (local.toMillis() <= nowLocal.toMillis()) return { ok: false, code: "in_the_past", message: "That tour has already started." };
  if (local.weekday < 1 || local.weekday > 5) return { ok: false, code: "closed", message: "Tours run Monday through Friday." };
  const minutes = local.hour * 60 + local.minute;
  if (minutes < 10 * 60 || minutes > 15 * 60 + 30 || minutes % 30 !== 0) {
    return { ok: false, code: "misaligned", message: "Tours are every half hour from 10:00 AM to 3:30 PM ET." };
  }
  if (busy.some((item) => utcKey(item.start) === utc)) return { ok: false, code: "full", message: "That tour time is already booked." };
  return { ok: true, start: utc, end: toUtcIso(local.plus({ minutes: 30 })), label: `${local.toFormat("ccc LLL d, h:mm a")} ${FIRM.tzLabel}` };
}

export function listTours(now: Date, busy: Busy[], days = 5): Array<{ start: string; end: string; label: string }> {
  const startDay = DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone).startOf("day");
  const openings = [];
  for (let offset = 0; offset < days && openings.length < 6; offset += 1) {
    const day = startDay.plus({ days: offset });
    for (let minute = 10 * 60; minute <= 15 * 60 + 30 && openings.length < 6; minute += 30) {
      const local = day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
      const checked = slotOk(now, toUtcIso(local), busy);
      if (checked.ok) openings.push({ start: checked.start, end: checked.end, label: checked.label });
    }
  }
  return openings;
}

export function noticeOk(startsAt: string, now: Date): { ok: true } | { ok: false; code: string; message: string } {
  const start = DateTime.fromISO(startsAt, { zone: "utc" });
  if (start.toMillis() - now.getTime() < 4 * 60 * 60 * 1000) {
    return { ok: false, code: "inside_notice", message: "Tour changes inside four hours need the leasing office." };
  }
  return { ok: true };
}
