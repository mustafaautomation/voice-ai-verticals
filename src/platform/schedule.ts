import { DateTime } from "luxon";
import { parseToUtcIso, toUtcIso } from "./time.js";

export type Priority = "emergency" | "urgent" | "routine";
export type JobStatus = "scheduled" | "dispatched" | "completed" | "cancelled";

export type JobTypeDef = {
  id: string;
  label: string;
  skills: string[];
  routineBookable: boolean;
};

export type WindowDef = {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  weekdays: number[];
};

export type TechDef = {
  id: string;
  name: string;
  phone: string;
  skills: string[];
  onCallWeekdays: number[];
};

export type OfficeHours = { weekday: number; openMin: number; closeMin: number };

export type OpsConfig = {
  verticalId: string;
  timezone: string;
  tzLabel: string;
  brandName: string;
  windows: WindowDef[];
  jobTypes: JobTypeDef[];
  techs: TechDef[];
  officeHours: OfficeHours[];
  leadDays: number;
  cancelNoticeHours: { urgent: number; routine: number };
};

export type WindowOffer = {
  start: string;
  end: string;
  label: string;
  techId: string;
  techName: string;
};

export type ScheduleCode =
  | "unknown_job_type"
  | "not_bookable"
  | "invalid_time"
  | "in_the_past"
  | "too_far"
  | "closed"
  | "misaligned"
  | "slot_taken"
  | "no_tech";

export type ResolveResult = { ok: true; offer: WindowOffer } | { ok: false; code: ScheduleCode; message: string };

export function jobTypeById(config: OpsConfig, id: string): JobTypeDef | undefined {
  return config.jobTypes.find((jobType) => jobType.id === id);
}

export function techById(config: OpsConfig, id: string): TechDef | undefined {
  return config.techs.find((tech) => tech.id === id);
}

export function isDeskOpen(config: OpsConfig, now: Date): boolean {
  const local = zoned(config, now);
  const hours = config.officeHours.find((row) => row.weekday === local.weekday);
  if (!hours) return false;
  const minutes = local.hour * 60 + local.minute;
  return minutes >= hours.openMin && minutes < hours.closeMin;
}

export function onCallTech(config: OpsConfig, now: Date, skills: string[]): TechDef | undefined {
  const weekday = zoned(config, now).weekday;
  const skilled = config.techs.filter((tech) => sharesSkill(tech, skills));
  return (
    skilled.find((tech) => tech.onCallWeekdays.includes(weekday)) ??
    skilled[0] ??
    config.techs.find((tech) => tech.onCallWeekdays.includes(weekday)) ??
    config.techs[0]
  );
}

export function listOffers(
  config: OpsConfig,
  now: Date,
  taken: ReadonlySet<string>,
  query: { date?: string; days?: number; jobTypeId: string; priority: Priority },
): { ok: true; windows: WindowOffer[]; message: string } | { ok: false; code: ScheduleCode; message: string } {
  const jobType = jobTypeById(config, query.jobTypeId);
  if (!jobType) return { ok: false, code: "unknown_job_type", message: "That job type is not on the Fennwick board." };
  if (!jobType.routineBookable || query.priority === "emergency") {
    return {
      ok: false,
      code: "not_bookable",
      message: "Do not book an arrival window. Give the safety instructions and escalate to the on-call technician.",
    };
  }
  const days = Math.min(Math.max(query.days ?? 7, 1), 14);
  const startDay = query.date
    ? DateTime.fromISO(query.date, { zone: config.timezone }).startOf("day")
    : zoned(config, now).startOf("day");
  if (!startDay.isValid) return { ok: false, code: "invalid_time", message: "That date is not valid." };
  const windows: WindowOffer[] = [];
  for (let offset = 0; offset < days && windows.length < 8; offset += 1) {
    const day = startDay.plus({ days: offset });
    for (const windowDef of config.windows) {
      if (!windowDef.weekdays.includes(day.weekday)) continue;
      const resolved = resolveWindow(config, now, taken, {
        jobTypeId: query.jobTypeId,
        priority: query.priority,
        startIso: isoAt(config, day, windowDef.startMin),
      });
      if (resolved.ok) windows.push(resolved.offer);
    }
  }
  const message =
    windows.length === 0
      ? "No open arrival windows in that range. Offer the next listed day, or escalate if this is urgent and the desk is closed."
      : `Open windows: ${windows.map((window) => `${window.label} with ${window.techName}`).join("; ")}.`;
  return { ok: true, windows, message };
}

