import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { openDatabase } from "../../src/db/database.js";
import { seedIfEmpty } from "../../src/seed.js";
import { MockSmsProvider } from "../../src/sms/provider.js";
import { SmsStore } from "../../src/store/sms.js";
import { syncAssistant } from "../../src/vapi/sync.js";
import { FIRM, isDeskOpen } from "../../src/verticals/property/brand.js";
import { propertyScenarioPassed, runPropertyScenario, seedPropertyTenants } from "../../src/verticals/property/eval.js";
import { executePropertyTool, type PropertyToolContext } from "../../src/verticals/property/runtime.js";
import { PROPERTY_SCENARIOS } from "../../src/verticals/property/scenarios.js";
import { PropertyStore } from "../../src/verticals/property/store.js";
import { memoryDb, NOW, SECRET, testConfig } from "../helpers.js";

const OPEN = new Date("2026-12-02T15:00:00.000Z");
const maya = { name: "Maya Chen", unit: "LH-204", dob: "1984-03-14", relationship: "self" };

function ctx(now = OPEN): PropertyToolContext {
  const db = openDatabase(":memory:");
  seedPropertyTenants(new PropertyStore(db));
  return {
    db,
    sms: new MockSmsProvider(new SmsStore(db), FIRM.phoneE164),
    fromNumber: FIRM.phoneE164,
    onCallNumber: FIRM.onCallE164,
    transferNumber: FIRM.leasingE164,
    now,
    callRowId: null,
  };
}

