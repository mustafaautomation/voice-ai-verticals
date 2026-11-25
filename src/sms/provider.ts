import type { SmsMessage, OutboundSms, SmsStore } from "../store/sms.js";
import { toE164 } from "../platform/phone.js";

export interface SmsProvider {
  readonly name: "mock" | "http";
  send(message: OutboundSms): Promise<SmsMessage>;
}

/** Default provider. Messages stay in SQLite and show on the dispatch board. Nothing is delivered to a handset. */
export class MockSmsProvider implements SmsProvider {
  readonly name = "mock" as const;

  constructor(
    private readonly store: SmsStore,
    private readonly fromNumber: string,
  ) {}

  async send(message: OutboundSms): Promise<SmsMessage> {
    return this.store.insert({
      provider: "mock",
      fromNumber: message.from ?? this.fromNumber,
      status: "queued",
      message: { ...message, to: toE164(message.to) },
    });
  }
}

/**
 * Optional adapter for a provider you already run. POSTs JSON to SMS_WEBHOOK_URL.
 * This repo does not call Twilio, MessageBird, or any paid SMS API.
 */
export class HttpSmsProvider implements SmsProvider {
  readonly name = "http" as const;

  constructor(
    private readonly store: SmsStore,
    private readonly options: {
      url: string;
      fromNumber: string;
      token?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async send(message: OutboundSms): Promise<SmsMessage> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const to = toE164(message.to);
    let status: "sent" | "failed";
    try {
      const response = await fetchImpl(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
        },
        body: JSON.stringify({
          to,
          from: this.options.fromNumber,
          body: message.body,
          kind: message.kind,
          verticalId: message.verticalId,
        }),
      });
      status = response.ok ? "sent" : "failed";
    } catch {
      status = "failed";
    }
    return this.store.insert({
      provider: "http",
      fromNumber: message.from ?? this.options.fromNumber,
      status,
      message: { ...message, to },
    });
  }
}
