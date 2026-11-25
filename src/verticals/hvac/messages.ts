import { BRAND, jobLabel } from "./brand.js";
import { formatPhone } from "../../platform/phone.js";

export function dispatchSms(input: {
  priority: string;
  jobType: string;
  customerName: string;
  address: string;
  windowLabel: string;
  phone: string;
  jobId: string;
}): string {
  return `${BRAND.name} dispatch (demo): ${input.priority} ${jobLabel(input.jobType)} for ${input.customerName} at ${input.address}. Window ${input.windowLabel}. Callback ${formatPhone(input.phone)}. Job ${input.jobId}. Fictional message, not sent to a real phone.`;
}

export function confirmationSms(input: { jobType: string; windowLabel: string; techName: string }): string {
  return `${BRAND.name} (demo): you are on the ${input.windowLabel} window for ${jobLabel(input.jobType)}. Technician ${input.techName}. This is a fictional portfolio company.`;
}

export function safetySms(): string {
  return `${BRAND.name} (demo): leave the building now and call 911 from outside. Fictional gas desk ${BRAND.gasUtilityDisplay}. We alerted the on-call technician. Not a real contractor.`;
}

export function textBackSms(): string {
  return `${BRAND.name} (demo): we missed your call. If you smell gas or a CO alarm is sounding, leave and call 911. Otherwise reply HEAT, COOL, or TUNE and a time that works. Fictional company, this text is not delivered to a real phone.`;
}

export function missedCallReason(endedReason: string | null): boolean {
  if (!endedReason) return false;
  return /did-not-answer|silence-timed-out|voicemail|customer-busy|no-answer/i.test(endedReason);
}