describe("Bramblefen conversation evals", () => {
  it("runs every property scenario", async () => {
    expect(PROPERTY_SCENARIOS.length).toBeGreaterThanOrEqual(16);
    const failures: string[] = [];
    for (const scenario of PROPERTY_SCENARIOS) {
      const result = await runPropertyScenario(scenario);
      if (!propertyScenarioPassed(scenario, result)) {
        failures.push(`${scenario.id} outcome=${result.outcome} tools=${result.toolNames.join(",")} body=${JSON.stringify(result.results).slice(0, 300)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("Bramblefen edge tools", () => {
  it("covers tours, identity, and after-hours routine work", async () => {
    const desk = ctx();
    expect(isDeskOpen(OPEN)).toBe(true);
    expect(isDeskOpen(new Date("2026-12-06T15:00:00.000Z"))).toBe(false);
    expect((await executePropertyTool("nope", {}, desk) as { code: string }).code).toBe("unknown_tool");
    expect((await executePropertyTool("verify_tenant", { name: "Maya Chen" }, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executePropertyTool("verify_tenant", { ...maya, portalCode: "4412", dob: "" }, desk) as { ok: boolean }).ok).toBe(true);
    expect((await executePropertyTool("verify_tenant", { ...maya, dob: "1999-01-01" }, desk) as { code: string }).code).toBe("not_verified");
    expect((await executePropertyTool("list_units", { beds: 3 }, desk) as { code: string }).code).toBe("none");
    expect((await executePropertyTool("list_units", {}, desk) as { ok: boolean }).ok).toBe(true);
    expect((await executePropertyTool("check_tours", { unitId: "NOPE" }, desk) as { code: string }).code).toBe("unknown_unit");
    expect((await executePropertyTool("check_tours", { unitId: "LH-204" }, desk) as { code: string }).code).toBe("occupied");
    expect((await executePropertyTool("book_tour", { prospectName: "A", phone: "555", unitId: "LH-310", start: "2026-12-03T15:00:00.000Z" }, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executePropertyTool("book_tour", { prospectName: "A", phone: "4015550144", unitId: "LH-204", start: "2026-12-03T15:00:00.000Z" }, desk) as { code: string }).code).toBe("occupied");
    expect((await executePropertyTool("book_tour", { prospectName: "A", phone: "4015550144", unitId: "LH-310", start: "nope" }, desk) as { code: string }).code).toBe("invalid_time");
    expect((await executePropertyTool("book_tour", { prospectName: "A", phone: "4015550144", unitId: "LH-310", start: "2026-12-02T14:00:00.000Z" }, desk) as { code: string }).code).toBe("in_the_past");
    expect((await executePropertyTool("book_tour", { prospectName: "A", phone: "4015550144", unitId: "LH-310", start: "2026-12-06T15:00:00.000Z" }, desk) as { code: string }).code).toBe("closed");
    expect((await executePropertyTool("book_tour", { prospectName: "A", phone: "4015550144", unitId: "LH-310", start: "2026-12-02T15:15:00.000Z" }, desk) as { code: string }).code).toBe("misaligned");
    const sunday = ctx(new Date("2026-12-06T18:00:00.000Z"));
    expect((await executePropertyTool("check_tours", { unitId: "GM-102", days: 1 }, sunday) as { message: string }).message).toContain("No tour");
    expect((await executePropertyTool("open_ticket", { ...maya, description: "The bathroom faucet is dripping." }, sunday) as { message: string }).message).toContain("office is closed");
    expect((await executePropertyTool("reschedule_tour", { tourId: "missing", start: "2026-12-03T15:00:00.000Z" }, desk) as { code: string }).code).toBe("not_found");
    expect((await executePropertyTool("cancel_tour", { tourId: "missing" }, desk) as { code: string }).code).toBe("not_found");
    const soon = new PropertyStore(desk.db);
    soon.insertTour({ id: "tour_soon", prospectName: "Noor", phone: "4015550188", unitId: "LH-310", startsAt: "2026-12-02T18:00:00.000Z", endsAt: "2026-12-02T18:30:00.000Z", now: OPEN });
    expect((await executePropertyTool("cancel_tour", { tourId: "tour_soon" }, desk) as { code: string }).code).toBe("inside_notice");
    expect((await executePropertyTool("rent_faq", { ...maya, question: "tell me a joke" }, desk) as { code: string }).code).toBe("off_topic");
    expect((await executePropertyTool("transfer_to_leasing", { reason: "tell me a poem" }, desk) as { code: string }).code).toBe("off_topic");
    expect((await executePropertyTool("transfer_to_leasing", { reason: "I need a person." }, sunday) as { afterHours: boolean }).afterHours).toBe(true);
    const gas = await executePropertyTool("open_ticket", { ...maya, description: "The CO alarm is going off." }, desk);
    expect((gas as { route: string }).route).toBe("911");
  });
});

describe("Bramblefen pages", () => {
  it("serves the desk on the property host", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    const app = await buildApp({
      config: testConfig({
        vapiPublicKey: "pk_test",
        vapiPropertyAssistantId: "asst_property",
        webCallOrigins: ["https://property.quvantic.com"],
      }),
      db,
      now: () => NOW,
    });
    const home = await app.inject({ method: "GET", url: "/", headers: { host: "property.quvantic.com" } });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Bramblefen");
    expect(home.body).toContain("not a real property manager");
    const board = await app.inject({ method: "GET", url: "/board", headers: { host: "property.quvantic.com" } });
    expect(board.body).toContain("LH-204");
    expect(board.body).toContain("emergency");
    const tours = await app.inject({ method: "GET", url: "/v/property/tours" });
    expect(tours.body).toContain("LH-310");
    expect(tours.body).toContain("Noor Adel");
    const ticket = await app.inject({
      method: "POST",
      url: "/v/property/demo/ticket",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });
    expect(ticket.statusCode).toBe(302);
    const after = await app.inject({ method: "GET", url: "/v/property/board" });
    expect(after.body).toContain("Sample drip");
    const detail = await app.inject({ method: "GET", url: "/v/property/calls/call_maya_unit" });
    expect(detail.body).toContain("call 911");
    const token = await app.inject({
      method: "POST",
      url: "/api/call-token",
      headers: { host: "property.quvantic.com", origin: "https://property.quvantic.com" },
    });
    expect(token.json().assistantId).toBe("asst_property");
    const webchat = await app.inject({
      method: "POST",
      url: "/v/property/vapi/tools/screen_issue",
      headers: { "x-vapi-secret": SECRET },
      payload: {
        message: {
          type: "tool-calls",
          chat: { id: "chat_property" },
          toolWithToolCallList: [{ toolCall: { id: "fc_prop", type: "function", function: { name: "screen_issue", arguments: { description: "I smell gas in the kitchen." } } } }],
        },
      },
    });
    expect(webchat.statusCode).toBe(200);
    expect(JSON.parse(webchat.json().results[0].result as string).route).toBe("911");
    await app.close();
  });
});

describe("Bramblefen assistant", () => {
  it("targets the property tool URLs with Clara", async () => {
    const dry = await syncAssistant({ vertical: "property", publicBaseUrl: "https://property.quvantic.com", serverUrlSecret: "test-webhook-secret" });
    expect(dry.payload.name).toContain("Bramblefen");
    expect(dry.payload.voice.voiceId).toBe("Clara");
    expect(dry.payload.model.maxTokens).toBe(2000);
    expect(dry.payload.server.url).toBe("https://property.quvantic.com/v/property/vapi/webhook");
    expect(dry.payload.model.tools.some((tool) => tool.function.name === "open_ticket")).toBe(true);
  });
});
