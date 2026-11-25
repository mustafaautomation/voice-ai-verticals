import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { SqliteDatabase } from "../db/database.js";
import { verticalForHost } from "../platform/host.js";
import type { SmsProvider } from "../sms/provider.js";
import { CallStore } from "../store/calls.js";
import { CustomerStore } from "../store/customers.js";
import { JobStore } from "../store/jobs.js";
import { SmsStore } from "../store/sms.js";
import { getRuntime, toolContext } from "../verticals/registry.js";
import { renderBoard, renderCall, renderHvacHome, renderLanding, renderNotFound } from "./render.js";
import { renderClinicCall, renderClinicDesk, renderClinicHome, type ClinicDesk } from "./clinic-render.js";
import { ClinicStore } from "../verticals/clinic/store.js";
import { renderFintechCall, renderFintechDesk, renderFintechHome, type FintechDesk } from "./fintech-render.js";
import { FintechStore } from "../verticals/fintech/store.js";
import { simulateReminder } from "../verticals/fintech/runtime.js";
import { renderLegalCall, renderLegalDesk, renderLegalHome, type LegalDesk } from "./legal-render.js";
import { LegalStore } from "../verticals/legal/store.js";
import { executeLegalTool } from "../verticals/legal/runtime.js";
import { renderRestaurantCall, renderRestaurantDesk, renderRestaurantHome, type RestaurantDesk } from "./restaurant-render.js";
import { RestaurantStore } from "../verticals/restaurant/store.js";
import { renderPropertyCall, renderPropertyDesk, renderPropertyHome, type PropertyDesk } from "./property-render.js";
import { PropertyStore } from "../verticals/property/store.js";

const missedSchema = z.object({
  name: z.string().max(120).optional().default(""),
  phone: z.string().min(7).max(32),
});

