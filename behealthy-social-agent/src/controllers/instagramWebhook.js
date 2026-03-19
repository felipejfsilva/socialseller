/**
 * Instagram Webhook Controller
 *
 * Recebe eventos do Instagram via Meta Webhooks e orquestra o fluxo:
 *   1. Parsear evento (DM, comentário, follow)
 *   2. Buscar/criar contato no Kommo
 *   3. Buscar/criar lead no pipeline
 *   4. Carregar memória de conversa
 *   5. Classificar intenção e gerar resposta IA
 *   6. Atualizar estágio do pipeline
 *   7. Encaminhar para equipe humana se necessário
 *   8. Enviar resposta via Instagram
 */

const kommo = require('../services/kommo');
const memory = require('../services/conversationMemory');
const { classifyIntent } = require('../ai/intentClassifier');
const { generateReply } = require('../ai/replies');
const { TEMPERATURE_TO_STAGE, OPERATORS, INTEREST_TO_OPERATOR, META_GRAPH_API_VERSION } = require('../../config/constants');

// Rate limiting: 30 eventos por 60 segundos
const rateLimitWindow = [];
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function isRateLimited() {
  const now = Date.now();
  while (rateLimitWindow.length > 0 && rateLimitWindow[0] < now - RATE_WINDOW_MS) {
    rateLimitWindow.shift();
  }
  if (rateLimitWindow.length >= RATE_LIMIT) return true;
  rateLimitWindow.push(now);
  return false;
}

/**
 * GET /webhook/instagram — Verificação do webhook Meta
 */
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WEBHOOK] Verificação bem-sucedida');
    return res.status(200).send(challenge);
  }

  console.warn('[WEBHOOK] Verificação falhou — token inválido');
  return res.sendStatus(403);
}

/**
 * POST /webhook/instagram — Processar evento do Instagram
 */
async function handleWebhook(req, res) {
  try {
    if (isRateLimited()) {
      console.warn('[WEBHOOK] Rate limit atingido — evento ignorado');
      return res.json({ status: 'skipped', reason: 'rate_limited' });
    }

    const event = parseInstagramEvent(req.body);

    if (!event) {
      return res.json({ status: 'skipped', reason: 'invalid_event' });
    }

    console.log(`[NOVA MENSAGEM] Tipo: ${event.type} | Usuário: ${event.senderName || event.senderId}`);

    // 1. Buscar ou criar contato no Kommo
    const { contact, created: contactCreated } = await kommo.getOrCreateContact({
      name: event.senderName,
      instagram_username: event.senderId
    });

    if (contactCreated) {
      console.log(`[CONTATO CRIADO] ${event.senderName || event.senderId} (ID: ${contact.id})`);
    } else {
      console.log(`[CONTATO ENCONTRADO] ID: ${contact.id}`);
    }

    // 2. Buscar ou criar lead no pipeline
    const { lead, created: leadCreated } = await kommo.getOrCreateLead({
      contactId: contact.id,
      name: event.senderName,
      instagram_username: event.senderId
    });

    if (leadCreated) {
      console.log(`[LEAD CRIADO] ID: ${lead.id} — Estágio: Novo Seguidor`);
    } else {
      console.log(`[LEAD ENCONTRADO] ID: ${lead.id}`);
    }

    // 3. Registrar evento no Kommo
    await kommo.logInstagramEvent(lead.id, {
      eventType: event.type,
      content: event.text,
      timestamp: new Date().toISOString()
    });

    // 4. Carregar memória de conversa
    const conversationContext = await memory.loadConversationContext(lead.id, contact.id);

    // 5. Classificar intenção
    const classification = classifyIntent(event, conversationContext);
    console.log(`[CLASSIFICAÇÃO] Temperatura: ${classification.temperature} | Área: ${classification.interestArea}`);

    // 6. Gerar resposta com IA
    const aiResult = await generateReply({
      leadId: lead.id,
      message: event.text,
      contactName: event.senderName,
      eventType: event.type,
      conversationContext,
      classification
    });

    // 7. Normalizar classificação (camelCase do intentClassifier → snake_case)
    const normalizedClassification = normalizeClassification(aiResult.classification);

    // 8. Registrar nota da conversa no Kommo
    await kommo.addLeadNote(lead.id, {
      origin: `Instagram ${event.type}`,
      initialMessage: event.text,
      summary: `Resposta IA: ${aiResult.response.substring(0, 200)}... | Temperatura: ${normalizedClassification.lead_temperature}`
    });

    // 9. Atualizar estágio do pipeline
    const routingResult = await handleRouting(lead.id, normalizedClassification, aiResult.response);

    if (routingResult.action === 'handoff') {
      console.log(`[ENCAMINHAMENTO] Lead ${lead.id} → ${routingResult.assignedTo}`);
    } else {
      console.log(`[MUDANÇA DE ESTÁGIO] Lead ${lead.id} → ${routingResult.stage}`);
    }

    // 9. Enviar resposta via Instagram (se configurado)
    const replyMessage = routingResult.action === 'handoff'
      ? routingResult.handoffMessage
      : aiResult.response;

    if (process.env.META_ACCESS_TOKEN && event.senderId) {
      await sendInstagramReply(event.senderId, replyMessage);
    }

    // 11. Salvar contexto da conversa
    memory.saveConversationTurn(lead.id, {
      userMessage: event.text,
      aiResponse: replyMessage,
      classification: normalizedClassification,
      timestamp: new Date().toISOString()
    });

    return res.json({
      status: routingResult.action === 'handoff' ? 'handoff' : 'ok',
      leadId: lead.id,
      stage: routingResult.stage || routingResult.assignedTo
    });

  } catch (error) {
    console.error('[ERRO] Falha ao processar webhook:', error.message);
    return res.status(200).json({ status: 'error', message: error.message });
  }
}

