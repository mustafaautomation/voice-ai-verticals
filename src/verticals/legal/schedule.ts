import { DateTime } from "luxon";
import { toUtcIso } from "../../platform/time.js";
import { ATTORNEYS, FIRM, type Attorney } from "./brand.js";

function utcKey(value: string): string {
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? toUtcIso(parsed) : value;
}

export type Busy = { attorneyId: string; start: string; end: string };

export type Slot = { start: string; end: string; attorneyId: string; attorneyName: string; label: string };

export function listConsults(now: Date, practice: string, busy: Busy[], days = 7): Slot[] {
  const attorneys = ATTORNEYS.filter((attorney) => attorney.practices.includes(practice));
  const startDay = DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone).startOf("day");
  const slots: Slot[] = [];
  for (let offset = 0; offset < days && slots.length < 6; offset += 1) {
    const day = startDay.plus({ days: offset });
    for (const attorney of attorneys) {
      if (!attorney.weekdays.includes(day.weekday)) continue;
      for (let minute = 9 * 60; minute + 30 <= 17 * 60 && slots.length < 6; minute += 30) {
        const local = day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
        if (local.toMillis() <= DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone).toMillis()) continue;
        const start = toUtcIso(local);
        const end = toUtcIso(local.plus({ minutes: 30 }));
        if (busy.some((item) => item.attorneyId === attorney.id && utcKey(item.start) === start)) continue;
        slots.push({
          start,
          end,
          attorneyId: attorney.id,
          attorneyName: attorney.name,
          label: `${local.toFormat("ccc LLL d, h:mm a")} ${FIRM.tzLabel} · ${attorney.name}`,
        });
      }
    }
  }
  return slots;
}

export function slotOk(now: Date, attorney: Attorney, startIso: string, busy: Busy[], ignoreStart?: string): { ok: true; start: string; end: string; label: string } | { ok: false; code: string; message: string } {
  const start = DateTime.fromISO(startIso, { setZone: true });
  if (!start.isValid) return { ok: false, code: "invalid_time", message: "That time is not valid." };
  const utc = toUtcIso(start);
  const local = DateTime.fromISO(utc, { zone: "utc" }).setZone(FIRM.timezone);
  const nowLocal = DateTime.fromJSDate(now, { zone: "utc" }).setZone(FIRM.timezone);
  if (local.toMillis() <= nowLocal.toMillis()) return { ok: false, code: "in_the_past", message: "That time has already started." };
  if (!attorney.weekdays.includes(local.weekday)) return { ok: false, code: "closed", message: `${attorney.name} does not take consults that day.` };
  const minutes = local.hour * 60 + local.minute;
  if (minutes < 9 * 60 || minutes + 30 > 17 * 60 || minutes % 30 !== 0) {
    return { ok: false, code: "misaligned", message: "Consults are 30 minutes, on the hour or half hour, between 9 and 5." };
  }
  const ignored = ignoreStart ? utcKey(ignoreStart) : "";
  if (busy.some((item) => item.attorneyId === attorney.id && utcKey(item.start) === utc && utcKey(item.start) !== ignored)) {
    return { ok: false, code: "slot_taken", message: "That consult time is already booked." };
  }
  return { ok: true, start: utc, end: toUtcIso(local.plus({ minutes: 30 })), label: `${local.toFormat("ccc LLL d, h:mm a")} ${FIRM.tzLabel} · ${attorney.name}` };
}

export function noticeOk(startsAt: string, now: Date): { ok: true } | { ok: false; code: string; message: string } {
  const start = DateTime.fromISO(startsAt, { zone: "utc" });
  if (start.toMillis() - now.getTime() < 24 * 60 * 60 * 1000) {
    return { ok: false, code: "inside_notice", message: "Changes need 24 hours notice. I can transfer you to the intake desk." };
  }
  return { ok: true };
}
