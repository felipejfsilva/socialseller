# Be Healthy Instagram Social Seller — Production Activation Guide

## System Overview

An n8n-based automation that receives Instagram events (DM, comment, follow),
manages leads in Kommo CRM, uses OpenAI for conversational engagement via SPIN
methodology, and routes qualified leads to the correct human operator.

**Workflows**:
- Main: 31 nodes, 27 connections, 13 code nodes, 8 HTTP nodes, 4 response endpoints
- MUDANCA: 20 nodes, 18 connections, 8 code nodes, 6 HTTP nodes, 2 response endpoints
**Validated**: 111/111 E2E assertions pass (69 main + 42 MUDANCA), structural validation clean

---

## Production Checklist

### Phase 1: Infrastructure

- [ ] **Server**: Provision a server with Node.js >= 18, accessible via HTTPS
- [ ] **Domain**: Configure a public domain/subdomain for n8n (e.g., `n8n.behealthy.com.br`)
- [ ] **SSL**: Enable HTTPS (required by Meta for webhooks)
- [ ] **n8n**: Install and start n8n (`npm install && npm run start:n8n`)
- [ ] **n8n auth**: Set `N8N_BASIC_AUTH_USER` and `N8N_BASIC_AUTH_PASSWORD`

### Phase 2: Kommo CRM

- [ ] **Copy `.env`**: `cp config/env.example .env` and fill in `KOMMO_ACCESS_TOKEN`
- [ ] **Run pipeline setup**: `npm run setup`
  - Verify output shows all 7 status IDs (none showing `NOT FOUND`)
  - Confirm `config/n8n-env-vars.json` was created with numeric IDs
- [ ] **Verify pipeline in Kommo**: Open Kommo > Pipelines > "SOCIAL SELLING INSTAGRAM"
  - Confirm stages exist: Novo Seguidor, Interação Inicial, Qualificação, Interesse Real, Encaminhado Andrea, Encaminhado Thais, Consulta Agendada
- [ ] **Verify operator accounts**: Confirm these users exist in Kommo:
  - Andrea: user ID `14813416`
  - Thais: user ID `14832028`
- [ ] **Create credential in n8n**: Settings > Credentials > Add "HTTP Header Auth"
  - Name: `Kommo Bearer Auth`
  - Header Name: `Authorization`
  - Header Value: `Bearer <your_kommo_access_token>`

### Phase 3: OpenAI

- [ ] **API key**: Add `OPENAI_API_KEY` to `.env`
- [ ] **Model**: Confirm `OPENAI_MODEL` is set (default: `gpt-4o`)
- [ ] **Billing**: Verify OpenAI account has active billing (usage: ~400 tokens per DM interaction)
- [ ] **Rate limits**: Confirm your OpenAI plan supports at least 30 RPM

### Phase 4: Meta / Instagram

- [ ] **Meta App**: Create or configure app at https://developers.facebook.com
- [ ] **Permissions**: Request and get approval for:
  - `instagram_manage_messages` (required for DM replies)
  - `instagram_manage_comments` (required for comment events)
  - `pages_messaging` (required for sending messages)
- [ ] **Page Access Token**: Generate long-lived page access token
  - Add as `META_ACCESS_TOKEN` in `.env`
- [ ] **Instagram Business Account**: Link Facebook Page to Instagram Business Account
- [ ] **Webhook subscription**: In Meta App Dashboard > Webhooks:
  - Callback URL: `https://<your-domain>/webhook/instagram-webhook`
  - Verify Token: same value as `INSTAGRAM_VERIFY_TOKEN` in `.env`
  - Subscribe to: `messages`, `messaging_postbacks`, `comments`, `feed`
- [ ] **Test webhook verification**: The GET endpoint returns `hub.challenge`

### Phase 5: n8n Environment Variables

Set ALL of these in n8n > Settings > Environment Variables:

