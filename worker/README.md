# CS AI backend — deployment pending

No provider key, access password, account ID or production endpoint is included. The UI currently supports template management; AI generation stays disabled until connected. This worker is independent of LIFT LIVE, its Recorder, databases and schedulers.

## Connection

1. Use an existing authorized Cloudflare account; review the Free plan and rate-limit binding availability. Do not change plans or create paid services without approval.
2. Confirm rate-limit namespace `731901` is unused in that account; choose an unused positive integer if needed. Verify an available OpenAI model and an existing approved API budget. Set `OPENAI_MODEL` as a Worker variable. ChatGPT subscriptions do not provide this API key.
3. Enter `OPENAI_API_KEY` and a random `CS_PASSWORD` (at least 24 characters) through protected Worker secret inputs, never chat, GitHub, screenshots or logs. With an authenticated CLI, use `wrangler secret put` interactively from this directory. Do not pass secret values as shell arguments.
4. Deploy this worker using `wrangler deploy` from this directory. It has no D1/R2/cron bindings. Missing secrets/model/rate limiter fail closed with 503.
5. Set only the public HTTPS `/reply` URL in root `cs-config.js`. The user enters the application access password in a masked field per page session. It is not the OpenAI key and is never persisted. Do not embed either secret in frontend code.
6. Run authenticated synthetic staging requests, verify actual reply quality (including contradictions and missing facts), and then test the production UI. Verify 401 for wrong password, 403 for wrong origin, 429 for excess requests and 503 when configuration is absent. Provider mock tests are not live AI validation.

## Privacy and limitations

Only saved company templates use localStorage. Queries, notes, replies and access passwords are memory-only. Template text is rendered with textContent. The clipboard contains only the currently edited reply or the selected template body.

Phone/email/resident-ID and explicitly labeled order/waybill patterns are masked both locally and server-side. Names and addresses are not reliably detected: remove them manually before sending. Only up to six related templates are transmitted. Requests and response bodies are not logged by application code; Worker observability is disabled. The provider receives masked inputs with `store:false`; this is not a guarantee of zero provider-side retention. Review provider data controls separately.

The worker authenticates before provider calls, restricts origins, bounds streamed request bodies, enforces rate limits and timeouts, limits output size, uses structured output and rejects new numeric values absent from notes/templates. Rate limits are approximate per Cloudflare location, not a global monetary cap. Use provider project spend controls before activation. A shared application password is suitable only for a small trusted team; rotate it if disclosed.

Instructions prioritize notes over templates and require unknown facts in a separate checklist. Numeric validation catches some fabricated dates/fees but cannot guarantee semantic accuracy (e.g. whether a policy applies). A human must check the draft before sending. Related-template retrieval is local keyword/topic scoring; it is a candidate list, not confirmation of applicability.

References: https://developers.openai.com/api/reference/resources/responses/methods/create
https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
