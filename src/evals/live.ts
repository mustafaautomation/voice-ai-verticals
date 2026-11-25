import { loadConfig } from "../config.js";
import { executeHvacTool, type HvacToolContext } from "../verticals/hvac/runtime.js";
import { SYSTEM_PROMPT } from "../verticals/hvac/assistant.js";
import { openDatabase } from "../db/database.js";
import { MockSmsProvider } from "../sms/provider.js";
import { SmsStore } from "../store/sms.js";
import { BRAND } from "../verticals/hvac/brand.js";
import { isHvacTool } from "../verticals/hvac/schemas.js";

/**
 * Optional live pass. Sends one HVAC prompt to Groq's free OpenAI-compatible API
 * and runs any tool calls against the in-memory job board. Not used in CI.
 */
const config = loadConfig();
if (!config.groqApiKey) {
  console.error("GROQ_API_KEY is not set. Live evals are optional and are not part of CI.");
  process.exit(1);
}

const db = openDatabase(":memory:");
const ctx: HvacToolContext = {
  db,
  sms: new MockSmsProvider(new SmsStore(db), BRAND.phoneE164),
  fromNumber: BRAND.phoneE164,
  onCallNumber: BRAND.onCallE164,
  transferNumber: BRAND.phoneE164,
  now: new Date(),
  callRowId: null,
};
const messages: Array<Record<string, unknown>> = [
  { role: "system", content: SYSTEM_PROMPT },
  { role: "user", content: "I smell gas in the basement, like rotten eggs. I am Lila Nguyen, 218-555-0160, 2 Fog Bell Lane, Duluth." },
];

for (let step = 0; step < 6; step += 1) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${config.groqApiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: config.groqModel,
      temperature: 0.2,
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "triage_issue",
            parameters: { type: "object", properties: { description: { type: "string" } }, required: ["description"] },
          },
        },
        {
          type: "function",
          function: {
            name: "escalate_on_call",
            parameters: {
              type: "object",
              properties: {
                reason: { type: "string" },
                customerName: { type: "string" },
                phone: { type: "string" },
                address: { type: "string" },
                description: { type: "string" },
              },
              required: ["reason", "customerName", "phone", "address", "description"],
            },
          },
        },
      ],
    }),
  });
  if (!response.ok) {
    console.error(`Groq request failed (${response.status})`);
    process.exit(1);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
  };
  const message = body.choices?.[0]?.message;
  if (!message) break;
  messages.push(message);
  const calls = message.tool_calls ?? [];
  if (calls.length === 0) {
    console.log(message.content || "(no content)");
    break;
  }
  for (const call of calls) {
    if (!isHvacTool(call.function.name)) continue;
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    const result = await executeHvacTool(call.function.name, args, ctx);
    console.log(call.function.name, JSON.stringify(result));
    messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
}
