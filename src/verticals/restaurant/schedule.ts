import { DateTime } from "luxon";
import { toUtcIso } from "../../platform/time.js";
import { DEUCES, FOURS, HOUSE, tablesFor } from "./brand.js";

export type Hold = { id: string; partySize: number; start: string; end: string; status: string };

export type Opening = { start: string; end: string; label: string };

function utcKey(value: string): string {
  const parsed = DateTime.fromISO(value, { setZone: true });
  return parsed.isValid ? toUtcIso(parsed) : value;
}

export function turnEnd(startIso: string): string {
  const start = DateTime.fromISO(startIso, { zone: "utc" });
  return toUtcIso(start.plus({ minutes: 90 }));
}

export function seatsUsed(holds: Hold[], start: string, end: string, ignoreId?: string): { deuce: number; four: number } {
  let deuce = 0;
  let four = 0;
  const open = utcKey(start);
  const close = utcKey(end);
  for (const hold of holds) {
    if (hold.status !== "scheduled" || hold.id === ignoreId) continue;
    if (utcKey(hold.start) >= close || utcKey(hold.end) <= open) continue;
    const need = tablesFor(hold.partySize);
    if (!need) continue;
    deuce += need.deuce;
    four += need.four;
  }
  return { deuce, four };
}

export function fits(holds: Hold[], party: number, start: string, end: string, ignoreId?: string): boolean {
  const need = tablesFor(party);
  if (!need) return false;
  const used = seatsUsed(holds, start, end, ignoreId);
  return used.deuce + need.deuce <= DEUCES && used.four + need.four <= FOURS;
}

export function slotOk(
  now: Date,
  startIso: string,
  party: number,
  holds: Hold[],
  ignoreId?: string,
): { ok: true; start: string; end: string; label: string } | { ok: false; code: string; message: string } {
  const start = DateTime.fromISO(startIso, { setZone: true });
  if (!start.isValid) return { ok: false, code: "invalid_time", message: "That time is not valid." };
  if (!tablesFor(party)) return { ok: false, code: "large_party", message: "Parties larger than 8 need the manager. This demo does not dial." };
  const utc = toUtcIso(start);
  const local = DateTime.fromISO(utc, { zone: "utc" }).setZone(HOUSE.timezone);
  const nowLocal = DateTime.fromJSDate(now, { zone: "utc" }).setZone(HOUSE.timezone);
  if (local.toMillis() <= nowLocal.toMillis()) return { ok: false, code: "in_the_past", message: "That seating has already started." };
  if (local.weekday < 2 || local.weekday > 6) return { ok: false, code: "closed", message: "Larkglass is closed Sunday and Monday." };
  const minutes = local.hour * 60 + local.minute;
  if (minutes < 17 * 60 || minutes > 20 * 60 + 30 || minutes % 30 !== 0) {
    return { ok: false, code: "misaligned", message: "Seatings are every half hour from 5:00 to 8:30 PM ET." };
  }
  const end = toUtcIso(local.plus({ minutes: 90 }));
  if (!fits(holds, party, utc, end, ignoreId)) return { ok: false, code: "full", message: "That seating is full for a party that size." };
  return { ok: true, start: utc, end, label: `${local.toFormat("ccc LLL d, h:mm a")} ${HOUSE.tzLabel}` };
}

export function listOpenings(now: Date, party: number, holds: Hold[], days = 5): Opening[] {
  const startDay = DateTime.fromJSDate(now, { zone: "utc" }).setZone(HOUSE.timezone).startOf("day");
  const openings: Opening[] = [];
  for (let offset = 0; offset < days && openings.length < 6; offset += 1) {
    const day = startDay.plus({ days: offset });
    for (let minute = 17 * 60; minute <= 20 * 60 + 30 && openings.length < 6; minute += 30) {
      const local = day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 });
      const checked = slotOk(now, toUtcIso(local), party, holds);
      if (checked.ok) openings.push({ start: checked.start, end: checked.end, label: checked.label });
    }
  }
  return openings;
}

export function noticeOk(startsAt: string, now: Date): { ok: true } | { ok: false; code: string; message: string } {
  const start = DateTime.fromISO(startsAt, { zone: "utc" });
  if (start.toMillis() - now.getTime() < 2 * 60 * 60 * 1000) {
    return { ok: false, code: "inside_notice", message: "Changes inside two hours need the manager." };
  }
  return { ok: true };
}
