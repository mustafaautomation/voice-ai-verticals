export type Issue = "gas" | "flood" | "heat" | "lockout" | "routine" | "off_topic";

const GAS = /\b(gas|rotten egg|carbon monoxide|co alarm)\b/i;
const FLOOD = /\b(flood|gushing|through the ceiling|burst pipe|ankle-deep|water is pouring)\b/i;
const HEAT = /\b(no heat|freezing|heat is out|heater (is )?(dead|out|broken))\b/i;
const LOCK = /\b(locked out|lockout|lost my keys|can't get in|cannot get in)\b/i;
const INJECTION = /\bignore (?:your|all|previous|prior) instructions\b/i;
const OFF = /\b(joke|poem|football|stock tip)\b/i;

export function classifyIssue(text: string): Issue {
  if (INJECTION.test(text) || OFF.test(text)) return "off_topic";
  if (GAS.test(text)) return "gas";
  if (FLOOD.test(text)) return "flood";
  if (HEAT.test(text)) return "heat";
  if (LOCK.test(text)) return "lockout";
  return "routine";
}

export function gasScript(): string {
  return "Leave the building now. Do not flip switches. From outside, call 911. I will note an emergency for the on-call resident after you are out. This is not a routine visit.";
}

export function floodScript(): string {
  return "If the water is near outlets or you smell burning, leave and call 911. Otherwise stay clear of the water. I am opening an emergency ticket and texting the on-call resident. This demo does not send a plumber.";
}

export function heatScript(): string {
  return "No heat is an emergency in this demo. I am paging the on-call resident. If anyone is in danger from the cold, call 911. I can't take a payment or promise a repair time.";
}

export function lockScript(): string {
  return "A lockout pages the on-call resident. If you are outside and unsafe, call 911. I will not describe how to force a door.";
}

export function sensitiveKind(text: string): "pan" | "secret" | null {
  const compact = text.replace(/[\s-]/g, "");
  if (/\d{13,19}/.test(compact)) return "pan";
  if (/\b(cvv|cvc|routing number|bank login|password|card number)\b/i.test(text)) return "secret";
  return null;
}