export async function registerPageRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; db: SqliteDatabase; sms: SmsProvider; now: () => Date },
): Promise<void> {
  app.get("/", async (request, reply) => {
    const hostVertical = verticalForHost(request.hostname, deps.config.verticalHosts);
    if (hostVertical === "hvac") return reply.type("text/html").send(renderHvacHome(linkBase(request, deps.config, "hvac")));
    if (hostVertical === "clinic") return reply.type("text/html").send(renderClinicHome(linkBase(request, deps.config, "clinic")));
    if (hostVertical === "fintech") return reply.type("text/html").send(renderFintechHome(linkBase(request, deps.config, "fintech")));
    if (hostVertical === "legal") return reply.type("text/html").send(renderLegalHome(linkBase(request, deps.config, "legal")));
    if (hostVertical === "restaurant") return reply.type("text/html").send(renderRestaurantHome(linkBase(request, deps.config, "restaurant")));
    if (hostVertical === "property") return reply.type("text/html").send(renderPropertyHome(linkBase(request, deps.config, "property")));
    return reply.type("text/html").send(renderLanding());
  });
  app.get("/platform", async (_request, reply) => reply.type("text/html").send(renderLanding()));
  app.get("/v/hvac", async (request, reply) => reply.type("text/html").send(renderHvacHome(linkBase(request, deps.config, "hvac"))));
  app.get("/v/hvac/", async (_request, reply) => reply.redirect("/v/hvac"));
  app.get("/v/clinic", async (request, reply) => reply.type("text/html").send(renderClinicHome(linkBase(request, deps.config, "clinic"))));
  app.get("/v/clinic/", async (_request, reply) => reply.redirect("/v/clinic"));
  app.get("/v/fintech", async (request, reply) => reply.type("text/html").send(renderFintechHome(linkBase(request, deps.config, "fintech"))));
  app.get("/v/fintech/", async (_request, reply) => reply.redirect("/v/fintech"));
  app.get("/v/legal", async (request, reply) => reply.type("text/html").send(renderLegalHome(linkBase(request, deps.config, "legal"))));
  app.get("/v/legal/", async (_request, reply) => reply.redirect("/v/legal"));
  app.get("/v/restaurant", async (request, reply) => reply.type("text/html").send(renderRestaurantHome(linkBase(request, deps.config, "restaurant"))));
  app.get("/v/restaurant/", async (_request, reply) => reply.redirect("/v/restaurant"));
  app.get("/v/property", async (request, reply) => reply.type("text/html").send(renderPropertyHome(linkBase(request, deps.config, "property"))));
  app.get("/v/property/", async (_request, reply) => reply.redirect("/v/property"));

  for (const tab of ["board", "calls", "messages", "customers"] as const) {
    app.get(`/v/hvac/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config, "hvac");
      return reply.type("text/html").send(
        renderBoard(base, tab, load(deps.db, tab === "calls" ? query : ""), query, notice),
      );
    });
  }

  app.get("/v/hvac/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config, "hvac");
    if (!call || call.verticalId !== "hvac") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderCall(base, call, calls.listToolCalls(call.id)));
  });

  app.post("/v/hvac/demo/missed-call", async (request, reply) => {
    const parsed = missedSchema.safeParse(request.body ?? {});
    const base = linkBase(request, deps.config, "hvac");
    if (!parsed.success) return reply.redirect(`${base}/messages?notice=Enter a callback number.`);
    const runtime = getRuntime("hvac");
    if (!runtime) return reply.code(404).send({ error: "unknown_vertical" });
    const result = await runtime.simulateMissedCall(
      toolContext({
        db: deps.db,
        sms: deps.sms,
        fromNumber: deps.config.smsFromNumber,
        onCallNumber: deps.config.onCallNumber,
        transferNumber: deps.config.transferNumber,
        now: deps.now(),
        callRowId: null,
      }),
      { name: parsed.data.name, phone: parsed.data.phone },
    );
    if (!result.ok) return reply.redirect(`${base}/messages?notice=${encodeURIComponent(result.message)}`);
    return reply.redirect(`${base}/messages?notice=Missed-call text queued in the demo inbox.`);
  });

  for (const tab of ["board", "calls", "messages", "patients", "audit"] as const) {
    app.get(`/v/clinic/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config, "clinic");
      return reply.type("text/html").send(renderClinicDesk(base, tab, loadClinic(deps.db, tab === "calls" ? query : ""), query, notice));
    });
  }
  app.get("/v/clinic/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config, "clinic");
    if (!call || call.verticalId !== "clinic") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderClinicCall(base, call, calls.listToolCalls(call.id)));
  });
  app.post("/v/clinic/demo/missed-call", async (request, reply) => {
    const parsed = missedSchema.safeParse(request.body ?? {});
    const base = linkBase(request, deps.config, "clinic");
    if (!parsed.success) return reply.redirect(`${base}/messages?notice=Enter a callback number.`);
    const runtime = getRuntime("clinic");
    if (!runtime) return reply.code(404).send({ error: "unknown_vertical" });
    const result = await runtime.simulateMissedCall(
      toolContext({
        db: deps.db,
        sms: deps.sms,
        fromNumber: deps.config.smsFromNumber,
        onCallNumber: deps.config.onCallNumber,
        transferNumber: deps.config.transferNumber,
        now: deps.now(),
        callRowId: null,
      }),
      { name: parsed.data.name, phone: parsed.data.phone },
    );
    if (!result.ok) return reply.redirect(`${base}/messages?notice=${encodeURIComponent(result.message)}`);
    return reply.redirect(`${base}/messages?notice=Missed-call text queued in the demo inbox.`);
  });

  for (const tab of ["board", "calls", "messages", "accounts", "audit"] as const) {
    app.get(`/v/fintech/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config, "fintech");
      return reply.type("text/html").send(renderFintechDesk(base, tab, loadFintech(deps.db, tab === "calls" ? query : ""), query, notice));
    });
  }
  app.get("/v/fintech/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config, "fintech");
    if (!call || call.verticalId !== "fintech") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderFintechCall(base, call, calls.listToolCalls(call.id)));
  });
  app.post("/v/fintech/demo/reminder", async (request, reply) => {
    const base = linkBase(request, deps.config, "fintech");
    const result = await simulateReminder(
      toolContext({
        db: deps.db,
        sms: deps.sms,
        fromNumber: deps.config.smsFromNumber,
        onCallNumber: deps.config.onCallNumber,
        transferNumber: deps.config.transferNumber,
        now: deps.now(),
        callRowId: null,
      }),
      "acct_maya",
    );
    if (!result.ok) return reply.redirect(`${base}/board?notice=${encodeURIComponent(result.message)}`);
    return reply.redirect(`${base}/calls/${result.callId}`);
  });

  for (const tab of ["board", "calls", "messages", "contacts", "audit"] as const) {
    app.get(`/v/legal/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config, "legal");
      return reply.type("text/html").send(renderLegalDesk(base, tab, loadLegal(deps.db, tab === "calls" ? query : ""), query, notice));
    });
  }
  app.get("/v/legal/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config, "legal");
    if (!call || call.verticalId !== "legal") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderLegalCall(base, call, calls.listToolCalls(call.id)));
  });
  app.post("/v/legal/demo/summary", async (request, reply) => {
    const base = linkBase(request, deps.config, "legal");
    const result = (await executeLegalTool(
      "send_intake_summary",
      { matterId: "mat_lena" },
      toolContext({
        db: deps.db,
        sms: deps.sms,
        fromNumber: deps.config.smsFromNumber,
        onCallNumber: deps.config.onCallNumber,
        transferNumber: deps.config.transferNumber,
        now: deps.now(),
        callRowId: null,
      }),
    )) as { ok?: boolean; message?: string };
    if (!result.ok) return reply.redirect(`${base}/messages?notice=${encodeURIComponent(result.message ?? "Could not queue the text.")}`);
    return reply.redirect(`${base}/messages?notice=Intake summary queued. The link does not hire the firm.`);
  });

  for (const tab of ["board", "calls", "messages", "menu"] as const) {
    app.get(`/v/restaurant/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config, "restaurant");
      return reply.type("text/html").send(renderRestaurantDesk(base, tab, loadRestaurant(deps.db, tab === "calls" ? query : ""), query, notice));
    });
  }
  app.get("/v/restaurant/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config, "restaurant");
    if (!call || call.verticalId !== "restaurant") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderRestaurantCall(base, call, calls.listToolCalls(call.id)));
  });
  app.post("/v/restaurant/demo/ticket", async (request, reply) => {
    const base = linkBase(request, deps.config, "restaurant");
    const book = new RestaurantStore(deps.db);
    book.insertTicket({
      guestName: "Walk-in Demo",
      phone: "2075550199",
      fulfillment: "pickup",
      address: "",
      lines: [{ sku: "spritz", name: "House spritz", qty: 1, modifiers: [], cents: 800 }],
      allergy: "",
      subtotalCents: 800,
      feeCents: 0,
      taxCents: 64,
      totalCents: 864,
      status: "new",
      now: deps.now(),
    });
    return reply.redirect(`${base}/board?notice=Sample ticket is on the board. Nothing was charged.`);
  });

  for (const tab of ["board", "tours", "calls", "messages"] as const) {
    app.get(`/v/property/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config, "property");
      return reply.type("text/html").send(renderPropertyDesk(base, tab, loadProperty(deps.db, tab === "calls" ? query : ""), query, notice));
    });
  }
  app.get("/v/property/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config, "property");
    if (!call || call.verticalId !== "property") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderPropertyCall(base, call, calls.listToolCalls(call.id)));
  });
  app.post("/v/property/demo/ticket", async (request, reply) => {
    const base = linkBase(request, deps.config, "property");
    new PropertyStore(deps.db).insertTicket({
      callerName: "Sample drip",
      unitId: "GM-110",
      category: "routine",
      priority: "routine",
      summary: "Sample drip ticket. Nothing was dispatched.",
      status: "queued",
      now: deps.now(),
    });
    return reply.redirect(`${base}/board?notice=Sample drip is on the board.`);
  });
}