| Variable | Source |
|----------|--------|
| `KOMMO_BASE_URL` | `https://felipebhcrm.kommo.com/api/v4` |
| `KOMMO_ACCESS_TOKEN` | Your Kommo bearer token |
| `KOMMO_PIPELINE_ID` | From `config/n8n-env-vars.json` |
| `KOMMO_STATUS_NOVO_SEGUIDOR` | From `config/n8n-env-vars.json` |
| `KOMMO_STATUS_QUALIFICACAO` | From `config/n8n-env-vars.json` |
| `KOMMO_STATUS_INTERESSE_REAL` | From `config/n8n-env-vars.json` |
| `KOMMO_STATUS_ANDREA` | From `config/n8n-env-vars.json` |
| `KOMMO_STATUS_THAIS` | From `config/n8n-env-vars.json` |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o` (or your preferred model) |
| `META_ACCESS_TOKEN` | Your Meta page access token |
| `MUDANCA_MEDIA_ID` | Instagram media ID of the MUDANCA reel (from `npm run setup:mudanca`) |

### Phase 6: Workflow Import and Activation

- [ ] **Import main workflow**: `npm run import:workflow`
  - Or: n8n UI > Import from file > `workflows/social-instagram-agent.json`
- [ ] **Import MUDANCA workflow**: `npm run import:mudanca`
  - Or: n8n UI > Import from file > `workflows/comment-mudanca-automation.json`
  - Shortcut: `npm run import:all` (imports both)
- [ ] **Verify credential binding**: Open each workflow, check all HTTP nodes reference `Kommo Bearer Auth`
  - Main workflow: 8 HTTP nodes
  - MUDANCA workflow: 6 HTTP nodes
- [ ] **Test with fixtures** (before activating):
  ```bash
  # Start n8n
  npm run start:n8n

  # In another terminal, test main workflow:
  ./scripts/test-webhook.sh dm
  ./scripts/test-webhook.sh comment
  ./scripts/test-webhook.sh follow

  # Test MUDANCA workflow:
  ./scripts/test-mudanca-webhook.sh mudanca
  ./scripts/test-mudanca-webhook.sh other
  ```
- [ ] **Verify responses**: Each test should return JSON with `status: 'ok'` or `status: 'skipped'`
- [ ] **Check Kommo**: Verify test contacts/leads were created in the pipeline
- [ ] **Activate both workflows**: Toggle each workflow to "Active" in n8n UI

### Phase 6B: MUDANCA Reel Automation (Additional Steps)

- [ ] **Fetch media ID**: `npm run setup:mudanca`
- [ ] **Set `MUDANCA_MEDIA_ID`** in `.env` and in n8n environment variables
- [ ] **Webhook**: Subscribe to `comments` events in Meta (same webhook or separate endpoint)
  - MUDANCA webhook path: `/webhook/instagram-comment-mudanca`
- [ ] **Test**: `./scripts/test-mudanca-webhook.sh mudanca` should return `status: ok`
- [ ] **Verify Kommo lead**: Should appear with tag `mudanca-reel` in stage "Consulta Agendada"

### Phase 7: Knowledge Base

- [ ] **Update manual**: Download official content from:
  `https://docs.google.com/document/d/1TyExSPIY1Z9rH-GrOzVjtEX3-c3Ckcce/edit`
- [ ] **Replace content**: Paste into `knowledge/manual-behealthy.md`, replacing sections 1-7
- [ ] **Remove placeholder section**: Delete the `MANUAL_PENDING_OFFICIAL_CONTENT` block
- [ ] **Restart n8n**: Changes to manual do not affect the workflow (system prompt is inline)
  - To update AI behavior: edit the system prompt in the "AI Conversation Agent" node

---

## Production Resilience Features

### Retry Logic
- All Kommo HTTP nodes: `onError: continueRegularOutput` (never crash the pipeline)
- All Kommo HTTP nodes: 15-second timeout
- OpenAI: 2 attempts with 2-second backoff between retries
- OpenAI: 25-second timeout per attempt
- OpenAI: 429 rate limit detection with `retry-after` header respect (max 5s wait)

### Rate Limit Protection
- **Rate Limit Guard node**: 30 events per 60-second sliding window
- Uses n8n workflow static data for state persistence across executions
- Events exceeding the limit return `status: skipped, reason: rate limit exceeded`

### Safe Mode (AI Fallback)
The workflow NEVER crashes the conversation. Degradation paths:

