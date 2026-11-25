import { DateTime } from "luxon";
import { toUtcIso } from "../../platform/time.js";
import { CLINIC, PROVIDERS, VISIT_MINUTES, providerById, visitLabel, type ProviderDef, type VisitType } from "./brand.js";

export type BusyRange = { providerId: string; start: string; end: string; id?: string };

export type SlotOffer = {
  start: string;
  end: string;
  label: string;
  providerId: string;
  providerName: string;
  visitType: VisitType;
};

export type SlotCode = "unknown_visit" | "invalid_time" | "in_the_past" | "too_far" | "closed" | "misaligned" | "slot_taken" | "no_provider";

const LEAD_DAYS = 60;
const STEP = 20;

export function isDeskOpen(now: Date): boolean {
  const local = zoned(now);
  const close = closeMin(local.weekday);
  if (close === null) return false;
  const minutes = local.hour * 60 + local.minute;
  return minutes >= 8 * 60 && minutes < close;
}

export function listSlots(
  now: Date,
  busy: readonly BusyRange[],
  query: { visitType: VisitType; date?: string; days?: number; providerId?: string },
): { ok: true; slots: SlotOffer[]; message: string } | { ok: false; code: SlotCode; message: string } {
  if (!VISIT_MINUTES[query.visitType]) return { ok: false, code: "unknown_visit", message: "That visit type is not on the schedule." };
  const days = Math.min(Math.max(query.days ?? 7, 1), 14);
  const startDay = query.date ? DateTime.fromISO(query.date, { zone: CLINIC.timezone }).startOf("day") : zoned(now).startOf("day");
  if (!startDay.isValid) return { ok: false, code: "invalid_time", message: "That date is not valid." };
  const slots: SlotOffer[] = [];
  for (let offset = 0; offset < days && slots.length < 8; offset += 1) {
    const day = startDay.plus({ days: offset });
    for (const provider of providersFor(query.visitType, query.providerId)) {
      if (!works(provider, day.weekday)) continue;
      const close = providerClose(provider, day.weekday);
      for (let minute = provider.openMin; minute + VISIT_MINUTES[query.visitType] <= close && slots.length < 8; minute += STEP) {
        const start = toUtcIso(day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 }));
        const resolved = resolveSlot(now, busy, { visitType: query.visitType, providerId: provider.id, start });
        if (resolved.ok) slots.push(resolved.slot);
      }
    }
  }
  const message = slots.length
    ? `Open slots: ${slots.map((slot) => slot.label).join("; ")}.`
    : "No open slots in that range.";
  return { ok: true, slots, message };
}

export function resolveSlot(
  now: Date,
  busy: readonly BusyRange[],
  input: { visitType: VisitType; providerId: string; start: string },
): { ok: true; slot: SlotOffer } | { ok: false; code: SlotCode; message: string } {
  const provider = providerById(input.providerId);
  if (!provider || !provider.visitTypes.includes(input.visitType)) {
    return { ok: false, code: "no_provider", message: "That clinician does not offer that visit type." };
  }
  const parsed = DateTime.fromISO(input.start, { setZone: true });
  if (!parsed.isValid) return { ok: false, code: "invalid_time", message: "That time is not valid." };
  const startUtc = toUtcIso(parsed);
  const local = DateTime.fromISO(startUtc, { zone: "utc" }).setZone(CLINIC.timezone);
  const nowLocal = zoned(now);
  if (local.toMillis() <= nowLocal.toMillis()) return { ok: false, code: "in_the_past", message: "That time has already started." };
  if (local.diff(nowLocal, "days").days > LEAD_DAYS) {
    return { ok: false, code: "too_far", message: `${CLINIC.name} books up to ${LEAD_DAYS} days ahead.` };
  }
  if (!works(provider, local.weekday)) return { ok: false, code: "closed", message: `${provider.name} is not in clinic that day.` };
  const minutes = local.hour * 60 + local.minute;
  const close = providerClose(provider, local.weekday);
  const duration = VISIT_MINUTES[input.visitType];
  if (local.second !== 0 || (minutes - provider.openMin) % STEP !== 0 || minutes < provider.openMin || minutes + duration > close) {
    return { ok: false, code: "misaligned", message: "Visits start every 20 minutes during clinic hours." };
  }
  const end = toUtcIso(local.plus({ minutes: duration }));
  const clash = busy.some((range) => range.providerId === provider.id && overlaps(startUtc, end, range.start, range.end));
  if (clash) return { ok: false, code: "slot_taken", message: "That time is already booked. I can look for another opening." };
  return {
    ok: true,
    slot: {
      start: startUtc,
      end,
      providerId: provider.id,
      providerName: provider.name,
      visitType: input.visitType,
      label: `${local.toFormat("ccc LLL d, h:mm a")} ${CLINIC.tzLabel} · ${provider.name} · ${visitLabel(input.visitType)}`,
    },
  };
}

export function canChange(startsAt: string, visitType: VisitType, status: string, now: Date): { ok: true } | { ok: false; code: string; message: string } {
  if (status === "cancelled") return { ok: false, code: "already_cancelled", message: "That visit is already cancelled." };
  if (status !== "scheduled") return { ok: false, code: "not_open", message: "That visit can no longer be changed here." };
  const start = DateTime.fromISO(startsAt, { zone: "utc" });
  const hours = visitType === "sick" ? 1 : 4;
  if (!start.isValid || start.toMillis() - now.getTime() < hours * 60 * 60 * 1000) {
    return { ok: false, code: "inside_notice", message: `Changes need ${hours} hours notice. I can transfer you to the desk.` };
  }
  return { ok: true };
}

function providersFor(visitType: VisitType, providerId?: string): ProviderDef[] {
  return PROVIDERS.filter((provider) => provider.visitTypes.includes(visitType) && (!providerId || provider.id === providerId));
}

function works(provider: ProviderDef, weekday: number): boolean {
  return provider.weekdays.includes(weekday);
}

function providerClose(provider: ProviderDef, weekday: number): number {
  if (weekday === 6 && provider.saturdayCloseMin) return provider.saturdayCloseMin;
  return provider.closeMin;
}

function closeMin(weekday: number): number | null {
  if (weekday >= 1 && weekday <= 5) return 17 * 60;
  if (weekday === 6) return 12 * 60;
  return null;
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a0 = Date.parse(aStart);
  const a1 = Date.parse(aEnd);
  const b0 = Date.parse(bStart);
  const b1 = Date.parse(bEnd);
  return a0 < b1 && b0 < a1;
}

function zoned(now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(CLINIC.timezone);
}
