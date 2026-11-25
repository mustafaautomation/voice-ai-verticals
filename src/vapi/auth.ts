import { timingSafeEqual } from "node:crypto";

export function verifyVapiSecret(header: string | string[] | undefined, secret: string): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return false;
  const provided = Buffer.from(value);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
