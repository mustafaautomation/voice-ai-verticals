import { DateTime } from "luxon";
import type { SqliteDatabase } from "./db/database.js";
import { toUtcIso } from "./platform/time.js";
import { CustomerStore } from "./store/customers.js";
import { CallStore } from "./store/calls.js";
import { JobStore } from "./store/jobs.js";
import { SmsStore } from "./store/sms.js";
import { BRAND, HVAC_ID } from "./verticals/hvac/brand.js";
import { dispatchSms, safetySms, textBackSms, confirmationSms } from "./verticals/hvac/messages.js";
import { seedClinicIfEmpty } from "./verticals/clinic/seed.js";
import { seedFintechDesk } from "./verticals/fintech/seed.js";

export function seedIfEmpty(db: SqliteDatabase, now: Date): void {
  seedHvacIfEmpty(db, now);
  seedClinicIfEmpty(db, now);
  seedFintechDesk(db, now);
}

function seedHvacIfEmpty(db: SqliteDatabase, now: Date): void {
  const jobs = new JobStore(db);
  if (jobs.counts(HVAC_ID) > 0) return;
  const customers = new CustomerStore(db);
  const calls = new CallStore(db);
  const sms = new SmsStore(db);
  const monday = nextWeekday(now, 1, 2);
  const tuesday = monday.plus({ days: 1 });
  const morning = (day: DateTime) => at(day, 8 * 60);
  const afternoon = (day: DateTime) => at(day, 12 * 60);
  const stamp = (hoursAgo: number) => toUtcIso(DateTime.fromJSDate(now, { zone: "utc" }).minus({ hours: hoursAgo }));

  const maya = customers.insert({
    id: "cust_maya",
    verticalId: HVAC_ID,
    name: "Maya Chen",
    phone: "218-555-0101",
    address: "14 Lantern Court, Duluth, MN 55803",
    createdAt: stamp(72),
  });
  const andre = customers.insert({
    id: "cust_andre",
    verticalId: HVAC_ID,
    name: "Andre Brooks",
    phone: "218-555-0102",
    address: "88 Birch Glass Road, Hermantown, MN 55811",
    createdAt: stamp(70),
  });
  const priya = customers.insert({
    id: "cust_priya",
    verticalId: HVAC_ID,
    name: "Priya Shah",
    phone: "218-555-0103",
    address: "5 Kiln Street, Proctor, MN 55810",
    createdAt: stamp(60),
  });
  const jonah = customers.insert({
    id: "cust_jonah",
    verticalId: HVAC_ID,
    name: "Jonah Ellis",
    phone: "218-555-0104",
    address: "220 North Snow Lane, Duluth, MN 55806",
    createdAt: stamp(50),
  });
  customers.insert({
    id: "cust_lila",
    verticalId: HVAC_ID,
    name: "Lila Nguyen",
    phone: "218-555-0160",
    address: "2 Fog Bell Lane, Duluth, MN 55802",
    notes: "Gas-odor demo call. Caller was told to leave and call 911.",
    createdAt: stamp(20),
  });

  const tune = jobs.insertRaw({
    id: "job_maya",
    verticalId: HVAC_ID,
    customerId: maya.id,
    jobType: "tune_up",
    priority: "routine",
    status: "scheduled",
    windowStart: morning(monday),
    windowEnd: at(monday, 12 * 60),
    windowLabel: label(monday, "8:00 AM–12:00 PM"),
    techId: "tech_samira",
    address: maya.address,
    description: "Annual furnace tune-up",
    sourceCallId: "call_maya",
    createdAt: stamp(5),
  });
  const cool = jobs.insertRaw({
    id: "job_andre",
    verticalId: HVAC_ID,
    customerId: andre.id,
    jobType: "no_cool",
    priority: "urgent",
    status: "dispatched",
    windowStart: afternoon(monday),
    windowEnd: at(monday, 16 * 60),
    windowLabel: label(monday, "12:00 PM–4:00 PM"),
    techId: "tech_eli",
    address: andre.address,
    description: "AC dead, infant at home, caller reported 99 degrees",
    sourceCallId: "call_andre",
    createdAt: stamp(4),
  });
  jobs.insertRaw({
    id: "job_priya",
    verticalId: HVAC_ID,
    customerId: priya.id,
    jobType: "quote",
    priority: "routine",
    status: "scheduled",
    windowStart: morning(tuesday),
    windowEnd: at(tuesday, 12 * 60),
    windowLabel: label(tuesday, "8:00 AM–12:00 PM"),
    techId: "tech_samira",
    address: priya.address,
    description: "Quote for a replacement furnace",
    sourceCallId: "call_priya",
    createdAt: stamp(3),
  });
  jobs.insertRaw({
    id: "job_jonah",
    verticalId: HVAC_ID,
    customerId: jonah.id,
    jobType: "quote",
    priority: "routine",
    status: "cancelled",
    windowStart: afternoon(tuesday),
    windowEnd: at(tuesday, 16 * 60),
    windowLabel: label(tuesday, "12:00 PM–4:00 PM"),
    techId: "tech_samira",
    address: jonah.address,
    description: "Cancelled, traveling",
    createdAt: stamp(26),
  });
  const gas = jobs.insertRaw({
    id: "job_lila",
    verticalId: HVAC_ID,
    customerId: "cust_lila",
    jobType: "gas_odor",
    priority: "emergency",
    status: "completed",
    windowStart: null,
    windowEnd: null,
    windowLabel: "ASAP — caller told to leave and call 911",
    techId: "tech_eli",
    address: "2 Fog Bell Lane, Duluth, MN 55802",
    description: "Rotten egg odor in the basement",
    sourceCallId: "call_lila",
    createdAt: stamp(18),
  });

  calls.ensure({
    id: "call_maya",
    verticalId: HVAC_ID,
    vapiCallId: "seed_maya",
    callerName: "Maya Chen",
    callerNumber: "+12185550101",
    afterHours: false,
    now: new Date(stamp(5)),
    outcome: "booked",
    status: "completed",
    summary: "Booked a furnace tune-up on the next morning window.",
    transcript:
      "Receptionist: Thank you for calling Fennwick Comfort Co., a fictional demo in Duluth. What is going on?\nCaller: This is Maya Chen. I need an annual furnace tune-up. My number is 218-555-0101.\nReceptionist: You are booked for a tune-up. We will text the demo inbox, not a real phone.",
  });
  calls.ensure({
    id: "call_andre",
    verticalId: HVAC_ID,
    vapiCallId: "seed_andre",
    callerName: "Andre Brooks",
    callerNumber: "+12185550102",
    afterHours: true,
    now: new Date(stamp(4)),
    outcome: "booked",
    status: "completed",
    summary: "Urgent no-cooling call with an infant at home. Technician paged.",
    transcript:
      "Caller: The AC died, it is 99 degrees, and my infant is home.\nReceptionist: That is urgent. I booked the next window and texted Eli Navarro.",
  });
  calls.ensure({
    id: "call_lila",
    verticalId: HVAC_ID,
    vapiCallId: "seed_lila",
    callerName: "Lila Nguyen",
    callerNumber: "+12185550160",
    afterHours: true,
    now: new Date(stamp(18)),
    outcome: "escalated",
    status: "completed",
    summary: "Gas odor. Caller told to leave and call 911. On-call technician texted.",
    transcript:
      "Caller: I smell gas in the basement, like rotten eggs.\nReceptionist: Leave the building now. Do not flip switches. From outside, call 911 and Twin Ports Fuel at (218) 555-0177. I am alerting the on-call technician.",
    endedReason: "assistant-ended-call",
  });
  calls.ensure({
    id: "call_wrong",
    verticalId: HVAC_ID,
    vapiCallId: "seed_wrong",
    callerName: "Samir Patel",
    callerNumber: "+12185550177",
    afterHours: false,
    now: new Date(stamp(8)),
    outcome: "no_booking",
    status: "completed",
    summary: "Wrong number. Caller wanted a hardware store.",
    transcript: "Caller: Sorry, I was trying to reach a hardware store.\nReceptionist: No problem. This is Fennwick Comfort, a fictional heating company.",
  });
  calls.ensure({
    id: "call_riley",
    verticalId: HVAC_ID,
    vapiCallId: "seed_riley",
    callerName: "Riley Cho",
    callerNumber: "+12185550199",
    afterHours: true,
    now: new Date(stamp(2)),
    outcome: "text_back",
    status: "completed",
    summary: "Missed call. Demo text-back queued.",
    transcript: "No conversation. The line dropped before the dispatcher spoke.",
    endedReason: "customer-did-not-answer",
  });
  calls.ensure({
    id: "call_bill",
    verticalId: HVAC_ID,
    vapiCallId: "seed_bill",
    callerName: "Pat Okonkwo",
    callerNumber: "+12185550155",
    afterHours: false,
    now: new Date(stamp(6)),
    outcome: "transferred",
    status: "completed",
    summary: "Billing complaint transferred to the desk.",
    transcript: "Caller: This bill is ridiculous. Get me a person.\nReceptionist: Transferring you to the desk.",
  });

  sms.insert({
    id: "sms_tune",
    provider: "mock",
    fromNumber: BRAND.phoneE164,
    status: "queued",
    createdAt: stamp(5),
    message: {
      verticalId: HVAC_ID,
      kind: "dispatch",
      to: "+12185550113",
      body: dispatchSms({
        priority: "routine",
        jobType: "tune_up",
        customerName: maya.name,
        address: maya.address,
        windowLabel: tune.windowLabel,
        phone: maya.phone,
        jobId: tune.id,
      }),
      relatedType: "job",
      relatedId: tune.id,
    },
  });
  sms.insert({
    id: "sms_tune_ok",
    provider: "mock",
    fromNumber: BRAND.phoneE164,
    status: "queued",
    createdAt: stamp(5),
    message: {
      verticalId: HVAC_ID,
      kind: "confirmation",
      to: maya.phone,
      body: confirmationSms({ jobType: "tune_up", windowLabel: tune.windowLabel, techName: "Samira Cole" }),
      relatedType: "job",
      relatedId: tune.id,
    },
  });
  sms.insert({
    id: "sms_andre",
    provider: "mock",
    fromNumber: BRAND.phoneE164,
    status: "queued",
    createdAt: stamp(4),
    message: {
      verticalId: HVAC_ID,
      kind: "dispatch",
      to: "+12185550112",
      body: dispatchSms({
        priority: "urgent",
        jobType: "no_cool",
        customerName: andre.name,
        address: andre.address,
        windowLabel: cool.windowLabel,
        phone: andre.phone,
        jobId: cool.id,
      }),
      relatedType: "job",
      relatedId: cool.id,
    },
  });
  sms.insert({
    id: "sms_lila",
    provider: "mock",
    fromNumber: BRAND.phoneE164,
    status: "queued",
    createdAt: stamp(18),
    message: {
      verticalId: HVAC_ID,
      kind: "safety",
      to: "+12185550160",
      body: safetySms(),
      relatedType: "job",
      relatedId: gas.id,
    },
  });
  sms.insert({
    id: "sms_riley",
    provider: "mock",
    fromNumber: BRAND.phoneE164,
    status: "queued",
    createdAt: stamp(2),
    message: {
      verticalId: HVAC_ID,
      kind: "text_back",
      to: "+12185550199",
      body: textBackSms(),
      relatedType: "call",
      relatedId: "call_riley",
    },
  });
}

function nextWeekday(now: Date, weekday: number, minDays: number): DateTime {
  let day = DateTime.fromJSDate(now, { zone: "utc" }).setZone("America/Chicago").startOf("day").plus({ days: minDays });
  while (day.weekday !== weekday) day = day.plus({ days: 1 });
  return day;
}

function at(day: DateTime, minutes: number): string {
  return toUtcIso(day.set({ hour: Math.floor(minutes / 60), minute: minutes % 60, second: 0, millisecond: 0 }));
}

function label(day: DateTime, range: string): string {
  return `${day.toFormat("ccc LLL d")}, ${range} CT`;
}
