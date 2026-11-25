import { describe, expect, it } from "vitest";
import { HVAC_OPS } from "../../src/verticals/hvac/brand.js";
import { isDeskOpen, listOffers, resolveWindow } from "../../src/platform/schedule.js";
import { rewriteForVertical, verticalForHost } from "../../src/platform/host.js";
import { phoneDigits, formatPhone } from "../../src/platform/phone.js";

const now = new Date("2026-12-02T15:00:00.000Z");

describe("arrival windows", () => {
  it("offers the afternoon window on a Wednesday morning and skips the past", () => {
    const listed = listOffers(HVAC_OPS, now, new Set(), { jobTypeId: "tune_up", priority: "routine", days: 1 });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.windows[0]?.start).toBe("2026-12-02T18:00:00Z");
  });

  it("refuses a gas-odor window", () => {
    const listed = listOffers(HVAC_OPS, now, new Set(), { jobTypeId: "gas_odor", priority: "routine" });
    expect(listed.ok).toBe(false);
  });

  it("reports a full window", () => {
    const taken = new Set(["tech_samira|2026-12-02T18:00:00Z"]);
    const resolved = resolveWindow(HVAC_OPS, now, taken, {
      jobTypeId: "quote",
      priority: "routine",
      startIso: "2026-12-02T18:00:00Z",
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.code).toBe("slot_taken");
  });

  it("knows the desk is open at 9am Wednesday and closed Saturday evening", () => {
    expect(isDeskOpen(HVAC_OPS, now)).toBe(true);
    expect(isDeskOpen(HVAC_OPS, new Date("2026-12-05T23:00:00.000Z"))).toBe(false);
  });
});

describe("host routing", () => {
  it("prefixes HVAC host paths and leaves the platform path alone", () => {
    expect(verticalForHost("hvac.quvantic.com", { "hvac.quvantic.com": "hvac" })).toBe("hvac");
    expect(rewriteForVertical("hvac", "/board?q=maya")).toBe("/v/hvac/board?q=maya");
    expect(rewriteForVertical("hvac", "/platform")).toBe("/platform");
    expect(rewriteForVertical("hvac", "/assets/styles.css")).toBe("/assets/styles.css");
    expect(rewriteForVertical(null, "/")).toBe("/");
  });
});

describe("phones", () => {
  it("normalizes 555 numbers", () => {
    expect(phoneDigits("(218) 555-0101")).toBe("2185550101");
    expect(formatPhone("+12185550101")).toBe("(218) 555-0101");
  });
});
