import { buildAssistant, type VapiAssistantPayload } from "../verticals/hvac/assistant.js";
import { buildClinicAssistant } from "../verticals/clinic/assistant.js";

type FetchImpl = typeof fetch;

export type SyncResult = {
  mode: "dry-run" | "created" | "updated";
  assistantId?: string;
  payload: VapiAssistantPayload;
};

type RemoteAssistant = { id?: string; name?: string };

export async function syncAssistant(input: {
  apiKey?: string;
  publicBaseUrl: string;
  serverUrlSecret?: string;
  provider?: "groq" | "google";
  model?: string;
  vertical?: "hvac" | "clinic";
  fetchImpl?: FetchImpl;
}): Promise<SyncResult> {
  const built = {
    publicBaseUrl: input.publicBaseUrl,
    serverUrlSecret: input.serverUrlSecret,
    provider: input.provider,
    model: input.model,
  };
  const payload = input.vertical === "clinic" ? buildClinicAssistant(built) : buildAssistant(built);
  if (!input.apiKey) return { mode: "dry-run", payload };
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers = { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" };
  const listResponse = await fetchImpl("https://api.vapi.ai/assistant", { headers });
  if (!listResponse.ok) throw new Error(`Vapi list assistants failed (${listResponse.status})`);
  const listed = (await listResponse.json()) as RemoteAssistant[] | { assistants?: RemoteAssistant[] };
  const assistants = Array.isArray(listed) ? listed : (listed.assistants ?? []);
  const existing = assistants.find((assistant) => assistant.name === payload.name && assistant.id);
  if (existing?.id) {
    const updateResponse = await fetchImpl(`https://api.vapi.ai/assistant/${existing.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload),
    });
    if (!updateResponse.ok) throw new Error(`Vapi update assistant failed (${updateResponse.status})`);
    return { mode: "updated", assistantId: existing.id, payload };
  }
  const createResponse = await fetchImpl("https://api.vapi.ai/assistant", { method: "POST", headers, body: JSON.stringify(payload) });
  if (!createResponse.ok) throw new Error(`Vapi create assistant failed (${createResponse.status})`);
  const created = (await createResponse.json()) as RemoteAssistant;
  return { mode: "created", assistantId: created.id, payload };
}
