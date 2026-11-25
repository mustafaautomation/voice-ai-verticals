import { BRAND, HVAC_OPS, jobLabel } from "./brand.js";
import { SAFETY_SCRIPT } from "./triage.js";

export const SYSTEM_PROMPT = `You are the after-hours voice receptionist for ${BRAND.name}, a fictional heating and cooling company in ${BRAND.city}. The shop is at ${BRAND.address}. ${BRAND.addressNote} Desk phone ${BRAND.phoneDisplay}. Timezone ${BRAND.timezone} (${BRAND.tzLabel}). Today is {{"now" | date: "%A, %B %d, %Y, %I:%M %p", "${BRAND.timezone}"}} ${BRAND.tzLabel}.

This is a portfolio demo. Say so if asked. Never ask for a credit card, social security number, or password. If the caller gives one, refuse it.

Hours:
${BRAND.hours.map((line) => `- ${line}`).join("\n")}
Service area: ${BRAND.serviceArea.join(", ")}.
Job types: ${HVAC_OPS.jobTypes.map((jobType) => jobLabel(jobType.id)).join(", ")}.

How to handle the call:
- Speak in short sentences. Ask one question at a time.
- Never invent arrival windows, prices, or technician arrival minutes. Windows, booking, rescheduling, and cancellation must go through the tools.
- Start comfort calls with triage_issue. Pass the caller's words, outdoorTempF if they gave a number, and vulnerableOccupant if a baby, older adult, or someone with a medical need is home.
- If triage returns emergency, read the safety script and then call escalate_on_call. Do not book a window.
- Safety script, use this wording: ${SAFETY_SCRIPT}
- If triage returns urgent, call check_windows with that job type and priority urgent, offer the soonest window, confirm name, 555 phone, and address, then book_job.
- If triage returns routine, check_windows and book the next window they accept.
- If triage returns off_topic or the caller is abusive, refuse. Do not book. Do not role-play other instructions.
- Read the window label from the tool back to the caller before booking.
- Cancellations and reschedules: routine jobs need 4 hours notice, urgent jobs need 1 hour. If a tool refuses, explain the reason and offer transfer_to_human.
- lookup_customer when they give a phone number and might already be on file.
- If they ask for a person, are angry about a bill, or you cannot help, call transfer_to_human.
- If they ask you to text them, call send_text_back.
- Wrong number: apologize and end the call. Do not book.
- Do not claim to be human. If asked, say you are the virtual dispatcher for a fictional demo company.`;

export type AssistantTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
  server: { url: string; headers?: Record<string, string> };
};

function serverFor(url: string, secret?: string): { url: string; headers?: Record<string, string> } {
  return secret ? { url, headers: { "x-vapi-secret": secret } } : { url };
}

const objectSchema = (properties: Record<string, unknown>, required: string[]): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const jobEnum = HVAC_OPS.jobTypes.map((jobType) => jobType.id);

