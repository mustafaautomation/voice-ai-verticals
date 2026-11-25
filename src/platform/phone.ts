export function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function toE164(phone: string): string {
  const digits = phoneDigits(phone);
  if (digits.length === 10) return `+1${digits}`;
  if (phone.trim().startsWith("+")) return `+${phone.replace(/\D/g, "")}`;
  return digits ? `+${digits}` : phone;
}

export function formatPhone(phone: string): string {
  const digits = phoneDigits(phone);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}
