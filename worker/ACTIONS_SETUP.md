# CS-only protected deployment

Status: deployment code ready; credentials and protected Environment are not yet confirmed. The frontend endpoint remains empty. No Cloudflare login from ChatGPT Work is used.

## Scope and configuration

Start main: `ebf4522f120264aa2324282946393e8c36774c5b`.
The manual workflow targets only `order-cleaner-cs`. Its CLI explicitly uses `worker/wrangler.json`, which preserves the original TOML configuration (the TOML remains unchanged). No routes, cron, D1, R2 or other Worker is modified. Do not run a generic Wrangler command from the repository root. Required namespace `731901` must be unused by unrelated Workers; confirm in the account before first deployment. If occupied, stop rather than sharing rate-limit counters.

Wrangler is pinned to `4.151.1`. Code is compiled without credentials in the verify job. The deploy job requires `workflow_dispatch`, the `main` ref, a checked `deploy` input and the dedicated Environment. Pushes only run verification on the review branch; there is no automatic Worker deployment on ordinary commits. Existing `cs-checks.yml` is unchanged.

## One-time user setup in normal Chrome

Create a NEW GitHub Environment in **gaeng1181-svg/order-cleaner → Settings → Environments** named `order-cleaner-cs-production`. Never reuse LIFT LIVE or another repository's Environment. Under deployment branches, select **Selected branches and tags**, add **Branch: main**, and do not add any tags or wildcard branches. If required reviewers are available, use the owner as reviewer; do not change plans to obtain this feature. Other workflows on main can still name this Environment, so review workflow changes as security-sensitive code.

Add these four **Environment secrets**. Values must only be typed into GitHub's protected secret form, never chat, code, screenshots, logs or workflow inputs:

| Name | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Scoped deployment credential |
| `CLOUDFLARE_ACCOUNT_ID` | Account selector for Wrangler |
| `OPENAI_API_KEY` | Existing authorized API project key, not a ChatGPT login |
| `CS_PASSWORD` | Random 24–256 character application access password, no line breaks |

The deployment credentials are used only by the runner and are not Worker bindings. Only `OPENAI_API_KEY` and `CS_PASSWORD` become runtime secret bindings. Use a password manager to generate and keep the CS access password; it will later be entered in the CS tab per page session.

Add these **Environment variables** only after confirming them yourself:

| Name | Value / condition |
| --- | --- |
| `OPENAI_MODEL` | Proposed `gpt-5.6-luna`; the script checks GET `/v1/models/{id}` using the actual project key before deployment. No silent fallback. |
| `CS_FREE_PLAN_CONFIRMED` | `true` only after checking the existing Cloudflare Workers Free plan; otherwise leave unset. |
| `CS_API_BUDGET_CONFIRMED` | `true` only after checking an existing API project/key, its spend controls and budget for four small live tests; otherwise leave unset. |

The workflow never signs up for a paid plan, changes billing or increases limits. These two confirmations are attestations, not API verification of billing settings. A Cloudflare Free plan does not make OpenAI calls free. If no existing API key/budget is available, stop before activating deployment.

### Minimum token access

Use the normal logged-in Cloudflare Chrome session to create a dedicated token named for this CS deployment, restricted to the intended account. Never use a Global API Key or full account Administrator token. No DNS, Zone, Routes, D1, R2, KV or billing-write permissions are needed.

Prefer a token scoped to **this Worker** with Editor access plus read-only access to the existing workers.dev subdomain/account metadata if the account UI supports these scopes. Editor can deploy an existing Worker but cannot create a new one. For that least-privilege route, first create only an `order-cleaner-cs` placeholder in the normal Chrome session and keep it unconfigured (503 behavior is then covered by local tests; its initial deployed code has not been our fail-closed bootstrap).

If initial creation through Actions is required, current Cloudflare docs require Workers-product Admin for creating new Workers, limited to the intended account; this is broader than per-Worker Editor and must not be confused with full account Administrator. Legacy token templates may show `Workers Scripts: Edit` with account-wide Workers access. Do not silently grant broad scope: record the actual role/resource scope before use. After creation, narrow to per-Worker Editor when supported. The pipeline hardcodes the Worker name and reads only its settings and the workers.dev subdomain.

Existing account `workers.dev` subdomain is required. The script stops instead of creating or changing account subdomains. Disable Actions debug logging. No secrets are uploaded to artifacts.

## Deployment and validation

After review CI passes and the Environment is protected/populated, register this workflow on main without modifying `cs-config.js`. Then manually run **Deploy CS Worker (manual)** on **main**, check `deploy`, and approve the Environment if configured.

The deployment script validates the fixed configuration, required secret names, Free/budget attestations, ref and actual model access. If the Worker does not exist it deploys unconfigured first and verifies live HTTP 503, then deploys code and runtime secrets atomically with `--secrets-file`. That JSON exists only in a 0700 temporary directory as a 0600 file and is removed in `finally`; values never appear as CLI arguments. Captured raw Wrangler output is discarded, not logged. The provider key and access password are stripped from the child process environment.

The smoke script verifies HTTPS, CORS OPTIONS, wrong-origin 403, wrong-password 401, correct-auth validation, and rate-limited 429 using invalid requests that cannot call AI. It waits for the rate-limit window, then makes exactly four sequential paid synthetic calls: conflicting dates, missing restock/fee information, relevant saved text, and internal AS/parts denial overriding an incompatible positive template. Raw responses are not printed. Regex checks are regression checks, not a mathematical guarantee of semantic accuracy; human review is still needed. API failures or any assertion fail the workflow, and frontend remains disconnected.

If the Worker already exists, do not remove its secrets merely to demonstrate 503: report the missing-config test as local-only unless a genuine unconfigured first deployment was tested. Do not claim a skipped live check passed.

Only after a green deploy/live test run, set the public URL in `cs-config.js` in a separate reviewed change, rerun frontend checks, and deploy Pages. No key or password goes in frontend config. Verify a synthetic real reply, editing/clipboard, reference/checklist exclusion and non-persistence with the owner entering the access password directly.

## Official sources checked 2026-10-19

- https://developers.cloudflare.com/workers/wrangler/commands/workers/ — atomic `--secrets-file` deployment.
- https://developers.cloudflare.com/workers/authorization/workers/ — per-Worker Editor vs product-level creation rights.
- https://developers.openai.com/api/docs/models/gpt-5.6-luna — current model ID, Responses and structured outputs support, reasoning `none` for bounded CS output. Actual project access is not established until the authenticated model check.