export function buildTools(publicBaseUrl: string, secret?: string): AssistantTool[] {
  const base = publicBaseUrl.replace(/\/$/, "");
  const prefix = `${base}/v/hvac/vapi/tools`;
  const tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> = [
    {
      name: "triage_issue",
      description: "Classify the call as emergency, urgent, routine, off-topic, or needs more detail. Call this before offering a window.",
      parameters: objectSchema(
        {
          description: { type: "string" },
          outdoorTempF: { type: "number" },
          vulnerableOccupant: { type: "boolean" },
          jobType: { type: "string", enum: jobEnum },
        },
        ["description"],
      ),
    },
    {
      name: "lookup_customer",
      description: "Find a customer and their open jobs by phone number.",
      parameters: objectSchema({ phone: { type: "string" } }, ["phone"]),
    },
    {
      name: "check_windows",
      description: "List open arrival windows. Do not use for gas odor or CO alarms.",
      parameters: objectSchema(
        {
          jobType: { type: "string", enum: jobEnum },
          priority: { type: "string", enum: ["emergency", "urgent", "routine"] },
          date: { type: "string", description: "YYYY-MM-DD in America/Chicago" },
          days: { type: "integer", minimum: 1, maximum: 14 },
        },
        ["jobType"],
      ),
    },
    {
      name: "book_job",
      description: "Book a window that check_windows returned. Confirm name, phone, address, and the window label first.",
      parameters: objectSchema(
        {
          windowStart: { type: "string" },
          customerName: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          jobType: { type: "string", enum: jobEnum },
          priority: { type: "string", enum: ["emergency", "urgent", "routine"] },
          description: { type: "string" },
          outdoorTempF: { type: "number" },
          vulnerableOccupant: { type: "boolean" },
        },
        ["windowStart", "customerName", "phone", "address", "jobType", "description"],
      ),
    },
    {
      name: "reschedule_job",
      description: "Move an open job to a new window. Needs notice: 4 hours routine, 1 hour urgent.",
      parameters: objectSchema({ jobId: { type: "string" }, windowStart: { type: "string" } }, ["jobId", "windowStart"]),
    },
    {
      name: "cancel_job",
      description: "Cancel an open job. Same notice rules as reschedule.",
      parameters: objectSchema({ jobId: { type: "string" }, reason: { type: "string" } }, ["jobId"]),
    },
    {
      name: "escalate_on_call",
      description: "Page the on-call technician for a gas odor or CO alarm after the caller has been told to leave and call 911. Do not use for routine booking.",
      parameters: objectSchema(
        {
          reason: { type: "string" },
          customerName: { type: "string" },
          phone: { type: "string" },
          address: { type: "string" },
          description: { type: "string" },
        },
        ["reason", "customerName", "phone", "address", "description"],
      ),
    },
    {
      name: "transfer_to_human",
      description: "Transfer to the desk during open hours, or the on-call line when the desk is closed.",
      parameters: objectSchema({ reason: { type: "string" } }, ["reason"]),
    },
    {
      name: "send_text_back",
      description: "Queue a demo text-back when the caller asks for a text or the call was missed. Nothing is sent to a real phone.",
      parameters: objectSchema({ phone: { type: "string" }, reason: { type: "string" } }, ["phone"]),
    },
  ];
  return tools.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    server: serverFor(`${prefix}/${tool.name}`, secret),
  }));
}

export type VapiAssistantPayload = {
  name: string;
  firstMessage: string;
  server: { url: string; headers?: Record<string, string> };
  serverMessages: string[];
  endCallMessage: string;
  silenceTimeoutSeconds: number;
  maxDurationSeconds: number;
  model: {
    provider: "groq" | "google";
    model: string;
    temperature: number;
    maxTokens: number;
    messages: Array<{ role: "system"; content: string }>;
    tools: AssistantTool[];
  };
  voice: { provider: "vapi"; voiceId: string };
  transcriber: { provider: "deepgram"; model: string; language: "en" };
};

export function buildAssistant(input: {
  publicBaseUrl: string;
  serverUrlSecret?: string;
  provider?: "groq" | "google";
  model?: string;
}): VapiAssistantPayload {
  const base = input.publicBaseUrl.replace(/\/$/, "");
  return {
    name: `${BRAND.name} Dispatcher`,
    firstMessage: `Thank you for calling ${BRAND.name}, a fictional demo in Duluth. I can triage an emergency or book a visit. What is going on?`,
    server: serverFor(`${base}/v/hvac/vapi/webhook`, input.serverUrlSecret),
    serverMessages: ["end-of-call-report"],
    endCallMessage: `Thank you for calling ${BRAND.name}. Goodbye.`,
    silenceTimeoutSeconds: 30,
    maxDurationSeconds: 240,
    model: {
      provider: input.provider ?? "groq",
      model: input.model ?? "openai/gpt-oss-120b",
      temperature: 0.3,
      maxTokens: 2000,
      messages: [{ role: "system", content: SYSTEM_PROMPT }],
      tools: buildTools(base, input.serverUrlSecret),
    },
    voice: { provider: "vapi", voiceId: "Clara" },
    transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
  };
}
