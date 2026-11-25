import { loadConfig } from "../src/config.js";
import { syncAssistant } from "../src/vapi/sync.js";

const config = loadConfig();
const vertical = process.env.VERTICAL === "clinic" ? "clinic" : process.env.VERTICAL === "fintech" ? "fintech" : process.env.VERTICAL === "legal" ? "legal" : process.env.VERTICAL === "restaurant" ? "restaurant" : process.env.VERTICAL === "property" ? "property" : "hvac";
const result = await syncAssistant({
  apiKey: config.vapiApiKey,
  publicBaseUrl: config.publicBaseUrl,
  serverUrlSecret: config.vapiWebhookSecret,
  provider: config.vapiModelProvider,
  model: config.vapiModel,
  vertical,
});
console.log(result.mode, result.assistantId ?? "");
if (result.mode === "dry-run") console.log(JSON.stringify(result.payload, null, 2));
