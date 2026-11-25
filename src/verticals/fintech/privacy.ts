import { phoneDigits } from "../../platform/phone.js";

export type SensitiveKind = "pan" | "cvv" | "pin" | "password";

export function maskLast4(last4: string): string {
  const digits = last4.replace(/\D/g, "").slice(-4);
  return digits ? `••••${digits}` : "••••";
}

export function maskPhone(phone: string): string {
  const digits = phoneDigits(phone);
  if (digits.length < 4) return "***";
  const area = digits.length >= 10 ? digits.slice(0, 3) : "";
  return area ? `(${area}) ***-${digits.slice(-4)}` : `***-${digits.slice(-4)}`;
}

export function maskDob(dob: string): string {
  const year = /^(\d{4})/.exec(dob.trim())?.[1];
  return year ? `**/**/${year}` : "**/**/****";
}

/** Drop full card numbers, CVVs, PINs, and passwords before anything is stored or shown. */
export function redactSensitive(text: string): string {
  return text
    .replace(/(?:\d[ -]?){13,19}/g, "[redacted card]")
    .replace(/\b(?:cvv|cvc|security code)\s*(?:is|:)?\s*\d{3,4}\b/gi, "[redacted cvv]")
    .replace(/\bpin\s*(?:is|:)?\s*\d{4,6}\b/gi, "[redacted pin]")
    .replace(/\bpassword\s*(?:is|:)?\s*\S+/gi, "[redacted password]")
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, (match) => maskPhone(match))
    .replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, (match) => maskDob(match));
}

export function sensitiveKind(text: string): SensitiveKind | null {
  if (/\bpassword\b/i.test(text)) return "password";
  if (/\b(?:cvv|cvc|security code)\b/i.test(text)) return "cvv";
  if (/\bpin\b/i.test(text) && /\b\d{4,6}\b/.test(text)) return "pin";
  const compact = text.replace(/[ -]/g, "");
  if (/(?<!\d)\d{13,19}(?!\d)/.test(compact)) return "pan";
  return null;
}

export function namesMatch(left: string, right: string): boolean {
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(left) === norm(right) && norm(left).length > 0;
}

export function normalizeDob(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!us?.[1] || !us[2] || !us[3]) return null;
  return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

const THREATS = /\b(arrest|jail|garnish|your employer|call your boss|sue you today|we will sue|police)\b/i;

export function isThreat(text: string): boolean {
  return THREATS.test(text);
}
