import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import type { AppConfig } from "./config.js";
import type { SqliteDatabase } from "./db/database.js";
import { rewriteForVertical, verticalForHost } from "./platform/host.js";
import { HttpSmsProvider, MockSmsProvider, type SmsProvider } from "./sms/provider.js";
import { SmsStore } from "./store/sms.js";
import { registerPageRoutes } from "./pages/routes.js";
import { registerVapiRoutes } from "./vapi/routes.js";
import { MemoryCallQuota } from "./webcall/quota.js";
import { registerWebCallRoutes, type WebCallAuth } from "./webcall/routes.js";

export type AppDeps = {
  config: AppConfig;
  db: SqliteDatabase;
  sms?: SmsProvider;
  now?: () => Date;
};

export function createSms(config: AppConfig, db: SqliteDatabase): SmsProvider {
  const store = new SmsStore(db);
  if (config.smsProvider === "http") {
    return new HttpSmsProvider(store, {
      url: config.smsWebhookUrl,
      fromNumber: config.smsFromNumber,
      token: config.smsWebhookToken || undefined,
    });
  }
  return new MockSmsProvider(store, config.smsFromNumber);
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const now = deps.now ?? (() => new Date());
  const sms = deps.sms ?? createSms(deps.config, deps.db);
  const app = Fastify({
    trustProxy: deps.config.trustProxyHeaders,
    logger: deps.config.logLevel === "silent" ? false : { level: deps.config.logLevel, redact: ["req.headers.x-vapi-secret", "req.headers.authorization"] },
    rewriteUrl(request) {
      const forwarded = deps.config.trustProxyHeaders ? request.headers["x-forwarded-host"] : undefined;
      const rawHost = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || request.headers.host || "";
      const verticalId = verticalForHost(rawHost, deps.config.verticalHosts);
      return rewriteForVertical(verticalId, request.url ?? "/");
    },
  });

  await app.register(formbody);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        scriptSrc: [
          "'self'",
          "https://esm.sh",
          "https://*.daily.co",
          "https://*.dailywebrtc.com",
          "https://*.dailywebrtc.net",
          "'wasm-unsafe-eval'",
          "blob:",
        ],
        connectSrc: [
          "'self'",
          "https://api.vapi.ai",
          "https://*.vapi.ai",
          "wss://*.vapi.ai",
          "https://*.daily.co",
          "wss://*.daily.co",
          "https://*.dailywebrtc.com",
          "wss://*.dailywebrtc.com",
          "https://*.dailywebrtc.net",
          "wss://*.dailywebrtc.net",
          "https://*.pluot.blue",
          "wss://*.pluot.blue",
        ],
        frameSrc: ["'self'", "https://*.daily.co", "https://*.dailywebrtc.com", "https://*.dailywebrtc.net"],
        mediaSrc: ["'self'", "blob:"],
        workerSrc: ["'self'", "blob:"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  });

  if (deps.config.serveStatic) {
    const { default: fastifyStatic } = await import("@fastify/static");
    await app.register(fastifyStatic, { root: join(process.cwd(), "public", "assets"), prefix: "/assets/" });
  }

  app.get("/health", async () => ({ ok: true, service: "voice-ai-verticals", verticals: ["hvac", "clinic", "fintech", "legal"] }));

  await registerPageRoutes(app, { config: deps.config, db: deps.db, sms, now });
  const config = deps.config;
  const auth: WebCallAuth | null =
    config.vapiApiKey && config.vapiOrgId
      ? { mode: "jwt", privateKey: config.vapiApiKey, orgId: config.vapiOrgId }
      : config.vapiPublicKey
        ? { mode: "public-key", publicKey: config.vapiPublicKey }
        : null;
  const assistants: Record<string, string> = {};
  if (config.vapiAssistantId) assistants.hvac = config.vapiAssistantId;
  if (config.vapiClinicAssistantId) assistants.clinic = config.vapiClinicAssistantId;
  if (config.vapiFintechAssistantId) assistants.fintech = config.vapiFintechAssistantId;
  if (config.vapiLegalAssistantId) assistants.legal = config.vapiLegalAssistantId;
  await registerWebCallRoutes(
    app,
    auth && Object.keys(assistants).length > 0
      ? {
          quota: new MemoryCallQuota({ perVisitor: config.webCallLimitPerVisitor, perDay: config.webCallLimitPerDay }),
          auth,
          assistants,
          allowedOrigins: config.webCallOrigins,
          tokenTtlSeconds: config.webCallTokenTtlSeconds,
          perVisitor: config.webCallLimitPerVisitor,
          hashKey: config.vapiWebhookSecret,
          trustProxyHeaders: config.trustProxyHeaders,
          now,
        }
      : null,
  );
  await registerVapiRoutes(app, {
    secret: config.vapiWebhookSecret,
    db: deps.db,
    sms,
    fromNumber: config.smsFromNumber,
    onCallNumber: config.onCallNumber,
    transferNumber: config.transferNumber,
    now,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.headers.accept?.includes("text/html")) {
      return reply.code(404).type("text/html").send(renderMissing());
    }
    return reply.code(404).send({ error: "not_found" });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

function renderMissing(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Not found</title></head><body><h1>Not found</h1><p><a href="/">Voice verticals</a></p></body></html>`;
}
