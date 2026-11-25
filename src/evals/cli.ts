import { CLINIC_SCENARIOS } from "../verticals/clinic/scenarios.js";
import { clinicScenarioPassed, runClinicScenario } from "../verticals/clinic/eval.js";
import { HVAC_SCENARIOS } from "../verticals/hvac/scenarios.js";
import { runHvacScenario, scenarioPassed } from "../verticals/hvac/eval.js";

const results = [];
for (const scenario of HVAC_SCENARIOS) {
  const result = await runHvacScenario(scenario);
  const passed = scenarioPassed(scenario, result);
  results.push({ id: `hvac:${scenario.id}`, passed });
  console.log(`${passed ? "ok" : "FAIL"}  hvac:${scenario.id}  outcome=${result.outcome}`);
}
for (const scenario of CLINIC_SCENARIOS) {
  const result = await runClinicScenario(scenario);
  const passed = clinicScenarioPassed(scenario, result);
  results.push({ id: `clinic:${scenario.id}`, passed, outcome: result.outcome, tools: result.toolNames.join(",") });
  console.log(`${passed ? "ok" : "FAIL"}  clinic:${scenario.id}  outcome=${result.outcome} tools=${result.toolNames.join(",")}`);
}
const failed = results.filter((result) => !result.passed);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
console.log(`${results.length} scenarios passed`);