| Failure | Behavior |
|---------|----------|
| CRM contact creation fails | Sets `_contactFailed`, skips lead ops, returns safe message |
| CRM lead creation fails | Sets `_leadFailed`, returns safe message |
| OpenAI timeout (25s) | Retries once, then returns deterministic fallback |
| OpenAI 429 rate limited | Waits up to 5s, retries once, then falls back |
| OpenAI 500/503 error | Retries once with 2s delay, then falls back |
| Classification parse fails | Defaults to `cold/unknown/no_handoff` |
| Missing env variable | `Lead Classification` defaults to `Novo Seguidor` |

Safe mode fallback message (PT-BR):
> "Olá! Obrigado pelo seu contato com o Instituto Be Healthy. Estamos com um volume alto de mensagens, mas nossa equipe vai entrar em contato com você em breve!"

### Error Telemetry
Every execution that encounters errors logs a CRM note containing:
- Timestamp
- Lead ID
- Event type and sender
- List of errors encountered
- AI mode (live / safe_crm_failed / safe_ai_failed / deterministic)
- Execution ID for tracing

The Error Telemetry node runs before the final webhook response on the no-handoff path.

---

## Monitoring

### What to Watch
1. **n8n Executions page**: Check for failed executions (should be zero — errors are caught)
   - Filter by workflow name to separate main vs MUDANCA executions
2. **Kommo notes**: Search for notes containing "SYSTEM ERROR LOG" to find degraded executions
   - MUDANCA notes are prefixed with "AUTOMACAO MUDANCA REEL"
3. **OpenAI usage**: Monitor at https://platform.openai.com/usage
4. **Instagram webhook health**: Meta App Dashboard > Webhooks > Recent deliveries
5. **MUDANCA cooldown**: Each user can only trigger MUDANCA once per 24h (dedup via n8n static data)

### Alerts to Set Up
- n8n execution failure rate > 0 (indicates uncaught error)
- OpenAI monthly cost exceeding budget
- Kommo API 401 errors (token expired)
- Meta webhook delivery failure rate

---

## Quick Reference

```bash
# Validate locally (no credentials needed)
npm run validate          # Both workflows structure
npm run test:all          # All 111 E2E assertions

# Run setup (requires KOMMO_ACCESS_TOKEN)
npm run setup             # Kommo pipeline
npm run setup:mudanca     # MUDANCA media ID

# Import workflows into n8n
npm run import:all        # Both workflows

# Start n8n
npm run start:n8n

# Test webhooks (requires n8n running)
./scripts/test-webhook.sh dm
./scripts/test-webhook.sh comment
./scripts/test-webhook.sh follow
./scripts/test-mudanca-webhook.sh mudanca
./scripts/test-mudanca-webhook.sh other
```

---

## File Inventory

| File | Purpose |
|------|---------|
| `workflows/social-instagram-agent.json` | Main n8n workflow (31 nodes) |
| `workflows/comment-mudanca-automation.json` | MUDANCA comment automation workflow (20 nodes) |
| `config/constants.js` | Canonical source of truth for operator IDs, stages, mappings |
| `config/pipeline.json` | Pipeline config template (populated by setup) |
| `config/n8n-env-vars.json` | Generated: n8n env var values (created by setup) |
| `config/env.example` | Environment variable template |
| `knowledge/manual-behealthy.md` | AI knowledge base |
| `scripts/setup-pipeline.js` | Creates Kommo pipeline, extracts IDs |
| `scripts/setup-mudanca.js` | Fetches MUDANCA_MEDIA_ID, validates env vars |
| `scripts/start.sh` | Preflight checks and n8n startup |
| `scripts/test-webhook.sh` | Test main webhook payloads |
| `scripts/test-mudanca-webhook.sh` | Test MUDANCA comment webhook (6 scenarios) |
| `services/*.js` | Node.js reference implementations (canonical logic) |
| `tests/validate-workflow.js` | Main workflow structural validator |
| `tests/validate-mudanca.js` | MUDANCA workflow structural validator |
| `tests/e2e-validation.js` | Main E2E scenario validator (69 assertions) |
| `tests/e2e-mudanca-validation.js` | MUDANCA E2E scenario validator (42 assertions) |
| `tests/fixtures/*.json` | 9 test fixtures for all event types and paths |
