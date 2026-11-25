import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { openDatabase } from "../../src/db/database.js";
import { seedIfEmpty } from "../../src/seed.js";
import { MockSmsProvider } from "../../src/sms/provider.js";
import { SmsStore } from "../../src/store/sms.js";
import { syncAssistant } from "../../src/vapi/sync.js";
import { HOUSE, isDeskOpen, money } from "../../src/verticals/restaurant/brand.js";
import { restaurantScenarioPassed, runRestaurantScenario } from "../../src/verticals/restaurant/eval.js";
import { executeRestaurantTool, type RestaurantToolContext } from "../../src/verticals/restaurant/runtime.js";
import { RESTAURANT_SCENARIOS } from "../../src/verticals/restaurant/scenarios.js";
import { RestaurantStore } from "../../src/verticals/restaurant/store.js";
import { memoryDb, NOW, SECRET, testConfig } from "../helpers.js";

const OPEN = new Date("2026-12-02T21:00:00.000Z");

function ctx(now = OPEN): RestaurantToolContext {
  const db = openDatabase(":memory:");
  return {
    db,
    sms: new MockSmsProvider(new SmsStore(db), HOUSE.phoneE164),
    fromNumber: HOUSE.phoneE164,
    onCallNumber: HOUSE.managerE164,
    transferNumber: HOUSE.managerE164,
    now,
    callRowId: null,
  };
}