/**
 * Parsear payload do Instagram webhook
 */
function parseInstagramEvent(body) {
  if (!body || !body.entry || !body.entry[0]) return null;

  const entry = body.entry[0];

  // DM (messaging)
  if (entry.messaging && entry.messaging[0]) {
    const msg = entry.messaging[0];
    if (msg.message && msg.message.text) {
      return {
        type: 'dm',
        senderId: msg.sender && msg.sender.id,
        senderName: msg.sender && msg.sender.username,
        text: msg.message.text,
        timestamp: msg.timestamp
      };
    }
  }

  // Comment (changes)
  if (entry.changes && entry.changes[0]) {
    const change = entry.changes[0];

    if (change.field === 'comments' && change.value) {
      return {
        type: 'comment',
        senderId: change.value.from && change.value.from.id,
        senderName: change.value.from && change.value.from.username,
        text: change.value.text,
        timestamp: change.value.created_time
      };
    }

    // Follow
    if (change.field === 'followers' || change.field === 'feed') {
      return {
        type: 'follow',
        senderId: change.value && change.value.from && change.value.from.id,
        senderName: change.value && change.value.from && change.value.from.username,
        text: '',
        timestamp: Date.now()
      };
    }
  }

  return null;
}

/**
 * Normalizar classificação para snake_case consistente.
 * Aceita tanto o schema do intentClassifier (camelCase) quanto o do OpenAI (snake_case).
 */
function normalizeClassification(classification) {
  if (!classification) {
    return { lead_temperature: 'cold', interest_area: 'unknown', should_handoff: false };
  }
  return {
    lead_temperature: classification.lead_temperature || classification.temperature || 'cold',
    interest_area: classification.interest_area || classification.interestArea || 'unknown',
    should_handoff: classification.should_handoff ?? classification.shouldHandoff ?? false,
    reasoning: classification.reasoning || ''
  };
}

/**
 * Roteamento: atualizar estágio e encaminhar se necessário
 */
async function handleRouting(leadId, classification, aiResponse) {

  const { lead_temperature, interest_area, should_handoff } = classification;

  // Se handoff necessário (lead quente/morno qualificado)
  if (should_handoff && (lead_temperature === 'hot' || lead_temperature === 'warm')) {
    const operatorKey = INTEREST_TO_OPERATOR[interest_area] || 'andrea';
    const operator = OPERATORS[operatorKey];

    await kommo.assignLead(leadId, operator.userId, operator.stage);
    await kommo.addHandoffNote(leadId, {
      operatorName: operator.name,
      classification: lead_temperature,
      conversationSummary: aiResponse.substring(0, 300)
    });

    return {
      action: 'handoff',
      assignedTo: operator.name,
      stage: operator.stage,
      handoffMessage: `Vou te conectar com ${operator.name}, que é especialista em ${operator.areaLabel} e vai poder te ajudar melhor! Ela vai entrar em contato em breve.`
    };
  }

  // Atualizar estágio baseado na temperatura
  const stageName = TEMPERATURE_TO_STAGE[lead_temperature] || 'Novo Seguidor';
  await kommo.updateLeadStage(leadId, stageName);

  return {
    action: 'continue',
    stage: stageName,
    temperature: lead_temperature
  };
}

/**
 * Enviar resposta via Instagram Graph API
 */
async function sendInstagramReply(recipientId, message) {
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!accessToken) return;

  const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/me/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: message },
        access_token: accessToken
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[INSTAGRAM] Falha ao enviar resposta: ${response.status} — ${text}`);
    }
  } catch (error) {
    console.error('[INSTAGRAM] Erro de rede ao enviar resposta:', error.message);
  }
}

module.exports = { handleWebhook, handleVerification };
