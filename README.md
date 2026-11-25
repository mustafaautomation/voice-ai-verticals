# voice-ai-verticals

Portfolio demo of a multi-vertical voice AI platform. The shared core is here. The first vertical is **Fennwick Comfort Co.**, a fictional heating and cooling company in Duluth, Minnesota. Later verticals (medical clinic, fintech support, legal intake, restaurant, property management) are listed on the landing page and are not built yet.

Nothing in this repo is a real business, technician, address, or phone number. Harbor Glass Avenue is not a real street. Every phone number uses `555`. A gas smell or CO alarm in real life means leave the building and call 911.

Author: Muhammad Mustafa ([mustafaautomation](https://github.com/mustafaautomation)).

This follows the same shape as the Brightside Dental receptionist at [voice.quvantic.com](https://voice.quvantic.com): Fastify, config-as-code Vapi assistant, tool endpoints, scripted conversation evals in CI, and a Playwright-tested dashboard. Voice runs on free Vapi credits. Any direct LLM call uses Groq (or Gemini). There is no paid SMS provider and no paid phone number.

## Live links

Portfolio demo. Fennwick Comfort Co. is a fictional brand. Live on the Vercel project `voice-ai-verticals`:

- Platform landing: **https://verticals.quvantic.com**
- HVAC demo (Fennwick Comfort Co.): **https://hvac.quvantic.com**
- Dispatch board: **https://hvac.quvantic.com/board**

Production browser calls use restricted Vapi public-key mode: the page receives `VAPI_PUBLIC_KEY` only after the per-visitor limit check, and that key is limited to these origins and this assistant. The assistant runs on Vapi's built-in Groq model `openai/gpt-oss-120b` with the Clara voice. No extra Groq credential is required for the call.

## Demo

Portfolio demo. Fictional data.

![Platform landing](docs/screenshots/platform-landing.png)

![Fennwick home](docs/screenshots/hvac-home.png)

![Job board](docs/screenshots/job-board.png)

![Call detail](docs/screenshots/call-detail.png)

![Demo texts](docs/screenshots/messages.png)

![Walkthrough](docs/demo.gif)

A WebM of the same walkthrough is at [docs/demo.webm](docs/demo.webm). With the app on port 4317, `npx tsx scripts/record-demo.ts` prints a new webm path. Convert it with ffmpeg if you want a replacement GIF.

### Lindenmere Primary Care

Portfolio demo. Fictional clinic. No real PHI. Intended host: **https://clinic.quvantic.com** (same app, `Host` header selects the clinic pages). Local path: http://127.0.0.1:4317/v/clinic.

The front desk verifies name and date of birth before it discusses a visit. Chest pain, stroke signs, severe breathing trouble, and anaphylaxis are told to call 911 and are not booked. Suicidal ideation is told to call or text 988, and the agent does not ask for a plan. Urgent symptoms book a sick visit or warm-transfer to the nurse line. Routine visits book. Refills go to a nurse queue with no dosing advice. The board masks dates of birth, phone numbers, and member ids, and every chart tool writes an audit line.

![Clinic home](docs/screenshots/clinic-home.png)

![Clinic schedule](docs/screenshots/clinic-board.png)

![Masked call](docs/screenshots/clinic-call.png)

![Patients](docs/screenshots/clinic-patients.png)

![Clinic walkthrough](docs/clinic-demo.gif)

Sync that assistant separately:

```bash
VERTICAL=clinic PUBLIC_BASE_URL=https://clinic.quvantic.com npm run vapi:sync
```

Tool URLs are `https://clinic.quvantic.com/v/clinic/vapi/...`. Put the new assistant id in `VAPI_CLINIC_ASSISTANT_ID`. Model `openai/gpt-oss-120b`, voice Clara, same as HVAC. Add `clinic.quvantic.com` on the Vercel project `voice-ai-verticals`; the default `VERTICAL_HOSTS` already maps it.

### Wrenline card support

Portfolio demo. Fictional neobank. Not a bank, not a creditor, and not FDIC insured. Intended host: **https://fintech.quvantic.com**. Local path: http://127.0.0.1:4317/v/fintech.

The agent checks name, last four, and date of birth or a demo app code before it reads a balance. Full card numbers, CVVs, PINs, and passwords are refused and redacted. A spouse or anyone else does not get the account. Past-due talks start with a mini-Miranda. Cease-contact stops debt discussion. Hardship and promise-to-pay do not charge a card. The Cases tab can start a simulated outbound reminder, which is still a browser call and includes the disclosure.

![Wrenline home](docs/screenshots/fintech-home.png)

![Cases](docs/screenshots/fintech-board.png)

![Accounts](docs/screenshots/fintech-accounts.png)

![Reminder call](docs/screenshots/fintech-call.png)

![Wrenline walkthrough](docs/fintech-demo.gif)

```bash
VERTICAL=fintech PUBLIC_BASE_URL=https://fintech.quvantic.com npm run vapi:sync
```

Tool URLs are `https://fintech.quvantic.com/v/fintech/vapi/...`. Put the assistant id in `VAPI_FINTECH_ASSISTANT_ID`. Model `openai/gpt-oss-120b`, voice Clara. `VERTICAL_HOSTS` already maps `fintech.quvantic.com`.

## Architecture

```mermaid
flowchart LR
  subgraph pages [Web]
    Landing[verticals.quvantic.com]
    Hvac[hvac.quvantic.com]
    Board[Jobs, calls, texts]
  end
  subgraph voice [Voice]
    Browser[Browser mic]
    Vapi[Vapi free credits]
  end
  subgraph core [Platform core]
    Tools[Tool router]
    Quota[Call quota]
    Sms[SmsProvider]
  end
  subgraph hvacvert [HVAC vertical]
    Triage[Triage rules]
    Jobs[Arrival windows and techs]
    Prompt[Assistant prompt]
  end
  Landing --> Hvac
  Browser --> Quota --> Vapi
  Vapi --> Tools
  Tools --> Triage --> Jobs
  Jobs --> Sms
  Sms --> Board
  Prompt --> Vapi
```

```mermaid
sequenceDiagram
  participant Caller
  participant Page
  participant Vapi
  participant API as This API
  participant Board as Job board
  participant Inbox as Mock SMS

  Caller->>Page: Talk to dispatch
  Page->>API: POST /v/hvac/api/call-token
  API-->>Page: Short-lived token after the limit check
  Page->>Vapi: Browser call
  Vapi->>Caller: Greeting
  Caller->>Vapi: Gas smell, no heat, or a tune-up
  Vapi->>API: triage_issue, then book or escalate
  API->>Board: Job row
  API->>Inbox: Dispatch, safety, or text-back
  API-->>Vapi: Spoken result
  Vapi->>API: end-of-call-report
  Note over API,Inbox: Missed calls queue a text-back
```

`hvac.quvantic.com` is the same app. A host map rewrites `/` to `/v/hvac` so the HVAC site has clean paths. `verticals.quvantic.com` and localhost show the platform landing at `/`. `/platform` is always the landing page.

## HVAC behavior

Fennwick Comfort Co. answers after hours and during the day.

| Situation | What the agent does |
| --- | --- |
| Gas smell or CO alarm | Reads a leave-the-building script, tells the caller to call 911 and the fictional utility Twin Ports Fuel, pages the on-call tech. Does not book a window. |
| No heat at or below freezing, or no cooling at 95°F or above with a baby, older adult, or medical need at home | Books the soonest window and texts the assigned tech. After the desk closes, that job is marked dispatched. |
| Tune-up, thermostat, quote | Books the next open arrival window. |
| Off-topic, abuse, or a request for card numbers or secrets | Declines. Does not book. |
| Missed call, or the caller asks for a text | Queues a text in the demo inbox. Nothing is sent to a real phone. |
| Asks for a person | Transfers to the desk number while the desk is open, otherwise the on-call number. On a browser call nothing is actually dialed. |

Desk hours, America/Chicago: Monday–Friday 7:30 AM–5:30 PM, Saturday 8:00 AM–12:00 PM, Sunday closed. Arrival windows are 8:00 AM–12:00 PM (Monday–Saturday) and 12:00 PM–4:00 PM (Monday–Friday). One job per technician per window. Routine changes need 4 hours notice. Urgent changes need 1 hour. A technician who is already dispatched cannot be moved by the bot.

Technicians (fictional): Nora Voss (furnace, on call Mon–Tue), Eli Navarro (heat and cooling, Wed–Thu), Samira Cole (maintenance and quotes, Fri–Sun).

## Tools

| Method and path | Purpose |
| --- | --- |
| `POST /v/hvac/vapi/webhook` | Vapi server URL. `tool-calls` and `end-of-call-report`. |
| `POST /v/hvac/vapi/tools/triage_issue` | Emergency, urgent, routine, off-topic, or needs detail. |
| `POST /v/hvac/vapi/tools/lookup_customer` | Customer and open jobs by phone. |
| `POST /v/hvac/vapi/tools/check_windows` | Open arrival windows. |
| `POST /v/hvac/vapi/tools/book_job` | Book a window the checker returned. |
| `POST /v/hvac/vapi/tools/reschedule_job` | Move a job. |
| `POST /v/hvac/vapi/tools/cancel_job` | Cancel a job. |
| `POST /v/hvac/vapi/tools/escalate_on_call` | Gas or CO only. Pages on-call and returns the on-call number. |
| `POST /v/hvac/vapi/tools/transfer_to_human` | Desk or on-call number. |
| `POST /v/hvac/vapi/tools/send_text_back` | Queue a demo text. |
| `POST /v/hvac/api/call-token` | Browser-call token after the limit check. |
| `GET /v/hvac/board`, `/calls`, `/messages`, `/customers` | Dispatch board. |
| `POST /v/hvac/demo/missed-call` | Simulate a missed call and its text-back. |
| `GET /health` | Health check. |

Every Vapi request must send `x-vapi-secret`. A repeated tool call with the same call id and tool-call id returns the stored result and does not book twice.

## SMS adapter

`SMS_PROVIDER=mock` (the default) writes messages to SQLite and shows them on the Texts tab. Status is `queued`. Nothing leaves the process.

`SMS_PROVIDER=http` POSTs JSON to `SMS_WEBHOOK_URL`. That is the seam for a provider you already run. This repo does not call Twilio or any other paid SMS API.

```ts
interface SmsProvider {
  readonly name: "mock" | "http";
  send(message: OutboundSms): Promise<SmsMessage>;
}
```

## How to add a vertical

1. Add a card in `src/verticals/catalog.ts`. `coming_soon` only needs a name, industry, and one-line plan. `live` needs a runtime.
2. Create `src/verticals/<id>/` with:
   - `brand.ts` — name, city, hours, palette, and an `OpsConfig` (job types, windows, techs) if the vertical books work.
   - domain rules (HVAC uses `triage.ts`)
   - `schemas.ts` and `runtime.ts` — tool names, argument checks, and `execute`
   - `assistant.ts` — system prompt and Vapi tool definitions
   - `scenarios.ts` and `eval.ts` — scripted conversations
3. Register the runtime in `src/verticals/registry.ts`. Routes are already `/v/:id/...` for tools, the call token, and (for HVAC today) the pages. A new vertical's pages plug into `src/pages/routes.ts` the same way, or reuse the board if the job model fits.
4. Map the hostname in `VERTICAL_HOSTS`, for example `clinic.quvantic.com=clinic`.
5. Point `buildAssistant` (or a sibling) at the new prompt and run `npm run vapi:sync` with that vertical's public URL.
6. Add the scenarios to the eval runner. `npm test` already runs `src/verticals/hvac/eval.ts`. Import the new suite the same way in `tests/hvac/evals.test.ts` or a sibling file.

The core that should stay shared: Vapi auth and idempotency (`src/vapi`), browser-call quota (`src/webcall`), call log (`src/store/calls.ts`), `SmsProvider`, and the host rewrite (`src/platform/host.ts`).

## Setup

Requires Node.js 22.

```bash
cp .env.example .env
# Set VAPI_WEBHOOK_SECRET to any long random string.
npm install
npm run dev
```

Open http://127.0.0.1:4317 for the platform, http://127.0.0.1:4317/v/hvac for Fennwick, and http://127.0.0.1:4317/v/hvac/board for the dispatch board. The database seeds when it is empty.

Docker uses the same `.env`:

```bash
docker compose up --build
```

### Sync the Vapi assistant

The assistant name, prompt, Groq model (`openai/gpt-oss-120b`), Clara voice, and tool URLs live in `src/verticals/hvac/assistant.ts`.

```bash
npm run vapi:sync
```

With no `VAPI_API_KEY`, that prints the payload and does not call Vapi. With a key, it creates or updates the assistant named `Fennwick Comfort Co. Dispatcher`. Set `PUBLIC_BASE_URL` to a URL Vapi can reach before syncing. Tool URLs are `{PUBLIC_BASE_URL}/v/hvac/vapi/tools/<name>`. The payload sends `VAPI_WEBHOOK_SECRET` as `x-vapi-secret`. Calls are capped at 240 seconds.

The model provider defaults to Vapi's built-in Groq integration (`openai/gpt-oss-120b`) so the voice session stays on a free tier with no extra credential required. `VAPI_MODEL_PROVIDER=google` switches the payload to Gemini if you would rather use a free Gemini key. Do not point this at a paid OpenAI model.

### Browser calls

The page has no Vapi key in its HTML. `POST /v/hvac/api/call-token` checks limits first:

- 3 calls per visitor IP in a rolling 24 hours (`WEB_CALL_LIMIT_PER_VISITOR`)
- 40 calls per UTC day (`WEB_CALL_LIMIT_PER_DAY`)

With `VAPI_API_KEY` and `VAPI_ORG_ID`, the response is a 30-second HS256 public JWT. Without the private key, and with `VAPI_PUBLIC_KEY` plus `VAPI_ASSISTANT_ID`, it returns the public key only after the limit check. Restrict that key in Vapi to the demo origins and this assistant. There is no phone number on the demo.

## Evals

`npm run eval` runs the HVAC scenarios and the clinic scenarios. CI does not need an API key. They check tool names and outcomes, not wording.

```bash
npm run eval
```

`npm test` runs the same scenarios. Optional live mode sends one gas-smell prompt to Groq and executes the tool calls. It is not part of CI.

```bash
GROQ_API_KEY=... npm run eval:live
```

Scenarios: gas smell, CO alarm, no heat in a freeze, no cooling with an infant in extreme heat, tune-up for an existing customer, furnace quote, reschedule, cancel, full window, missed-call text-back, prompt-injection / card number, wrong number, Saturday-evening tune-up (books Monday), text-me-instead, angry caller transferred.

## Tests and CI

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
```

GitHub Actions runs those on pull requests and on `main`. Playwright covers the landing page, the HVAC page, the job board, a call detail, search, customers, a missed-call text, a booking made through the tool API, the call-limit message, and a 390px-wide layout. It writes the screenshots above.

Coverage thresholds on `src/` are 80% statements, 80% lines, 80% functions, and 70% branches. `src/server.ts`, `src/evals/cli.ts`, and `src/evals/live.ts` are excluded.

## Environment

Copy `.env.example`. Never commit `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VAPI_WEBHOOK_SECRET` | yes | Shared secret in `x-vapi-secret`. Min 8 characters. |
| `VAPI_API_KEY` | for sync and JWT calls | Vapi private key. Empty is a dry run. |
| `VAPI_ORG_ID` | for JWT calls | Org id used in the public token. |
| `VAPI_PUBLIC_KEY` | fallback | Returned only after the limit check. |
| `VAPI_ASSISTANT_ID` | for HVAC browser calls | Created by `npm run vapi:sync`. |
| `VAPI_CLINIC_ASSISTANT_ID` | for clinic browser calls | Created by `VERTICAL=clinic npm run vapi:sync`. |
| `VAPI_FINTECH_ASSISTANT_ID` | for Wrenline browser calls | Created by `VERTICAL=fintech npm run vapi:sync`. |
| `VAPI_MODEL_PROVIDER` | no | `groq` (default) or `google`. |
| `VAPI_MODEL` | no | Default `openai/gpt-oss-120b`. |
| `PUBLIC_BASE_URL` | yes for sync | URL Vapi can reach. |
| `WEB_CALL_ORIGINS` | no | Comma-separated. Defaults include the two planned domains. |
| `TRUST_PROXY_HEADERS` | on Vercel | `true` so the visitor IP comes from the proxy. |
| `DATABASE_PATH` | no | Default `./data/verticals.sqlite`. Use `/tmp/verticals.sqlite` on Vercel. |
| `SERVE_STATIC` | no | `false` on Vercel, where the CDN serves `public/`. |
| `VERTICAL_HOSTS` | no | `hvac.quvantic.com=hvac,hvac.localhost=hvac` |
| `SMS_PROVIDER` | no | `mock` (default) or `http`. |
| `SMS_WEBHOOK_URL` | if `http` | Your own endpoint. Not a paid SMS API. |
| `SMS_FROM_NUMBER` | no | Fictional `+12185550148`. |
| `TRANSFER_NUMBER`, `ON_CALL_NUMBER` | no | Fictional desk and on-call numbers. |
| `GROQ_API_KEY` | live eval only | Free-tier Groq key. Not used in CI. |
| `GEMINI_API_KEY` | unused by the server | Reserved if you point live evals at Gemini. |

## Deploy

`vercel.json` builds with `npm run build`, serves `public/`, and sends every other path to `api/index.js`. Production is the Vercel project `voice-ai-verticals`, with `verticals.quvantic.com` and `hvac.quvantic.com` on the same deployment. The app picks the page from the `Host` header (`x-forwarded-host` when `TRUST_PROXY_HEADERS=true`).

Production uses restricted Vapi public-key mode (`VAPI_PUBLIC_KEY` plus `VAPI_ASSISTANT_ID`, no private key on the server). The synced assistant uses Vapi's built-in Groq model `openai/gpt-oss-120b` and the Clara voice. Env vars on that project: `VAPI_WEBHOOK_SECRET`, `VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`, `TRUST_PROXY_HEADERS=true`, `DATABASE_PATH=/tmp/verticals.sqlite`, `SERVE_STATIC=false`, `PUBLIC_BASE_URL=https://hvac.quvantic.com`, `SMS_PROVIDER=mock`, `SEED_ON_BOOT=true`.

SQLite on Vercel lives under `/tmp` and resets when the instance is recycled. Jobs, calls, and texts can also split across instances. That matches the dental demo's call log. For a board that sticks, run the Docker image on a single Node host instead of serverless, with `DATABASE_PATH` on a volume. A shared document store (the dental demo's D1 relay) can be added later behind the same job functions; it is not wired in this slice.

Free-tier limits still apply: Vapi credits run out, calls are capped at 4 minutes, and the button stops once the account balance is gone. The board and the evals keep working without Vapi.