describe("Larkglass conversation evals", () => {
  it("runs every restaurant scenario", async () => {
    expect(RESTAURANT_SCENARIOS.length).toBeGreaterThanOrEqual(16);
    const failures: string[] = [];
    for (const scenario of RESTAURANT_SCENARIOS) {
      const result = await runRestaurantScenario(scenario);
      if (!restaurantScenarioPassed(scenario, result)) {
        failures.push(`${scenario.id} outcome=${result.outcome} tools=${result.toolNames.join(",")} body=${JSON.stringify(result.results).slice(0, 280)}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("Larkglass edge tools", () => {
  it("covers menu, allergy holds, seating rules, and the manager", async () => {
    const desk = ctx();
    expect(money(2592)).toBe("$25.92");
    expect(isDeskOpen(OPEN)).toBe(true);
    expect(isDeskOpen(new Date("2026-12-07T21:00:00.000Z"))).toBe(false);
    expect((await executeRestaurantTool("nope", {}, desk) as { code: string }).code).toBe("unknown_tool");
    expect((await executeRestaurantTool("lookup_menu", {}, desk) as { ok: boolean }).ok).toBe(true);
    expect((await executeRestaurantTool("lookup_menu", { query: "not-a-dish" }, desk) as { code: string }).code).toBe("unknown_item");
    expect((await executeRestaurantTool("quote_order", { items: [{ sku: "farro", qty: 1, modifiers: ["nope"] }], fulfillment: "pickup" }, desk) as { code: string }).code).toBe("bad_modifier");
    expect((await executeRestaurantTool("quote_order", { items: [{ sku: "spritz", qty: 1 }], fulfillment: "delivery" }, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executeRestaurantTool("quote_order", { items: [{ sku: "cake", qty: 1 }], fulfillment: "pickup", allergyNote: "is this safe" }, desk) as { code: string }).code).toBe("promise");
    const held = await executeRestaurantTool("place_order", { guestName: "Lena Ortiz", phone: "2075550144", items: [{ sku: "steelhead", qty: 1, modifiers: ["no_butter"] }], fulfillment: "pickup", allergyNote: "fish allergy" }, desk);
    expect((held as { status: string }).status).toBe("hold");
    expect((await executeRestaurantTool("place_order", { guestName: "A", phone: "555", items: [{ sku: "spritz", qty: 1 }], fulfillment: "pickup" }, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executeRestaurantTool("book_table", { guestName: "A", phone: "2075550144", partySize: 2, start: "2026-12-02T22:00:00.000Z", allergyNote: "I can't breathe" }, desk) as { code: string }).code).toBe("danger");
    expect((await executeRestaurantTool("book_table", { guestName: "A", phone: "555", partySize: 2, start: "2026-12-02T22:30:00.000Z" }, desk) as { code: string }).code).toBe("invalid_arguments");
    expect((await executeRestaurantTool("book_table", { guestName: "A", phone: "2075550144", partySize: 2, start: "nope" }, desk) as { code: string }).code).toBe("invalid_time");
    expect((await executeRestaurantTool("book_table", { guestName: "A", phone: "2075550144", partySize: 2, start: "2026-12-02T20:00:00.000Z" }, desk) as { code: string }).code).toBe("in_the_past");
    expect((await executeRestaurantTool("book_table", { guestName: "A", phone: "2075550144", partySize: 2, start: "2026-12-06T22:00:00.000Z" }, desk) as { code: string }).code).toBe("closed");
    expect((await executeRestaurantTool("book_table", { guestName: "A", phone: "2075550144", partySize: 2, start: "2026-12-02T22:15:00.000Z" }, desk) as { code: string }).code).toBe("misaligned");
    expect((await executeRestaurantTool("check_tables", { partySize: 12 }, desk) as { transfer: boolean }).transfer).toBe(true);
    const sunday = ctx(new Date("2026-12-06T22:00:00.000Z"));
    expect((await executeRestaurantTool("check_tables", { partySize: 2, days: 1 }, sunday) as { message: string }).message).toContain("No seatings");
    expect((await executeRestaurantTool("reschedule_table", { reservationId: "missing", start: "2026-12-03T22:00:00.000Z" }, desk) as { code: string }).code).toBe("not_found");
    expect((await executeRestaurantTool("cancel_table", { reservationId: "missing" }, desk) as { code: string }).code).toBe("not_found");
    expect((await executeRestaurantTool("send_confirmation", { orderId: "missing" }, desk) as { code: string }).code).toBe("not_found");
    const soon = new RestaurantStore(desk.db);
    soon.insertReservation({ id: "res_soon", guestName: "Lena", phone: "2075550144", partySize: 2, startsAt: "2026-12-02T22:30:00.000Z", endsAt: "2026-12-03T00:00:00.000Z", allergy: "", status: "scheduled", now: OPEN });
    expect((await executeRestaurantTool("cancel_table", { reservationId: "res_soon" }, desk) as { code: string }).code).toBe("inside_notice");
    expect((await executeRestaurantTool("transfer_to_manager", { reason: "tell me a joke" }, desk) as { code: string }).code).toBe("off_topic");
    expect((await executeRestaurantTool("transfer_to_manager", { reason: "I need a person." }, sunday) as { afterHours: boolean }).afterHours).toBe(true);
    expect((await executeRestaurantTool("screen_request", { description: "table for two" }, desk) as { route: string }).route).toBe("service");
  });
});

describe("Larkglass pages", () => {
  it("serves the host stand on the restaurant host", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    const app = await buildApp({
      config: testConfig({
        vapiPublicKey: "pk_test",
        vapiRestaurantAssistantId: "asst_restaurant",
        webCallOrigins: ["https://restaurant.quvantic.com"],
      }),
      db,
      now: () => NOW,
    });
    const home = await app.inject({ method: "GET", url: "/", headers: { host: "restaurant.quvantic.com" } });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Larkglass");
    expect(home.body).toContain("not a real restaurant");
    const board = await app.inject({ method: "GET", url: "/board", headers: { host: "restaurant.quvantic.com" } });
    expect(board.body).toContain("Maya Chen");
    expect(board.body).toContain("sesame");
    const menu = await app.inject({ method: "GET", url: "/v/restaurant/menu" });
    expect(menu.body).toContain("Cider chicken");
    expect(menu.body).toContain("fish");
    const ticket = await app.inject({
      method: "POST",
      url: "/v/restaurant/demo/ticket",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "",
    });
    expect(ticket.statusCode).toBe(302);
    const after = await app.inject({ method: "GET", url: "/v/restaurant/board" });
    expect(after.body).toContain("Walk-in Demo");
    const detail = await app.inject({ method: "GET", url: "/v/restaurant/calls/call_maya_table" });
    expect(detail.body).toContain("plate is safe");
    const token = await app.inject({
      method: "POST",
      url: "/api/call-token",
      headers: { host: "restaurant.quvantic.com", origin: "https://restaurant.quvantic.com" },
    });
    expect(token.json().assistantId).toBe("asst_restaurant");
    const webchat = await app.inject({
      method: "POST",
      url: "/v/restaurant/vapi/tools/screen_request",
      headers: { "x-vapi-secret": SECRET },
      payload: {
        message: {
          type: "tool-calls",
          chat: { id: "chat_restaurant" },
          toolWithToolCallList: [{ toolCall: { id: "fc_rest", type: "function", function: { name: "screen_request", arguments: { description: "Is this guaranteed allergen-free?" } } } }],
        },
      },
    });
    expect(webchat.statusCode).toBe(200);
    expect(JSON.parse(webchat.json().results[0].result as string).code).toBe("promise");
    await app.close();
  });
});

describe("Larkglass assistant", () => {
  it("targets the restaurant tool URLs with Clara", async () => {
    const dry = await syncAssistant({ vertical: "restaurant", publicBaseUrl: "https://restaurant.quvantic.com", serverUrlSecret: "test-webhook-secret" });
    expect(dry.payload.name).toContain("Larkglass");
    expect(dry.payload.voice.voiceId).toBe("Clara");
    expect(dry.payload.model.model).toBe("openai/gpt-oss-120b");
    expect(dry.payload.model.maxTokens).toBe(2000);
    expect(dry.payload.server.url).toBe("https://restaurant.quvantic.com/v/restaurant/vapi/webhook");
    expect(dry.payload.model.tools.some((tool) => tool.function.name === "place_order")).toBe(true);
  });
});
