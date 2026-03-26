# Setup — Be Healthy Social Selling Agent

## Prerequisites

- Node.js >= 18
- Kommo CRM account with API access (Bearer Token)
- OpenAI API key
- Instagram Business account connected to Meta Business API
- Meta App with Instagram webhooks configured

## 1. Install Dependencies

```bash
cd behealthy-social-agent
npm install
```

Note: The `n8n-nodes-kommo` community node is optional. The workflow uses HTTP Request nodes as a fallback for full Kommo API compatibility.

## 2. Configure Environment

```bash
cp config/env.example .env
```

Edit `.env` and fill in:
- `KOMMO_ACCESS_TOKEN` — your Kommo Bearer token
- `OPENAI_API_KEY` — your OpenAI API key
- `META_ACCESS_TOKEN` — your Meta/Instagram page access token
- `INSTAGRAM_VERIFY_TOKEN` — a custom string for webhook verification
- `WEBHOOK_URL` — your public-facing URL (e.g., via ngrok for testing)

## 3. Update Knowledge Base

The file `knowledge/manual-behealthy.md` contains a template based on the system specification. **You must update it** with the official clinic manual content from:

https://docs.google.com/document/d/1TyExSPIY1Z9rH-GrOzVjtEX3-c3Ckcce/edit

Copy the full document content into `knowledge/manual-behealthy.md`.

## 4. Setup Kommo Pipeline

```bash
npm run setup
```

This will:
- Verify Kommo API access
- Check if "SOCIAL SELLING INSTAGRAM" pipeline exists
- Create it if missing (with all 7 stages)
- Save `pipeline_id` and `status_id` values to `config/pipeline.json`

## 5. Start n8n

```bash
./scripts/start.sh
```

Or manually:
```bash
npx n8n start
```

## 6. Import Workflows

```bash
npm run import:all
```

Or manually:
1. Open n8n at `http://localhost:5678`
2. Go to **Workflows** → **Import from File**
3. Import `workflows/social-instagram-agent.json` (main — 31 nodes)
4. Import `workflows/comment-mudanca-automation.json` (MUDANCA — 20 nodes)
5. Configure the **Kommo Bearer Auth** credential in both:
   - Header Name: `Authorization`
   - Header Value: `Bearer YOUR_TOKEN`
6. Set n8n environment variables (Settings → Environment Variables):
   - `KOMMO_BASE_URL` = `https://felipebhcrm.kommo.com/api/v4`
   - `KOMMO_PIPELINE_ID` = (from config/pipeline.json)
   - `KOMMO_STATUS_NOVO_SEGUIDOR` = (from config/pipeline.json)
   - `KOMMO_STATUS_QUALIFICACAO` = (from config/pipeline.json)
   - `KOMMO_STATUS_INTERESSE_REAL` = (from config/pipeline.json)
   - `KOMMO_STATUS_ANDREA` = (from config/pipeline.json)
   - `KOMMO_STATUS_THAIS` = (from config/pipeline.json)
   - `KOMMO_STATUS_CONSULTA_AGENDADA` = (from config/pipeline.json)
   - `OPENAI_API_KEY` = your key
   - `OPENAI_MODEL` = `gpt-4o`
   - `META_ACCESS_TOKEN` = your Meta token
   - `MUDANCA_MEDIA_ID` = (from `npm run setup:mudanca`)
7. **Activate** both workflows

## 6B. Setup MUDANCA Reel Automation

```bash
npm run setup:mudanca
```

This fetches the Instagram media ID for the MUDANCA reel (shortcode: DWT8AMJxcHH).
Add the output `MUDANCA_MEDIA_ID` to `.env` and n8n environment variables.

## 7. Configure Instagram Webhooks

In your Meta App Dashboard:
1. Go to **Webhooks** → **Instagram**
2. Set Callback URL to: `{WEBHOOK_URL}/webhook/instagram-webhook`
3. Set Verify Token to your `INSTAGRAM_VERIFY_TOKEN`
4. Subscribe to: `messages`, `comments`, `follows`

## 8. Test

```bash
# Run all structural + E2E tests (no n8n required)
npm run test:all

# Test main webhook (requires n8n running)
./scripts/test-webhook.sh dm
./scripts/test-webhook.sh comment
./scripts/test-webhook.sh follow

# Test MUDANCA webhook (requires n8n running)
./scripts/test-mudanca-webhook.sh mudanca        # Should process
./scripts/test-mudanca-webhook.sh mudanca-lower   # Should process (case-insensitive)
./scripts/test-mudanca-webhook.sh no-accent       # Should process (accent-insensitive)
./scripts/test-mudanca-webhook.sh other           # Should skip
./scripts/test-mudanca-webhook.sh dedup           # Should skip (24h cooldown)
```

## Project Structure

```
behealthy-social-agent/
├── config/
│   ├── env.example          # Environment variables template
│   └── pipeline.json        # Kommo pipeline IDs (auto-populated)
├── knowledge/
│   └── manual-behealthy.md  # Clinic communication manual
├── scripts/
│   ├── setup-pipeline.js    # Pipeline setup script
│   ├── setup-mudanca.js     # MUDANCA reel media ID setup
│   ├── start.sh             # Startup script
│   ├── test-webhook.sh      # Main webhook testing
│   └── test-mudanca-webhook.sh  # MUDANCA webhook testing (6 scenarios)
├── services/
│   ├── ai-agent.js          # OpenAI conversation agent
│   ├── handoff.js           # Human handoff routing
│   ├── kommo-contacts.js    # Contact lookup & creation
│   ├── kommo-leads.js       # Lead management
│   ├── kommo-notes.js       # CRM notes & logging
│   └── lead-classifier.js   # Lead classification logic
├── workflows/
│   ├── social-instagram-agent.json       # Main n8n workflow (31 nodes)
│   └── comment-mudanca-automation.json   # MUDANCA comment automation (20 nodes)
├── .gitignore
├── package.json
└── SETUP.md
```

## Workflow Overview

```
Instagram Event (Webhook)
  → Parse Event (follow/comment/DM)
  → Check Contact in Kommo (dedup by username)
  → Create Contact if Missing
  → Create Lead (pipeline: SOCIAL SELLING INSTAGRAM)
  → Add CRM Note (origin, message, timestamp)
  → AI Agent (OpenAI + SPIN method)
  → Classify Lead (Hot/Warm/Cold/Unqualified)
  → Update Pipeline Stage
  → If qualified → Handoff to Andrea or Thais
```

### MUDANCA Comment Automation

```
Instagram Comment "MUDANCA" (Webhook)
  → Detect keyword (case/accent insensitive)
  → Dedup user (24h cooldown)
  → Filter by reel media ID (optional)
  → Check/Create Contact in Kommo (tag: mudanca-reel)
  → Check/Create Lead (stage: Interesse Real)
  → Generate personalized DM (OpenAI + SPIN + Be Healthy manual)
  → Log to CRM (note: AUTOMACAO MUDANCA REEL)
  → Send DM via Instagram Graph API
  → Move lead to Consulta Agendada
```

## Responsible Users

| Area | Operator | User ID |
|------|----------|---------|
| Weight Loss | Andrea | 14813416 |
| Aesthetics | Thais | 14832028 |