export function resolveWindow(
  config: OpsConfig,
  now: Date,
  taken: ReadonlySet<string>,
  input: { jobTypeId: string; priority: Priority; startIso: string },
): ResolveResult {
  const jobType = jobTypeById(config, input.jobTypeId);
  if (!jobType) return fail("unknown_job_type", "That job type is not on the board.");
  if (!jobType.routineBookable || input.priority === "emergency") {
    return fail("not_bookable", "This issue is not booked into a routine window. Escalate to the on-call technician.");
  }
  const parsed = parseToUtcIso(input.startIso);
  if (!parsed) return fail("invalid_time", "That arrival window is not a valid time.");
  const local = DateTime.fromISO(parsed, { zone: "utc" }).setZone(config.timezone);
  const nowLocal = zoned(config, now);
  if (local.toMillis() <= nowLocal.toMillis()) return fail("in_the_past", "That arrival window has already started.");
  if (local.diff(nowLocal, "days").days > config.leadDays) {
    return fail("too_far", `${config.brandName} books up to ${config.leadDays} days ahead.`);
  }
  const match = config.windows.find(
    (windowDef) => windowDef.weekdays.includes(local.weekday) && local.hour * 60 + local.minute === windowDef.startMin && local.second === 0,
  );
  if (!match) {
    const dayHasWindows = config.windows.some((windowDef) => windowDef.weekdays.includes(local.weekday));
    return dayHasWindows
      ? fail("misaligned", "Arrival windows are 8:00 AM–12:00 PM or 12:00 PM–4:00 PM on days we dispatch.")
      : fail("closed", "We do not dispatch arrival windows that day.");
  }
  const skilled = config.techs.filter((tech) => sharesSkill(tech, jobType.skills));
  if (skilled.length === 0) return fail("no_tech", "No technician is qualified for that job type.");
  const dayKey = local.toISODate() ?? "";
  const ranked = rankTechs(skilled, input.priority, local.weekday, taken, dayKey, config.timezone);
  for (const tech of ranked) {
    if (taken.has(`${tech.id}|${parsed}`)) continue;
    const end = DateTime.fromISO(parsed, { zone: "utc" }).setZone(config.timezone).set({
      hour: Math.floor(match.endMin / 60),
      minute: match.endMin % 60,
      second: 0,
      millisecond: 0,
    });
    return {
      ok: true,
      offer: {
        start: parsed,
        end: toUtcIso(end),
        label: `${local.toFormat("ccc LLL d")}, ${local.toFormat("h:mm a")}–${end.toFormat("h:mm a")} ${config.tzLabel}`,
        techId: tech.id,
        techName: tech.name,
      },
    };
  }
  return fail("slot_taken", "That arrival window is full. Ask for another window.");
}

export type ChangeCode =
  | "not_found"
  | "already_cancelled"
  | "already_completed"
  | "already_dispatched"
  | "asap_dispatch"
  | "inside_notice";

export function canChange(
  config: OpsConfig,
  job: { priority: Priority; status: JobStatus; windowStart: string | null },
  now: Date,
): { ok: true } | { ok: false; code: ChangeCode; message: string } {
  if (job.status === "cancelled") return { ok: false, code: "already_cancelled", message: "That job is already cancelled." };
  if (job.status === "completed") return { ok: false, code: "already_completed", message: "That job is already done." };
  if (job.status === "dispatched") {
    return {
      ok: false,
      code: "already_dispatched",
      message: "A technician is already dispatched. I can transfer you to the on-call line.",
    };
  }
  if (!job.windowStart || job.priority === "emergency") {
    return { ok: false, code: "asap_dispatch", message: "That is an on-call dispatch, not a movable window." };
  }
  const hours = job.priority === "urgent" ? config.cancelNoticeHours.urgent : config.cancelNoticeHours.routine;
  const start = DateTime.fromISO(job.windowStart, { zone: "utc" });
  if (!start.isValid || start.toMillis() - now.getTime() < hours * 60 * 60 * 1000) {
    return {
      ok: false,
      code: "inside_notice",
      message: `Changes need ${hours} hours notice. I can transfer you to a person.`,
    };
  }
  return { ok: true };
}

function fail(code: ScheduleCode, message: string): ResolveResult {
  return { ok: false, code, message };
}

function rankTechs(
  techs: TechDef[],
  priority: Priority,
  weekday: number,
  taken: ReadonlySet<string>,
  dayKey: string,
  zone: string,
): TechDef[] {
  return [...techs].sort((a, b) => {
    if (priority !== "routine") {
      const aOn = a.onCallWeekdays.includes(weekday) ? 0 : 1;
      const bOn = b.onCallWeekdays.includes(weekday) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
    }
    const load = loadCount(taken, a.id, dayKey, zone) - loadCount(taken, b.id, dayKey, zone);
    if (load !== 0) return load;
    return a.id.localeCompare(b.id);
  });
}

function loadCount(taken: ReadonlySet<string>, techId: string, dayKey: string, zone: string): number {
  let count = 0;
  for (const key of taken) {
    const split = key.indexOf("|");
    if (split === -1) continue;
    if (key.slice(0, split) !== techId) continue;
    const localDay = DateTime.fromISO(key.slice(split + 1), { zone: "utc" }).setZone(zone).toISODate();
    if (localDay === dayKey) count += 1;
  }
  return count;
}

function sharesSkill(tech: TechDef, skills: string[]): boolean {
  if (skills.length === 0) return true;
  return skills.some((skill) => tech.skills.includes(skill));
}

function isoAt(config: OpsConfig, day: DateTime, startMin: number): string {
  return toUtcIso(
    day.set({
      hour: Math.floor(startMin / 60),
      minute: startMin % 60,
      second: 0,
      millisecond: 0,
    }),
  );
}

function zoned(config: OpsConfig, now: Date): DateTime {
  return DateTime.fromJSDate(now, { zone: "utc" }).setZone(config.timezone);
}
