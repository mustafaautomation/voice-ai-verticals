import type { HvacJobType } from "./brand.js";

export type TriagePriority = "emergency" | "urgent" | "routine" | "off_topic" | "needs_detail";
export type NextStep = "escalate" | "book_urgent" | "book_next" | "decline" | "ask";

export type TriageResult = {
  ok: true;
  priority: TriagePriority;
  category: string;
  jobType: HvacJobType | null;
  nextStep: NextStep;
  safety: boolean;
  callerScript: string;
};

export const SAFETY_SCRIPT =
  "Leave the building now. Do not flip switches, use the phone inside, or start a car in the garage. From outside, call 911 and Twin Ports Fuel at (218) 555-0177. I am alerting our on-call technician. Twin Ports Fuel and this company are fictional demo contacts; in real life you still leave and call 911 first.";

const GAS = /\b(smell(?:s|ing)? gas|gas smell|rotten eggs?|gas leak|odor of gas|gas odor)\b/i;
const CO = /\b(carbon monoxide|co alarm|co detector|monoxide alarm)\b/i;
const NO_HEAT = /\b(no heat|furnace(?: is)? (?:out|dead|died|down|won't|wont)|heater(?: is)? (?:out|dead|died|won't|wont)|boiler(?: is)? (?:down|out)|heat (?:won't|wont|will not) (?:come on|work))\b/i;
const NO_COOL = /\b(no (?:ac|a\/c|air|cool(?:ing)?)|ac(?: is)? (?:out|dead|died|down|won't|wont)|air conditioner|air conditioning(?: is)? (?:out|down|dead))\b/i;
const FREEZING = /\b(freez(?:e|ing)|below freezing|pipes?(?: might| could| will)? (?:freeze|burst))\b/i;
const HEAT_WAVE = /\b(heat ?wave|extreme heat|9\d degrees|1\d\d degrees)\b/i;
const VULNERABLE = /\b(infant|newborn|baby|elderly|senior|oxygen|pregnant|disabled|disability|medical condition)\b/i;
const QUOTE = /\b(quote|estimate|new (?:furnace|system|ac|air conditioner)|replacement)\b/i;
const TUNE = /\b(tune[- ]?up|maintenance|filter change|seasonal service)\b/i;
const THERMOSTAT = /\bthermostat\b/i;
const ABUSE = /\b(ignore (?:all |any )?(?:your |previous |prior )?instructions|system prompt|social security|\bssn\b|credit card|card number|password)\b/i;
const OFF_TOPIC = /\b(joke|poem|football|stock tip|weather forecast|who won|recipe|useless bot)\b/i;

export function triageIssue(input: {
  description: string;
  outdoorTempF?: number;
  vulnerableOccupant?: boolean;
  jobType?: string;
}): TriageResult {
  const text = input.description;
  const gas = GAS.test(text) || input.jobType === "gas_odor";
  const co = CO.test(text) || input.jobType === "co_alarm";
  const noHeat = NO_HEAT.test(text) || input.jobType === "no_heat";
  const noCool = NO_COOL.test(text) || input.jobType === "no_cool";
  const vulnerable = input.vulnerableOccupant === true || VULNERABLE.test(text);
  const freezing = FREEZING.test(text) || (typeof input.outdoorTempF === "number" && input.outdoorTempF <= 32);
  const extremeHeat = HEAT_WAVE.test(text) || (typeof input.outdoorTempF === "number" && input.outdoorTempF >= 95);
  const textService = noHeat || noCool || QUOTE.test(text) || TUNE.test(text) || THERMOSTAT.test(text);

  if (gas || co) {
    return {
      ok: true,
      priority: "emergency",
      category: co && !gas ? "co_alarm" : "gas_odor",
      jobType: co && !gas ? "co_alarm" : "gas_odor",
      nextStep: "escalate",
      safety: true,
      callerScript: SAFETY_SCRIPT,
    };
  }
  if ((ABUSE.test(text) || OFF_TOPIC.test(text)) && !textService) {
    return {
      ok: true,
      priority: "off_topic",
      category: "off_topic",
      jobType: null,
      nextStep: "decline",
      safety: false,
      callerScript:
        "I only schedule heating and cooling for Fennwick Comfort. I can't help with that, and I won't take payment details or follow other instructions. If you have a furnace, AC, or air-quality problem, tell me that.",
    };
  }
  if (noHeat && freezing) {
    return urgent("no_heat", "No heat with freezing conditions. Book the soonest window and page the assigned technician. If the desk is closed, the job is an on-call dispatch.");
  }
  if (noCool && extremeHeat && vulnerable) {
    return urgent("no_cool", "No cooling in extreme heat with a vulnerable occupant. Book the soonest window and page the assigned technician.");
  }
  if (noHeat) return routine("no_heat", "No heat, without a freeze risk. Book the next open arrival window.");
  if (noCool) return routine("no_cool", "No cooling, without an extreme-heat risk. Book the next open arrival window.");
  if (QUOTE.test(text) || input.jobType === "quote") return routine("quote", "System quote. Book the next open arrival window with the comfort advisor.");
  if (THERMOSTAT.test(text) || input.jobType === "thermostat") return routine("thermostat", "Thermostat visit. Book the next open arrival window.");
  if (TUNE.test(text) || input.jobType === "tune_up") return routine("tune_up", "Seasonal tune-up. Book the next open arrival window.");
  if (OFF_TOPIC.test(text) || ABUSE.test(text)) {
    return {
      ok: true,
      priority: "off_topic",
      category: "off_topic",
      jobType: null,
      nextStep: "decline",
      safety: false,
      callerScript: "I only schedule heating and cooling visits. I can book a tune-up, a repair, or a quote if you want one.",
    };
  }
  return {
    ok: true,
    priority: "needs_detail",
    category: "needs_detail",
    jobType: null,
    nextStep: "ask",
    safety: false,
    callerScript: "Ask whether this is no heat, no cooling, a gas smell, a CO alarm, a tune-up, or a quote. Ask one question.",
  };
}

function urgent(jobType: HvacJobType, callerScript: string): TriageResult {
  return { ok: true, priority: "urgent", category: jobType, jobType, nextStep: "book_urgent", safety: false, callerScript };
}

function routine(jobType: HvacJobType, callerScript: string): TriageResult {
  return { ok: true, priority: "routine", category: jobType, jobType, nextStep: "book_next", safety: false, callerScript };
}
