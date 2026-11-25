import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { seedIfEmpty } from "../../src/seed.js";
import { HttpSmsProvider } from "../../src/sms/provider.js";
import { SmsStore } from "../../src/store/sms.js";
import { memoryDb, NOW, SECRET, testConfig } from "../helpers.js";

describe("pages", () => {
  it("lists live HVAC and coming-soon verticals", async () => {
    const app = await buildApp({ config: testConfig(), db: memoryDb(), now: () => NOW });
    const landing = await app.inject({ method: "GET", url: "/" });
    expect(landing.statusCode).toBe(200);
    expect(landing.body).toContain("Open the HVAC demo");
    expect(landing.body).toContain("Open the property demo");
    const hvac = await app.inject({ method: "GET", url: "/v/hvac" });
    expect(hvac.body).toContain("Fennwick Comfort Co.");
    expect(hvac.body).toContain("Portfolio demo");
    expect(hvac.body).toContain("Talk to dispatch");
    expect(hvac.body).not.toContain("data-public-key");
    await app.close();
  });

  it("sets CSP headers allowing Daily WebRTC call-machine and fallback CDNs", async () => {
    const app = await buildApp({ config: testConfig(), db: memoryDb(), now: () => NOW });
    const res = await app.inject({ method: "GET", url: "/v/hvac" });
    expect(res.statusCode).toBe(200);
    const csp = String(res.headers["content-security-policy"] ?? "");
    expect(csp).toContain("https://*.daily.co");
    expect(csp).toContain("https://*.dailywebrtc.com");
    expect(csp).toContain("https://*.dailywebrtc.net");
    expect(csp).toContain("wss://*.dailywebrtc.com");
    expect(csp).toContain("wss://*.dailywebrtc.net");
    expect(csp).toContain("https://*.pluot.blue");
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toContain("blob:");
    await app.close();
  });


  it("serves clean HVAC paths on the hvac host", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    const app = await buildApp({
      config: testConfig({
        vapiPublicKey: "pk_test",
        vapiAssistantId: "asst_hvac",
        webCallOrigins: ["https://hvac.quvantic.com", "https://verticals.quvantic.com"],
      }),
      db,
      now: () => NOW,
    });
    const home = await app.inject({ method: "GET", url: "/", headers: { host: "hvac.quvantic.com" } });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Leave if you smell gas");
    const board = await app.inject({ method: "GET", url: "/board", headers: { host: "hvac.quvantic.com" } });
    expect(board.statusCode).toBe(200);
    expect(board.body).toContain("Maya Chen");
    const calls = await app.inject({ method: "GET", url: "/calls", headers: { host: "hvac.quvantic.com" } });
    expect(calls.statusCode).toBe(200);
    expect(calls.body).toContain("Lila Nguyen");
    const platform = await app.inject({ method: "GET", url: "/platform", headers: { host: "hvac.quvantic.com" } });
    expect(platform.statusCode).toBe(200);
    expect(platform.body).toContain("One voice core.");
    const token = await app.inject({
      method: "POST",
      url: "/api/call-token",
      headers: { host: "hvac.quvantic.com", origin: "https://hvac.quvantic.com" },
    });
    expect(token.statusCode).toBe(200);
    expect(token.json().mode).toBe("public-key");
    await app.close();
  });

  it("shows seeded jobs, calls, and a simulated text-back", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    seedIfEmpty(db, NOW);
    const app = await buildApp({ config: testConfig(), db, now: () => NOW });
    const board = await app.inject({ method: "GET", url: "/v/hvac/board" });
    expect(board.body).toContain("Maya Chen");
    expect(board.body).toContain("dispatched");
    const calls = await app.inject({ method: "GET", url: "/v/hvac/calls?q=hardware" });
    expect(calls.body).toContain("Samir Patel");
    expect(calls.body).not.toContain("Maya Chen");
    const detail = await app.inject({ method: "GET", url: "/v/hvac/calls/call_lila" });
    expect(detail.body).toContain("Leave the building");
    const missing = await app.inject({ method: "GET", url: "/v/hvac/calls/missing" });
    expect(missing.body).toContain("Not found");
    const missed = await app.inject({
      method: "POST",
      url: "/v/hvac/demo/missed-call",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "name=Riley+Cho&phone=218-555-0194",
    });
    expect(missed.statusCode).toBe(302);
    const texts = await app.inject({ method: "GET", url: "/v/hvac/messages" });
    expect(texts.body).toContain("we missed your call");
    expect(texts.body).toContain("(218) 555-0194");
    await app.close();
  });
});

