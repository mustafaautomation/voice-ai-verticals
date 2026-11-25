import { CLINIC, visitLabel } from "./brand.js";
import { maskPhone } from "./privacy.js";

export function visitSms(input: { name: string; label: string; when: string }): string {
  return `${CLINIC.name} (demo): ${input.name}, you are booked for ${input.label} at ${input.when}. This is a fictional clinic. No real visit was scheduled.`;
}

export function refillSms(input: { name: string; medication: string; pharmacy: string }): string {
  return `${CLINIC.name} nurse queue (demo): refill request for ${input.name}, medication noted as "${input.medication}", pharmacy ${input.pharmacy}. No dose advice. Not sent to a real phone.`;
}

export function textBackSms(): string {
  return `${CLINIC.name} (demo): we missed your call. If this is an emergency, call 911. If you are thinking about suicide, call or text 988. Otherwise call back during desk hours. Fictional clinic, this text is not delivered.`;
}

export function missedCallReason(endedReason: string | null): boolean {
  if (!endedReason) return false;
  return /did-not-answer|silence-timed-out|voicemail|customer-busy|no-answer/i.test(endedReason);
}

export function nurseLine(): string {
  return maskPhone(CLINIC.nurseE164);
}

export { visitLabel };
