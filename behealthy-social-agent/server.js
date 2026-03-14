/**
 * Agente SDR Instagram — Instituto Be Healthy
 *
 * Servidor Express que recebe webhooks do Instagram (Meta)
 * e orquestra o fluxo completo de atendimento automatizado:
 *
 *   Instagram DM/Comment/Follow
 *     → interpretar mensagem
 *     → carregar memória de conversa
 *     → classificar lead
 *     → gerar resposta (SPIN)
 *     → atualizar pipeline Kommo
 *     → encaminhar para equipe quando necessário
 */

const express = require('express');
const { handleWebhook, handleVerification } = require('./src/controllers/instagramWebhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'behealthy-sdr-agent' });
});

// Meta webhook verification (GET)
app.get('/webhook/instagram', handleVerification);

// Instagram webhook events (POST)
app.post('/webhook/instagram', handleWebhook);

// Validate required environment variables
function validateEnv() {
  const required = [
    'KOMMO_BASE_URL',
    'KOMMO_ACCESS_TOKEN',
    'OPENAI_API_KEY'
  ];

  const missing = required.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error(`[ERRO] Variáveis de ambiente obrigatórias não definidas: ${missing.join(', ')}`);
    console.error('Crie o arquivo .env a partir de config/env.example');
    process.exit(1);
  }
}

// Load .env if present
try {
  require('dotenv').config();
} catch {
  // dotenv is optional — env vars can be set directly
}

validateEnv();

app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('Agente SDR Instagram Be Healthy em execução');
  console.log(`Webhook ativo em http://localhost:${PORT}/webhook/instagram`);
  console.log('='.repeat(50));
});
