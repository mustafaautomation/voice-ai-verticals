import type { AppConfig } from "../src/config.js";
import { openDatabase, type SqliteDatabase } from "../src/db/database.js";

export const SECRET = "test-webhook-secret";
export const NOW = new Date("2026-12-02T15:00:00.000Z");

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    host: "127.0.0.1",
    nodeEnv: "test",
    logLevel: "silent",
    databasePath: ":memory:",
    seedOnBoot: false,
    serveStatic: false,
    vapiWebhookSecret: SECRET,
    vapiApiKey: "",
    vapiOrgId: "",
    vapiPublicKey: "",
    vapiAssistantId: "",
    vapiModelProvider: "groq",
    vapiModel: "openai/gpt-oss-120b",
    publicBaseUrl: "http://127.0.0.1:4317",
    webCallOrigins: ["http://127.0.0.1:4317"],
    webCallLimitPerVisitor: 3,
    webCallLimitPerDay: 40,
    webCallTokenTtlSeconds: 30,
    trustProxyHeaders: false,
    verticalHosts: { "hvac.quvantic.com": "hvac", "hvac.localhost": "hvac" },
    smsProvider: "mock",
    smsWebhookUrl: "",
    smsWebhookToken: "",
    smsFromNumber: "+12185550148",
    transferNumber: "+12185550148",
    onCallNumber: "+12185550190",
    groqApiKey: "",
    groqModel: "llama-3.3-70b-versatile",
    geminiApiKey: "",
    ...overrides,
  };
}

export function memoryDb(): SqliteDatabase {
  return openDatabase(":memory:");
}
