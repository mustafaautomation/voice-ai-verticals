import { phoneDigits } from "../../platform/phone.js";

export function maskPhone(phone: string): string {
  const digits = phoneDigits(phone);
  if (digits.length < 4) return "***";
  const area = digits.length >= 10 ? digits.slice(0, 3) : "";
  return area ? `(${area}) ***-${digits.slice(-4)}` : `***-${digits.slice(-4)}`;
}

export function maskDob(dob: string): string {
  const year = /^(\d{4})/.exec(dob.trim())?.[1] ?? /^\d{1,2}\/\d{1,2}\/(\d{4})$/.exec(dob.trim())?.[1];
  return year ? `**/**/${year}` : "**/**/****";
}

export function maskMember(memberId: string): string {
  const tail = memberId.replace(/\s/g, "").slice(-4);
  return tail ? `••••${tail}` : "••••";
}

export function displayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "Patient";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last.slice(0, 1)}.` : first;
}

/** Scrub phones, dates of birth, and long digit strings before a transcript is shown. */
export function scrubText(text: string): string {
  return text
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, (match) => maskPhone(match))
    .replace(/\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g, (match) => maskDob(match))
    .replace(/\b\d{1,2}\/\d{1,2}\/(?:19|20)\d{2}\b/g, (match) => maskDob(match))
    .replace(/\b\d{13,19}\b/g, "••••")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "•••-••-••••");
}

export function namesMatch(left: string, right: string): boolean {
  return normalizeName(left) === normalizeName(right) && normalizeName(left).length > 0;
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeDob(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!us?.[1] || !us[2] || !us[3]) return null;
  return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

export function looksLikeSecret(memberId: string): boolean {
  const digits = memberId.replace(/\D/g, "");
  if (/^\d{3}-\d{2}-\d{4}$/.test(memberId.trim())) return true;
  if (digits.length === 9 && !/[a-z]/i.test(memberId)) return true;
  if (digits.length >= 13 && digits.length <= 19 && digits.length === memberId.replace(/\s|-/g, "").length) return true;
  return false;
}
