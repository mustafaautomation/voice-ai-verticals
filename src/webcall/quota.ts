export type QuotaScope = "visitor" | "global" | "unavailable";
export type QuotaResult = { ok: true; visitorRemaining: number } | { ok: false; scope: QuotaScope; retryAfterSeconds: number };
export type QuotaLimits = { perVisitor: number; perDay: number };

export interface CallQuota {
  acquire(input: { visitorKey: string; now: Date }): Promise<QuotaResult>;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function secondsToNextUtcDay(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export function visitorDecision(
  createdAtMs: number[],
  limits: QuotaLimits,
  now: Date,
): { allowed: true; recent: number } | { allowed: false; retryAfterSeconds: number } {
  const since = now.getTime() - DAY_MS;
  const recent = createdAtMs.filter((stamp) => stamp > since).sort((a, b) => a - b);
  if (recent.length < limits.perVisitor) return { allowed: true, recent: recent.length };
  const oldest = recent[recent.length - limits.perVisitor] ?? now.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY_MS - now.getTime()) / 1000)) };
}

export class MemoryCallQuota implements CallQuota {
  private readonly visitors = new Map<string, number[]>();
  private readonly days = new Map<string, number>();

  constructor(private readonly limits: QuotaLimits) {}

  async acquire(input: { visitorKey: string; now: Date }): Promise<QuotaResult> {
    const seen = this.visitors.get(input.visitorKey) ?? [];
    const visitor = visitorDecision(seen, this.limits, input.now);
    if (!visitor.allowed) return { ok: false, scope: "visitor", retryAfterSeconds: visitor.retryAfterSeconds };
    const day = utcDay(input.now);
    const used = this.days.get(day) ?? 0;
    if (used >= this.limits.perDay) return { ok: false, scope: "global", retryAfterSeconds: secondsToNextUtcDay(input.now) };
    this.days.set(day, used + 1);
    this.visitors.set(input.visitorKey, [...seen, input.now.getTime()]);
    return { ok: true, visitorRemaining: this.limits.perVisitor - visitor.recent - 1 };
  }
}
