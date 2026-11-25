import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { seedIfEmpty } from "../../src/seed.js";
import { FINTECH_SCENARIOS } from "../../src/verticals/fintech/scenarios.js";
import { fintechScenarioPassed, runFintechScenario } from "../../src/verticals/fintech/eval.js";
import { executeFintechTool, simulateReminder, type FintechToolContext } from "../../src/verticals/fintech/runtime.js";
import { seedFintechFixtures } from "../../src/verticals/fintech/seed.js";
import { FintechStore } from "../../src/verticals/fintech/store.js";
import { WRENLINE, isDeskOpen } from "../../src/verticals/fintech/brand.js";
import { MockSmsProvider } from "../../src/sms/provider.js";
import { SmsStore } from "../../src/store/sms.js";
import { openDatabase } from "../../src/db/database.js";
import { redactSensitive, sensitiveKind } from "../../src/verticals/fintech/privacy.js";
import { syncAssistant } from "../../src/vapi/sync.js";
import { memoryDb, NOW, SECRET, testConfig } from "../helpers.js";

describe("Wrenline privacy", () => {
  it("redacts a full card number and leaves the last four", () => {
    expect(sensitiveKind("4111111111111111")).toBe("pan");
    expect(sensitiveKind("cvv is 123")).toBe("cvv");
    expect(sensitiveKind("last four 4412")).toBeNull();
    expect(redactSensitive("card 4111 1111 1111 1111")).not.toContain("4111");
    expect(redactSensitive("card 4111 1111 1111 1111")).toContain("[redacted card]");
    expect(sensitiveKind("password is hunter2")).toBe("password");
    expect(sensitiveKind("pin is 1234")).toBe("pin");
  });
});

describe("Wrenline edge tools", () => {
  it("covers refusals, reissue rules, and the reminder gate", async () => {
    const db = openDatabase(":memory:");
    seedFintechFixtures(db, NOW);
    const ctx: FintechToolContext = {
      db,
      sms: new MockSmsProvider(new SmsStore(db), WRENLINE.phoneE164),
      fromNumber: WRENLINE.phoneE164,
      onCallNumber: WRENLINE.fraudE164,
      transferNumber: WRENLINE.phoneE164,
      now: NOW,
      callRowId: null,
    };
    const maya = { name: "Maya Chen", last4: "4412", dob: "03/14/1984", relationship: "self" };
    expect((await executeFintechTool("report_lost_stolen", { ...maya, note: "password is hunter2" }, ctx) as { code: string }).code).toBe("sensitive");
    expect((await executeFintechTool("lookup_account", { name: "Maya Chen", last4: "4412", relationship: "self" }, ctx) as { code: string }).code).toBe("not_verified");
    expect((await executeFintechTool("dispute_intake", { ...maya, dob: "1984-03-14", txnId: "missing", amountCents: 100, reasonCode: "quality" }, ctx) as { code: string }).code).toBe("not_found");
    expect((await executeFintechTool("dispute_intake", { ...maya, dob: "1984-03-14", txnId: "txn_grocery", amountCents: 100, reasonCode: "duplicate" }, ctx) as { code: string }).code).toBe("amount_mismatch");
    expect((await executeFintechTool("promise_to_pay", { name: "Andre Brooks", last4: "2208", dob: "1972-11-02", relationship: "self", amountCents: 100, payDate: "2026-12-20" }, ctx) as { code: string }).code).toBe("not_past_due");
    expect((await executeFintechTool("promise_to_pay", { ...maya, dob: "1984-03-14", amountCents: 999999, payDate: "2026-12-20" }, ctx) as { code: string }).code).toBe("amount_too_high");
    expect((await executeFintechTool("report_lost_stolen", { ...maya, dob: "1984-03-14" }, ctx) as { ok: boolean }).ok).toBe(true);
    expect((await executeFintechTool("card_controls", { ...maya, dob: "1984-03-14", action: "unfreeze" }, ctx) as { code: string }).code).toBe("stolen");
    expect((await executeFintechTool("fraud_alert", { ...maya, dob: "1984-03-14", txnId: "nope", decision: "no" }, ctx) as { code: string }).code).toBe("not_found");
    expect((await executeFintechTool("list_transactions", { name: "Andre Brooks", last4: "2208", dob: "1972-11-02", relationship: "self" }, ctx) as { ok: boolean }).ok).toBe(true);
    expect((await executeFintechTool("set_cease_contact", { ...maya, dob: "1984-03-14" }, ctx) as { ok: boolean }).ok).toBe(true);
    expect((await executeFintechTool("send_payment_link", { ...maya, dob: "1984-03-14" }, ctx) as { code: string }).code).toBe("cease_contact");
    expect((await executeFintechTool("transfer_to_fraud", { reason: "I need the fraud desk." }, ctx) as { ok: boolean }).ok).toBe(true);
    expect(isDeskOpen(new Date("2026-12-06T18:00:00.000Z"))).toBe(false);
    const stopped = await simulateReminder(ctx, "acct_priya");
    expect(stopped.ok).toBe(false);
    expect(new FintechStore(db).listCases().length).toBeGreaterThan(0);
    expect((await executeFintechTool("nope", {}, ctx) as { code: string }).code).toBe("unknown_tool");
  });
});

