import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { seedIfEmpty } from "../../src/seed.js";
import { maskDob, maskPhone, scrubText } from "../../src/verticals/clinic/privacy.js";
import { CLINIC_SCENARIOS } from "../../src/verticals/clinic/scenarios.js";
import { clinicScenarioPassed, runClinicScenario } from "../../src/verticals/clinic/eval.js";
import { triageSymptoms } from "../../src/verticals/clinic/triage.js";
import { syncAssistant } from "../../src/vapi/sync.js";
import { memoryDb, NOW, testConfig } from "../helpers.js";

describe("clinic triage and privacy", () => {
  it("routes red flags and masks identifiers", () => {
    expect(triageSymptoms("crushing chest pain").channel).toBe("911");
    expect(triageSymptoms("I want to die").channel).toBe("988");
    expect(triageSymptoms("I want to die").callerScript).toMatch(/988/);
    expect(triageSymptoms("fever and ear pain").level).toBe("urgent");
    expect(maskPhone("608-555-0141")).toBe("(608) ***-0141");
    expect(maskDob("1984-03-14")).toBe("**/**/1984");
    expect(scrubText("dob 1984-03-14 phone 608-555-0141")).not.toContain("1984-03-14");
    expect(scrubText("dob 1984-03-14 phone 608-555-0141")).toContain("(608) ***-0141");
  });

  it("does not ask a suicidal caller to describe a plan", () => {
    expect(triageSymptoms("I want to die").callerScript).toMatch(/will not ask/);
  });
});

describe("clinic conversation evals", () => {
  it("runs every clinic scenario", async () => {
    expect(CLINIC_SCENARIOS.length).toBeGreaterThanOrEqual(15);
    const failures: string[] = [];
    for (const scenario of CLINIC_SCENARIOS) {
      const result = await runClinicScenario(scenario);
      if (!clinicScenarioPassed(scenario, result)) {
        failures.push(`${scenario.id} outcome=${result.outcome} tools=${result.toolNames.join(",")} visits=${result.openVisits} sms=${result.smsKinds.join(",")}`);
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("clinic pages", () => {
  it("serves the clinic on its host and masks the chart", async () => {
    const db = memoryDb();
    seedIfEmpty(db, NOW);
    const app = await buildApp({
      config: testConfig({ vapiPublicKey: "pk_test", vapiClinicAssistantId: "asst_clinic", webCallOrigins: ["https://clinic.quvantic.com"] }),
      db,
      now: () => NOW,
    });
    const home = await app.inject({ method: "GET", url: "/", headers: { host: "clinic.quvantic.com" } });
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain("Lindenmere Primary Care");
    expect(home.body).toContain("no real PHI");
    const board = await app.inject({ method: "GET", url: "/board", headers: { host: "clinic.quvantic.com" } });
    expect(board.body).toContain("Dr. Amira Solano");
    expect(board.body).toContain("Maya Chen");
    const patients = await app.inject({ method: "GET", url: "/v/clinic/patients" });
    expect(patients.body).toContain("**/**/1984");
    expect(patients.body).not.toContain("1984-03-14");
    expect(patients.body).toContain("••••0441");
    const detail = await app.inject({ method: "GET", url: "/v/clinic/calls/call_clinic_maya" });
    expect(detail.body).not.toContain("1984-03-14");
    expect(detail.body).toContain("(608) ***-0141");
    const audit = await app.inject({ method: "GET", url: "/v/clinic/audit" });
    expect(audit.body).toContain("verify_identity");
    const token = await app.inject({
      method: "POST",
      url: "/api/call-token",
      headers: { host: "clinic.quvantic.com", origin: "https://clinic.quvantic.com" },
    });
    expect(token.statusCode).toBe(200);
    expect(token.json().assistantId).toBe("asst_clinic");
    const landing = await app.inject({ method: "GET", url: "/platform" });
    expect(landing.body).toContain("Open the clinic demo");
    expect(landing.body).toContain("Open the HVAC demo");
    await app.close();
  });
});

describe("clinic assistant sync", () => {
  it("builds a Groq Clara assistant aimed at the clinic tool URLs", async () => {
    const dry = await syncAssistant({
      vertical: "clinic",
      publicBaseUrl: "https://clinic.quvantic.com",
      serverUrlSecret: "test-webhook-secret",
    });
    expect(dry.payload.name).toContain("Lindenmere");
    expect(dry.payload.voice.voiceId).toBe("Clara");
    expect(dry.payload.model.model).toBe("openai/gpt-oss-120b");
    expect(dry.payload.model.tools.some((tool) => tool.function.name === "verify_identity")).toBe(true);
    expect(dry.payload.server.url).toBe("https://clinic.quvantic.com/v/clinic/vapi/webhook");
  });
});
