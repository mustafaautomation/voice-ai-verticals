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

const missedSchema = z.object({
  name: z.string().max(120).optional().default(""),
  phone: z.string().min(7).max(32),
});

export async function registerPageRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; db: SqliteDatabase; sms: SmsProvider; now: () => Date },
): Promise<void> {
  app.get("/", async (request, reply) => {
    if (verticalForHost(request.hostname, deps.config.verticalHosts) === "hvac") {
      return reply.type("text/html").send(renderHvacHome(linkBase(request, deps.config)));
    }
    return reply.type("text/html").send(renderLanding());
  });
  app.get("/platform", async (_request, reply) => reply.type("text/html").send(renderLanding()));
  app.get("/v/hvac", async (request, reply) => reply.type("text/html").send(renderHvacHome(linkBase(request, deps.config))));
  app.get("/v/hvac/", async (request, reply) => reply.redirect("/v/hvac"));

  for (const tab of ["board", "calls", "messages", "customers"] as const) {
    app.get(`/v/hvac/${tab}`, async (request, reply) => {
      const query = typeof (request.query as { q?: string }).q === "string" ? (request.query as { q: string }).q : "";
      const notice = typeof (request.query as { notice?: string }).notice === "string" ? (request.query as { notice: string }).notice : "";
      const base = linkBase(request, deps.config);
      return reply.type("text/html").send(
        renderBoard(base, tab, load(deps.db, tab === "calls" ? query : ""), query, notice),
      );
    });
  }

  app.get("/v/hvac/calls/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const calls = new CallStore(deps.db);
    const call = calls.getById(id);
    const base = linkBase(request, deps.config);
    if (!call || call.verticalId !== "hvac") return reply.code(404).type("text/html").send(renderNotFound(base));
    return reply.type("text/html").send(renderCall(base, call, calls.listToolCalls(call.id)));
  });

  app.post("/v/hvac/demo/missed-call", async (request, reply) => {
    const parsed = missedSchema.safeParse(request.body ?? {});
    const base = linkBase(request, deps.config);
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
}

export function linkBase(request: FastifyRequest, config: AppConfig): string {
  return verticalForHost(request.hostname, config.verticalHosts) ? "" : "/v/hvac";
}

function load(db: SqliteDatabase, callQuery: string) {
  return {
    jobs: new JobStore(db).list("hvac"),
    calls: new CallStore(db).list("hvac", callQuery),
    messages: new SmsStore(db).list("hvac"),
    customers: new CustomerStore(db).list("hvac"),
  };
}
