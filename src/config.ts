import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4317),
  HOST: z.string().min(1).default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_PATH: z.string().min(1).default("./data/verticals.sqlite"),
  SEED_ON_BOOT: z.enum(["true", "false"]).default("true"),
  SERVE_STATIC: z.enum(["true", "false"]).default("true"),
  VAPI_WEBHOOK_SECRET: z.string().min(8),
  VAPI_API_KEY: z.string().optional().default(""),
  VAPI_ORG_ID: z.string().optional().default(""),
  VAPI_PUBLIC_KEY: z.string().optional().default(""),
  VAPI_ASSISTANT_ID: z.string().optional().default(""),
  VAPI_CLINIC_ASSISTANT_ID: z.string().optional().default(""),
  VAPI_MODEL_PROVIDER: z.enum(["groq", "google"]).default("groq"),
  VAPI_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:4317"),
  WEB_CALL_ORIGINS: z.string().optional().default(""),
  WEB_CALL_LIMIT_PER_VISITOR: z.coerce.number().int().min(1).max(100).default(3),
  WEB_CALL_LIMIT_PER_DAY: z.coerce.number().int().min(1).max(10000).default(40),
  WEB_CALL_TOKEN_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(30),
  TRUST_PROXY_HEADERS: z.enum(["true", "false"]).default("false"),
  VERTICAL_HOSTS: z.string().optional().default("hvac.quvantic.com=hvac,hvac.localhost=hvac,clinic.quvantic.com=clinic,clinic.localhost=clinic"),
  SMS_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  SMS_WEBHOOK_URL: z.string().url().optional().or(z.literal("")).default(""),
  SMS_WEBHOOK_TOKEN: z.string().optional().default(""),
  SMS_FROM_NUMBER: z.string().min(8).default("+12185550148"),
  TRANSFER_NUMBER: z.string().min(8).default("+12185550148"),
  ON_CALL_NUMBER: z.string().min(8).default("+12185550190"),
  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GEMINI_API_KEY: z.string().optional().default(""),
});

export type AppConfig = {
  port: number;
  host: string;
  nodeEnv: "development" | "test" | "production";
  logLevel: string;
  databasePath: string;
  seedOnBoot: boolean;
  serveStatic: boolean;
  vapiWebhookSecret: string;
  vapiApiKey: string;
  vapiOrgId: string;
  vapiPublicKey: string;
  vapiAssistantId: string;
  vapiClinicAssistantId: string;
  vapiModelProvider: "groq" | "google";
  vapiModel: string;
  publicBaseUrl: string;
  webCallOrigins: string[];
  webCallLimitPerVisitor: number;
  webCallLimitPerDay: number;
  webCallTokenTtlSeconds: number;
  trustProxyHeaders: boolean;
  verticalHosts: Record<string, string>;
  smsProvider: "mock" | "http";
  smsWebhookUrl: string;
  smsWebhookToken: string;
  smsFromNumber: string;
  transferNumber: string;
  onCallNumber: string;
  groqApiKey: string;
  groqModel: string;
  geminiApiKey: string;
};

export function loadEnvFile(): void {
  if (existsSync(".env")) loadDotenv();
}

export function parseVerticalHosts(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [host, id] = part.split("=").map((piece) => piece.trim().toLowerCase());
    if (!host || !id) continue;
    map[host] = id;
  }
  return map;
}

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  const value = parsed.data;
  if (value.SMS_PROVIDER === "http" && !value.SMS_WEBHOOK_URL) {
    throw new Error("SMS_WEBHOOK_URL is required when SMS_PROVIDER=http");
  }
  const publicBaseUrl = value.PUBLIC_BASE_URL.replace(/\/$/, "");
  const originSource = value.WEB_CALL_ORIGINS || [publicBaseUrl, "https://hvac.quvantic.com", "https://clinic.quvantic.com", "https://verticals.quvantic.com"].join(",");
  return {
    port: value.PORT,
    host: value.HOST,
    nodeEnv: value.NODE_ENV,
    logLevel: value.LOG_LEVEL,
    databasePath: value.DATABASE_PATH,
    seedOnBoot: value.SEED_ON_BOOT === "true",
    serveStatic: value.SERVE_STATIC === "true",
    vapiWebhookSecret: value.VAPI_WEBHOOK_SECRET,
    vapiApiKey: value.VAPI_API_KEY,
    vapiOrgId: value.VAPI_ORG_ID,
    vapiPublicKey: value.VAPI_PUBLIC_KEY,
    vapiAssistantId: value.VAPI_ASSISTANT_ID,
    vapiClinicAssistantId: value.VAPI_CLINIC_ASSISTANT_ID,
    vapiModelProvider: value.VAPI_MODEL_PROVIDER,
    vapiModel: value.VAPI_MODEL,
    publicBaseUrl,
    webCallOrigins: originSource
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
    webCallLimitPerVisitor: value.WEB_CALL_LIMIT_PER_VISITOR,
    webCallLimitPerDay: value.WEB_CALL_LIMIT_PER_DAY,
    webCallTokenTtlSeconds: value.WEB_CALL_TOKEN_TTL_SECONDS,
    trustProxyHeaders: value.TRUST_PROXY_HEADERS === "true",
    verticalHosts: parseVerticalHosts(value.VERTICAL_HOSTS),
    smsProvider: value.SMS_PROVIDER,
    smsWebhookUrl: value.SMS_WEBHOOK_URL,
    smsWebhookToken: value.SMS_WEBHOOK_TOKEN,
    smsFromNumber: value.SMS_FROM_NUMBER,
    transferNumber: value.TRANSFER_NUMBER,
    onCallNumber: value.ON_CALL_NUMBER,
    groqApiKey: value.GROQ_API_KEY,
    groqModel: value.GROQ_MODEL,
    geminiApiKey: value.GEMINI_API_KEY,
  };
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  return parseConfig(process.env);
}
