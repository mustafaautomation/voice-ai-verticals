import { loadConfig } from "../src/config.js";
import { syncAssistant } from "../src/vapi/sync.js";

const config = loadConfig();
const result = await syncAssistant({
  apiKey: config.vapiApiKey,
  publicBaseUrl: config.publicBaseUrl,
  serverUrlSecret: config.vapiWebhookSecret,
  provider: config.vapiModelProvider,
  model: config.vapiModel,
});
console.log(result.mode, result.assistantId ?? "");
if (result.mode === "dry-run") console.log(JSON.stringify(result.payload, null, 2));
