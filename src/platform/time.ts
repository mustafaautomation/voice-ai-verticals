import { DateTime } from "luxon";

export function toUtcIso(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd'T'HH:mm:ss'Z'");
}

export function parseToUtcIso(input: string): string | null {
  const dt = DateTime.fromISO(input, { setZone: true });
  if (!dt.isValid) return null;
  return toUtcIso(dt);
}

export function zonedNow(now: Date, zone: string): DateTime {
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(zone);
}

export function formatStamp(isoUtc: string, zone: string): string {
  const dt = DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone);
  if (!dt.isValid) return isoUtc;
  return dt.toFormat("ccc LLL d, h:mm a");
}
