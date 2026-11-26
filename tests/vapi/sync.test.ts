import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { syncAssistant } from "../../src/vapi/sync.js";
import { MemoryCallQuota } from "../../src/webcall/quota.js";
import { visitorBucket } from "../../src/webcall/routes.js";
import { memoryDb, NOW, testConfig } from "../helpers.js";

describe("assistant sync", () => {
  it("dry-runs without a key and updates an existing assistant", async () => {
    const dry = await syncAssistant({ publicBaseUrl: "http://127.0.0.1:4317", serverUrlSecret: "test-webhook-secret" });
    expect(dry.mode).toBe("dry-run");
    expect(dry.payload.model.provider).toBe("groq");
    expect(dry.payload.model.tools.map((tool) => tool.function.name)).toContain("escalate_on_call");
    expect(dry.payload.endCallMessage).toBe("Thank you for calling Fennwick Comfort Co. Goodbye.");
    const fetchImpl = async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return new Response("{}", { status: 200 });
      return new Response(JSON.stringify([{ id: "asst_1", name: dry.payload.name }]), { status: 200 });
    };
    const updated = await syncAssistant({
      apiKey: "test-key",
      publicBaseUrl: "http://127.0.0.1:4317",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(updated.mode).toBe("updated");
    expect(updated.assistantId).toBe("asst_1");
  });
});

describe("browser call token", () => {
  it("returns 503 until an assistant is configured, then enforces the visitor cap", async () => {
    const disabled = await buildApp({ config: testConfig(), db: memoryDb(), now: () => NOW });
    const closed = await disabled.inject({ method: "POST", url: "/v/hvac/api/call-token" });
    expect(closed.statusCode).toBe(503);
    await disabled.close();

    const app = await buildApp({
      config: testConfig({ vapiPublicKey: "pk_test", vapiAssistantId: "asst_hvac" }),
      db: memoryDb(),
      now: () => NOW,
    });
    const blocked = await app.inject({
      method: "POST",
      url: "/v/hvac/api/call-token",
      headers: { origin: "https://evil.example" },
    });
    expect(blocked.statusCode).toBe(403);
    const ok = await app.inject({ method: "POST", url: "/v/hvac/api/call-token", headers: { origin: "http://127.0.0.1:4317" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().mode).toBe("public-key");
    expect(ok.json().token).toBe("pk_test");
    await app.close();
  });

  it("counts visitors and buckets IPv6", async () => {
    const quota = new MemoryCallQuota({ perVisitor: 1, perDay: 2 });
    const first = await quota.acquire({ visitorKey: "a", now: NOW });
    const second = await quota.acquire({ visitorKey: "a", now: NOW });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(visitorBucket("::ffff:10.0.0.8")).toBe("10.0.0.8");
    expect(visitorBucket("2001:db8:1:2::55")).toContain("::/64");
  });
});
