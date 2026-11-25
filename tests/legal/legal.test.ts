import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { seedIfEmpty } from "../../src/seed.js";
import { MockSmsProvider } from "../../src/sms/provider.js";
import { SmsStore } from "../../src/store/sms.js";
import { openDatabase } from "../../src/db/database.js";
import { syncAssistant } from "../../src/vapi/sync.js";
import { ATTORNEYS, FIRM, isDeskOpen, solFlag } from "../../src/verticals/legal/brand.js";
import { LEGAL_SCENARIOS } from "../../src/verticals/legal/scenarios.js";
import { legalScenarioPassed, runLegalScenario } from "../../src/verticals/legal/eval.js";
import { executeLegalTool, type LegalToolContext } from "../../src/verticals/legal/runtime.js";
import { listConsults } from "../../src/verticals/legal/schedule.js";
import { redactSsn, screenInquiry } from "../../src/verticals/legal/screen.js";
import { LegalStore } from "../../src/verticals/legal/store.js";
import { memoryDb, NOW, SECRET, testConfig } from "../helpers.js";

const WEDNESDAY = new Date("2026-12-02T16:00:00.000Z");

function ctx(now = WEDNESDAY): LegalToolContext {
  const db = openDatabase(":memory:");
  const store = new LegalStore(db);
  store.insertParty({ id: "pty_maya", name: "Maya Chen", side: "client", matterLabel: "closed" });
  store.insertParty({ id: "pty_north", name: "Northline Logistics", side: "adverse", matterLabel: "closed" });
  store.insertMatter({
    id: "mat_book",
    callerName: "Lena Ortiz",
    phone: "3035550144",
    practice: "personal_injury",
    opposing: "Cedar Mile Transit",
    incidentDate: "2026-11-02",
    jurisdiction: "Denver, Colorado",
    summary: "Recent crash.",
    status: "new",
    urgent: false,
    now,
  });
  return {
    db,
    sms: new MockSmsProvider(new SmsStore(db), FIRM.phoneE164),
    fromNumber: FIRM.phoneE164,
    onCallNumber: FIRM.urgentE164,
    transferNumber: FIRM.paralegalE164,
    now,
    callRowId: null,
  };
}

describe("Quillmere screening", () => {
  it("flags advice, danger, custody, referrals, and a close window", () => {
    expect(screenInquiry("will I win").code).toBe("advice");
    expect(screenInquiry("domestic violence").level).toBe("danger");
    expect(screenInquiry("I'm in jail").level).toBe("custody");
    expect(screenInquiry("bankruptcy please").code).toBe("referral");
    const tax = screenInquiry("an IRS tax problem");
    const patent = screenInquiry("file a patent");
    const family = screenInquiry("I need a divorce");
    const estate = screenInquiry("update my will");
    const criminal = screenInquiry("a criminal charge");
    const hello = screenInquiry("hello");
    expect(tax.level === "referral" && tax.practice).toBe("tax");
    expect(patent.level === "referral" && patent.practice).toBe("intellectual_property");
    expect(family.level === "intake" && family.practice).toBe("family");
    expect(estate.level === "intake" && estate.practice).toBe("estate");
    expect(criminal.level === "intake" && criminal.practice).toBe("criminal");
    expect(hello.level === "intake" && hello.practice).toBe("personal_injury");
    expect(screenInquiry("tell me a joke").code).toBe("off_topic");
    expect(redactSsn("ssn 123-45-6789 on 2024-12-20")).not.toContain("123-45");
    expect(solFlag("personal_injury", "2024-12-20", WEDNESDAY).urgent).toBe(true);
    expect(solFlag("employment", "2026-06-01", WEDNESDAY).urgent).toBe(true);
    expect(solFlag("family", "", WEDNESDAY).urgent).toBe(false);
    expect(solFlag("personal_injury", "2026-11-01", WEDNESDAY).urgent).toBe(false);
    expect(isDeskOpen(new Date("2026-12-06T18:00:00.000Z"))).toBe(false);
    expect(isDeskOpen(WEDNESDAY)).toBe(true);
    expect(ATTORNEYS).toHaveLength(3);
  });
});