export function linkBase(request: FastifyRequest, config: AppConfig, verticalId: string): string {
  return verticalForHost(request.hostname, config.verticalHosts) === verticalId ? "" : `/v/${verticalId}`;
}

function loadClinic(db: SqliteDatabase, callQuery: string): ClinicDesk {
  const clinic = new ClinicStore(db);
  return {
    visits: clinic.listAppointments(),
    calls: new CallStore(db).list("clinic", callQuery),
    messages: new SmsStore(db).list("clinic"),
    patients: clinic.listPatients(),
    refills: clinic.listRefills(),
    audit: clinic.listAudit(),
  };
}

function loadFintech(db: SqliteDatabase, callQuery: string): FintechDesk {
  const fintech = new FintechStore(db);
  return {
    accounts: fintech.listAccounts(),
    cases: fintech.listCases(),
    calls: new CallStore(db).list("fintech", callQuery),
    messages: new SmsStore(db).list("fintech"),
    audit: fintech.listAudit(),
  };
}

function loadProperty(db: SqliteDatabase, callQuery: string): PropertyDesk {
  const property = new PropertyStore(db);
  return {
    tickets: property.listTickets(),
    tours: property.listTours(),
    calls: new CallStore(db).list("property", callQuery),
    messages: new SmsStore(db).list("property"),
  };
}

function loadRestaurant(db: SqliteDatabase, callQuery: string): RestaurantDesk {
  const restaurant = new RestaurantStore(db);
  return {
    tickets: restaurant.listTickets(),
    reservations: restaurant.listReservations(),
    calls: new CallStore(db).list("restaurant", callQuery),
    messages: new SmsStore(db).list("restaurant"),
  };
}

function loadLegal(db: SqliteDatabase, callQuery: string): LegalDesk {
  const legal = new LegalStore(db);
  return {
    matters: legal.listMatters(),
    consults: legal.listConsults(),
    parties: legal.listParties(),
    calls: new CallStore(db).list("legal", callQuery),
    messages: new SmsStore(db).list("legal"),
    audit: legal.listAudit(),
  };
}

function load(db: SqliteDatabase, callQuery: string) {
  return {
    jobs: new JobStore(db).list("hvac"),
    calls: new CallStore(db).list("hvac", callQuery),
    messages: new SmsStore(db).list("hvac"),
    customers: new CustomerStore(db).list("hvac"),
  };
}