describe("SMS adapter", () => {
  it("records an HTTP provider failure without throwing", async () => {
    const store = new SmsStore(memoryDb());
    const provider = new HttpSmsProvider(store, {
      url: "http://127.0.0.1:9/sms",
      fromNumber: "+12185550148",
      fetchImpl: async () => new Response("no", { status: 502 }),
    });
    const message = await provider.send({ verticalId: "hvac", kind: "text_back", to: "218-555-0100", body: "hello" });
    expect(message.status).toBe("failed");
    expect(store.list("hvac")).toHaveLength(1);
  });
});

describe("Vapi tools", () => {
  it("rejects a missing secret, books a tune-up, and replays the same tool call", async () => {
    const app = await buildApp({ config: testConfig(), db: memoryDb(), now: () => NOW });
    const denied = await app.inject({ method: "POST", url: "/v/hvac/vapi/tools/triage_issue", payload: { callId: "c1", arguments: { description: "tune-up" } } });
    expect(denied.statusCode).toBe(401);
    const headers = { "x-vapi-secret": SECRET };
    const triage = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/tools/triage_issue",
      headers,
      payload: { callId: "c1", arguments: { description: "annual furnace tune-up" } },
    });
    expect(triage.json().result.priority).toBe("routine");
    const windows = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/tools/check_windows",
      headers,
      payload: { callId: "c1", arguments: { jobType: "tune_up", priority: "routine" } },
    });
    const start = windows.json().result.windows[0].start as string;
    const book = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/tools/book_job",
      headers,
      payload: {
        callId: "c1",
        toolCallId: "tool_book",
        arguments: {
          windowStart: start,
          customerName: "Sam Lee",
          phone: "218-555-0144",
          address: "14 Lantern Court, Duluth, MN 55803",
          jobType: "tune_up",
          description: "annual furnace tune-up",
        },
      },
    });
    expect(book.json().result.ok).toBe(true);
    const replay = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/tools/book_job",
      headers,
      payload: {
        callId: "c1",
        toolCallId: "tool_book",
        arguments: {
          windowStart: start,
          customerName: "Sam Lee",
          phone: "218-555-0144",
          address: "14 Lantern Court, Duluth, MN 55803",
          jobType: "tune_up",
          description: "annual furnace tune-up",
        },
      },
    });
    expect(replay.json().result.job.id).toBe(book.json().result.job.id);
    const board = await app.inject({ method: "GET", url: "/v/hvac/board" });
    expect(board.body).toContain("Sam Lee");
    const end = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/webhook",
      headers,
      payload: {
        message: {
          type: "end-of-call-report",
          call: { id: "missed_1", customer: { number: "+12185550188" } },
          endedReason: "customer-did-not-answer",
          summary: "No answer",
        },
      },
    });
    expect(end.json().outcome).toBe("text_back");
    const again = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/webhook",
      headers,
      payload: {
        message: {
          type: "end-of-call-report",
          call: { id: "missed_1", customer: { number: "+12185550188" } },
          endedReason: "customer-did-not-answer",
        },
      },
    });
    expect(again.json().callId).toBe(end.json().callId);
    await app.close();
  });

  it("rejects a bad payload", async () => {
    const app = await buildApp({ config: testConfig(), db: memoryDb(), now: () => NOW });
    const response = await app.inject({
      method: "POST",
      url: "/v/hvac/vapi/tools/triage_issue",
      headers: { "x-vapi-secret": SECRET },
      payload: { nope: true },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
