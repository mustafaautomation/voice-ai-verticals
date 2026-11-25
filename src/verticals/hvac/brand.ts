import type { OpsConfig } from "../../platform/schedule.js";

export const HVAC_ID = "hvac";

export const BRAND = {
  id: HVAC_ID,
  name: "Fennwick Comfort Co.",
  city: "Duluth, Minnesota",
  address: "900 Harbor Glass Avenue, Duluth, MN 55802",
  addressNote: "Harbor Glass Avenue is not a real street.",
  phoneDisplay: "(218) 555-0148",
  phoneE164: "+12185550148",
  onCallDisplay: "(218) 555-0190",
  onCallE164: "+12185550190",
  gasUtilityName: "Twin Ports Fuel",
  gasUtilityDisplay: "(218) 555-0177",
  timezone: "America/Chicago",
  tzLabel: "CT",
  serviceArea: ["Duluth", "Hermantown", "Proctor", "Piedmont Heights", "lakeshore homes out to Knife River"],
  hours: [
    "Desk: Monday–Friday 7:30 AM–5:30 PM CT",
    "Saturday desk: 8:00 AM–12:00 PM CT, tune-ups only",
    "Sunday: desk closed",
    "After hours: this agent answers. Arrival windows are 8:00 AM–12:00 PM and 12:00 PM–4:00 PM.",
  ],
  disclaimer:
    "Portfolio demo. Fennwick Comfort Co. is fictional and is not a licensed contractor. Addresses, technicians, and 555 numbers are made up. A gas smell or CO alarm in real life means leave and call 911.",
};

export const JOB_TYPE_IDS = ["no_heat", "no_cool", "tune_up", "thermostat", "quote", "gas_odor", "co_alarm"] as const;
export type HvacJobType = (typeof JOB_TYPE_IDS)[number];

export const HVAC_OPS: OpsConfig = {
  verticalId: HVAC_ID,
  timezone: BRAND.timezone,
  tzLabel: BRAND.tzLabel,
  brandName: BRAND.name,
  leadDays: 21,
  cancelNoticeHours: { urgent: 1, routine: 4 },
  officeHours: [
    { weekday: 1, openMin: 7 * 60 + 30, closeMin: 17 * 60 + 30 },
    { weekday: 2, openMin: 7 * 60 + 30, closeMin: 17 * 60 + 30 },
    { weekday: 3, openMin: 7 * 60 + 30, closeMin: 17 * 60 + 30 },
    { weekday: 4, openMin: 7 * 60 + 30, closeMin: 17 * 60 + 30 },
    { weekday: 5, openMin: 7 * 60 + 30, closeMin: 17 * 60 + 30 },
    { weekday: 6, openMin: 8 * 60, closeMin: 12 * 60 },
  ],
  windows: [
    { id: "morning", label: "Morning", startMin: 8 * 60, endMin: 12 * 60, weekdays: [1, 2, 3, 4, 5, 6] },
    { id: "afternoon", label: "Afternoon", startMin: 12 * 60, endMin: 16 * 60, weekdays: [1, 2, 3, 4, 5] },
  ],
  jobTypes: [
    { id: "no_heat", label: "No heat", skills: ["furnace"], routineBookable: true },
    { id: "no_cool", label: "No cooling", skills: ["cooling"], routineBookable: true },
    { id: "tune_up", label: "Seasonal tune-up", skills: ["maintenance"], routineBookable: true },
    { id: "thermostat", label: "Thermostat", skills: ["maintenance"], routineBookable: true },
    { id: "quote", label: "System quote", skills: ["sales"], routineBookable: true },
    { id: "gas_odor", label: "Gas odor", skills: ["furnace"], routineBookable: false },
    { id: "co_alarm", label: "CO alarm", skills: ["furnace"], routineBookable: false },
  ],
  techs: [
    {
      id: "tech_nora",
      name: "Nora Voss",
      phone: "+12185550111",
      skills: ["furnace", "hydronics", "maintenance"],
      onCallWeekdays: [1, 2],
    },
    {
      id: "tech_eli",
      name: "Eli Navarro",
      phone: "+12185550112",
      skills: ["furnace", "cooling", "heat_pump"],
      onCallWeekdays: [3, 4],
    },
    {
      id: "tech_samira",
      name: "Samira Cole",
      phone: "+12185550113",
      skills: ["cooling", "maintenance", "sales"],
      onCallWeekdays: [5, 6, 7],
    },
  ],
};

export function jobLabel(id: string): string {
  return HVAC_OPS.jobTypes.find((jobType) => jobType.id === id)?.label ?? id;
}
