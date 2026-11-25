import { HVAC_SCENARIOS } from "../verticals/hvac/scenarios.js";
import { runHvacScenario, scenarioPassed } from "../verticals/hvac/eval.js";

const results = [];
for (const scenario of HVAC_SCENARIOS) {
  const result = await runHvacScenario(scenario);
  const passed = scenarioPassed(scenario, result);
  results.push({ id: scenario.id, passed, outcome: result.outcome, tools: result.toolNames.join(","), openJobs: result.openJobs, sms: result.smsKinds.join(",") });
  console.log(`${passed ? "ok" : "FAIL"}  ${scenario.id}  outcome=${result.outcome} tools=${result.toolNames.join(",")}`);
}
const failed = results.filter((result) => !result.passed);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
console.log(`${results.length} HVAC scenarios passed`);