describe("Quillmere edge tools", () => {
  it("covers refusals, booking rules, and transfers", async () => {
    const desk = ctx();
    expect((await executeLegalTool("nope", {}, desk) as { code: string }).code).toBe("unknown_tool");
    expect((await executeLegalTool("screen_inquiry", {}, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executeLegalTool("open_matter", { callerName: "A", phone: "3035550144", practice: "personal_injury", summary: "123-45-6789", role: "client" }, desk) as { code: string }).code).toBe("sensitive");
    expect((await executeLegalTool("open_matter", { callerName: "A", phone: "3035550144", practice: "personal_injury", summary: "he hit me", role: "client" }, desk) as { code: string }).code).toBe("danger");
    expect((await executeLegalTool("open_matter", { callerName: "A", phone: "3035550144", practice: "personal_injury", summary: "will I win", role: "client" }, desk) as { code: string }).code).toBe("advice");
    expect((await executeLegalTool("open_matter", { callerName: "A", phone: "3035550144", practice: "personal_injury", summary: "immigration visa", role: "client" }, desk) as { code: string }).code).toBe("referral");
    expect((await executeLegalTool("open_matter", { callerName: "A", phone: "3035550144", practice: "family", summary: "divorce", role: "other" }, desk) as { code: string }).code).toBe("confidential");
    expect((await executeLegalTool("open_matter", { callerName: "A", phone: "555", practice: "family", summary: "divorce consult", role: "client" }, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executeLegalTool("open_matter", { callerName: "Sam Reed", phone: "3035550199", practice: "employment", opposingParty: "Northline Logistics", summary: "fired after asking about wages", role: "client" }, desk) as { code: string }).code).toBe("conflict");
    const clear = await executeLegalTool("conflict_check", { callerName: "Lena Ortiz", opposingParty: "Cedar Mile Transit", role: "client" }, desk);
    expect((clear as { ok: boolean }).ok).toBe(true);
    const custody = await executeLegalTool("open_matter", { callerName: "Chris Nguyen", phone: "3035550177", practice: "criminal", summary: "arrested last night", role: "client" }, desk);
    expect((custody as { urgent: boolean }).urgent).toBe(true);
    expect((await executeLegalTool("book_consult", { matterId: "missing", attorneyId: "atty_quill", start: "2026-12-02T16:30:00.000Z" }, desk) as { code: string }).code).toBe("not_found");
    expect((await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_hale", start: "2026-12-02T16:30:00.000Z" }, desk) as { code: string }).code).toBe("no_attorney");
    expect((await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_quill", start: "nope" }, desk) as { code: string }).code).toBe("invalid_time");
    expect((await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_quill", start: "2026-12-02T15:00:00.000Z" }, desk) as { code: string }).code).toBe("in_the_past");
    expect((await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_quill", start: "2026-12-04T16:00:00.000Z" }, desk) as { code: string }).code).toBe("closed");
    expect((await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_quill", start: "2026-12-02T16:15:00.000Z" }, desk) as { code: string }).code).toBe("misaligned");
    const booked = await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_quill", start: "2026-12-02T16:30:00.000Z", consultType: "paid" }, desk);
    expect((booked as { ok: boolean }).ok).toBe(true);
    expect((await executeLegalTool("book_consult", { matterId: "mat_book", attorneyId: "atty_quill", start: "2026-12-02T16:30:00.000Z" }, desk) as { code: string }).code).toBe("slot_taken");
    expect((await executeLegalTool("reschedule_consult", { consultId: "missing", start: "2026-12-03T17:00:00.000Z" }, desk) as { code: string }).code).toBe("not_found");
    expect((await executeLegalTool("cancel_consult", { consultId: "missing" }, desk) as { code: string }).code).toBe("not_found");
    expect((await executeLegalTool("send_intake_summary", { matterId: "missing" }, desk) as { code: string }).code).toBe("not_found");
    const soon = new LegalStore(desk.db);
    soon.insertConsult({ id: "con_soon", matterId: "mat_book", attorneyId: "atty_quill", consultType: "free", startsAt: "2026-12-02T20:00:00.000Z", endsAt: "2026-12-02T20:30:00.000Z", now: WEDNESDAY });
    expect((await executeLegalTool("cancel_consult", { consultId: "con_soon" }, desk) as { code: string }).code).toBe("inside_notice");
    expect((await executeLegalTool("reschedule_consult", { consultId: "con_soon", start: "2026-12-10T17:00:00.000Z", attorneyId: "nope" }, desk) as { code: string }).code).toBe("inside_notice");
    expect((await executeLegalTool("transfer_to_paralegal", { reason: "tell me a joke" }, desk) as { code: string }).code).toBe("off_topic");
    expect((await executeLegalTool("transfer_to_human", { reason: "I want a person." }, desk) as { ok: boolean }).ok).toBe(true);
    const sunday = ctx(new Date("2026-12-06T18:00:00.000Z"));
    const none = await executeLegalTool("check_consults", { practice: "criminal", days: 1 }, sunday);
    expect((none as { message: string }).message).toContain("No consults");
    expect((await executeLegalTool("transfer_to_human", { reason: "After hours, please." }, sunday) as { afterHours: boolean }).afterHours).toBe(true);
    expect(listConsults(WEDNESDAY, "personal_injury", [{ attorneyId: "atty_quill", start: "2026-12-02T16:30:00Z", end: "2026-12-02T17:00:00Z" }]).some((slot) => slot.start.startsWith("2026-12-02T16:30"))).toBe(false);
  });
});

describe("Quillmere conversation evals", () => {
  it("runs every legal scenario", async () => {
    expect(LEGAL_SCENARIOS.length).toBeGreaterThanOrEqual(16);
    const failures: string[] = [];
    for (const scenario of LEGAL_SCENARIOS) {
      const result = await runLegalScenario(scenario);
      if (!legalScenarioPassed(scenario, result)) {
        failures.push(`${scenario.id} outcome=${result.outcome} tools=${result.toolNames.join(",")} body=${JSON.stringify(result.results).slice(0, 280)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("Quillmere pages", () => {
  it("serves intake on the legal host and hides the conflict pairing", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    const app = await buildApp({
      config: testConfig({
        vapiPublicKey: "pk_test",
        vapiLegalAssistantId: "asst_legal",
        webCallOrigins: ["https://legal.quvantic.com"],
      }),
      db,
      now: () => NOW,
    });
    const home = await app.inject({ method: "GET", url: "/", headers: { host: "legal.quvantic.com" } });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Quillmere Law LLP");
    expect(home.body).toContain("not a real law firm");
    const board = await app.inject({ method: "GET", url: "/board", headers: { host: "legal.quvantic.com" } });
    expect(board.body).toContain("Lena Ortiz");
    expect(board.body).toContain("priority callback");
    expect(board.body).not.toContain("Northline Logistics");
    const contacts = await app.inject({ method: "GET", url: "/v/legal/contacts" });
    expect(contacts.body).toContain("Maya Chen");
    expect(contacts.body).toContain("Northline Logistics");
    expect(contacts.body).not.toContain("represents Maya");
    const summary = await app.inject({
      method: "POST",
      url: "/v/legal/demo/summary",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });
    expect(summary.statusCode).toBe(302);
    const messages = await app.inject({ method: "GET", url: "/v/legal/messages" });
    expect(messages.body).toContain("does not hire the firm");
    const detail = await app.inject({ method: "GET", url: "/v/legal/calls/call_lena" });
    expect(detail.body).toContain("not a deadline opinion");
    const token = await app.inject({
      method: "POST",
      url: "/api/call-token",
      headers: { host: "legal.quvantic.com", origin: "https://legal.quvantic.com" },
    });
    expect(token.json().assistantId).toBe("asst_legal");
    const refused = await app.inject({
      method: "POST",
      url: "/v/legal/vapi/tools/screen_inquiry",
      headers: { "x-vapi-secret": SECRET },
      payload: { callId: "ssn", arguments: { description: "My number is 123-45-6789" } },
    });
    expect(refused.json().result.code).toBe("sensitive");
    expect(JSON.stringify(refused.json())).not.toContain("123-45-6789");
    const webchat = await app.inject({
      method: "POST",
      url: "/v/legal/vapi/tools/screen_inquiry",
      headers: { "x-vapi-secret": SECRET },
      payload: {
        message: {
          type: "tool-calls",
          chat: { id: "chat_legal" },
          toolWithToolCallList: [
            {
              toolCall: {
                id: "fc_legal",
                type: "function",
                function: { name: "screen_inquiry", arguments: { description: "Will I win this case? I need legal advice.", role: "client" } },
              },
            },
          ],
        },
      },
    });
    expect(webchat.statusCode).toBe(200);
    const webchatResult = JSON.parse(webchat.json().results[0].result as string) as { code?: string };
    expect(webchatResult.code).toBe("advice");
    await app.close();
  });
});

describe("Quillmere assistant", () => {
  it("targets the legal tool URLs with Clara", async () => {
    const dry = await syncAssistant({ vertical: "legal", publicBaseUrl: "https://legal.quvantic.com", serverUrlSecret: "test-webhook-secret" });
    expect(dry.payload.name).toContain("Quillmere");
    expect(dry.payload.voice.voiceId).toBe("Clara");
    expect(dry.payload.model.model).toBe("openai/gpt-oss-120b");
    expect(dry.payload.model.maxTokens).toBe(2000);
    expect(dry.payload.server.url).toBe("https://legal.quvantic.com/v/legal/vapi/webhook");
    expect(dry.payload.model.tools.some((tool) => tool.function.name === "conflict_check")).toBe(true);
  });
});