describe("Wrenline conversation evals", () => {
  it("runs every fintech scenario", async () => {
    expect(FINTECH_SCENARIOS.length).toBeGreaterThanOrEqual(16);
    const failures: string[] = [];
    for (const scenario of FINTECH_SCENARIOS) {
      const result = await runFintechScenario(scenario);
      if (!fintechScenarioPassed(scenario, result)) {
        failures.push(`${scenario.id} outcome=${result.outcome} tools=${result.toolNames.join(",")} body=${JSON.stringify(result.results).slice(0, 240)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("Wrenline pages", () => {
  it("serves the card desk on the fintech host and masks the ledger", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    const app = await buildApp({
      config: testConfig({
        vapiPublicKey: "pk_test",
        vapiFintechAssistantId: "asst_fintech",
        webCallOrigins: ["https://fintech.quvantic.com"],
      }),
      db,
      now: () => NOW,
    });
    const home = await app.inject({ method: "GET", url: "/", headers: { host: "fintech.quvantic.com" } });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Wrenline");
    expect(home.body).toContain("not a bank");
    const accounts = await app.inject({ method: "GET", url: "/accounts", headers: { host: "fintech.quvantic.com" } });
    expect(accounts.body).toContain("••••4412");
    expect(accounts.body).toContain("Do not discuss");
    expect(accounts.body).not.toContain("4111111111111111");
    const reminder = await app.inject({
      method: "POST",
      url: "/v/fintech/demo/reminder",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });
    expect(reminder.statusCode).toBe(302);
    const callPath = reminder.headers.location as string;
    const detail = await app.inject({ method: "GET", url: callPath });
    expect(detail.body).toContain("attempt to collect a debt");
    expect(detail.body).toContain("does not charge");
    const token = await app.inject({
      method: "POST",
      url: "/api/call-token",
      headers: { host: "fintech.quvantic.com", origin: "https://fintech.quvantic.com" },
    });
    expect(token.json().assistantId).toBe("asst_fintech");
    const denied = await app.inject({
      method: "POST",
      url: "/v/fintech/vapi/tools/lookup_account",
      headers: { "x-vapi-secret": SECRET },
      payload: { callId: "pan", arguments: { name: "Maya Chen 4111111111111111", last4: "4412", dob: "1984-03-14", relationship: "self" } },
    });
    expect(denied.json().result.code).toBe("sensitive");
    expect(JSON.stringify(denied.json())).not.toContain("4111111111111111");
    await app.close();
  });
});

describe("Wrenline assistant", () => {
  it("targets the fintech tool URLs with Clara", async () => {
    const dry = await syncAssistant({ vertical: "fintech", publicBaseUrl: "https://fintech.quvantic.com", serverUrlSecret: "test-webhook-secret" });
    expect(dry.payload.name).toContain("Wrenline");
    expect(dry.payload.voice.voiceId).toBe("Clara");
    expect(dry.payload.model.model).toBe("openai/gpt-oss-120b");
    expect(dry.payload.server.url).toBe("https://fintech.quvantic.com/v/fintech/vapi/webhook");
    expect(dry.payload.model.tools.some((tool) => tool.function.name === "dispute_intake")).toBe(true);
  });
});
