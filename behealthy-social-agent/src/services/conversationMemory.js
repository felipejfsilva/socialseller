/**
 * Memória de Conversa
 *
 * Gerencia o contexto de conversas para que o agente continue
 * de onde parou, mesmo dias depois.
 *
 * Fontes de memória:
 *   1. Cache em memória (sessão atual)
 *   2. Notas do Kommo (histórico persistente)
 *
 * Quando uma nova mensagem chega:
 *   1. Verificar cache local
 *   2. Se não tiver, buscar notas do Kommo
 *   3. Reconstruir contexto para a IA
 */

const kommo = require('./kommo');

// Cache em memória: Map<leadId, ConversationContext>
const conversationCache = new Map();

const MAX_HISTORY_TURNS = 10;
const MAX_CACHE_SIZE = 500;

/**
 * Carregar contexto completo da conversa de um lead.
 *
 * Retorna:
 * {
 *   isReturningLead: boolean,
 *   currentStage: string,
 *   conversationHistory: [{role, content, timestamp}],
 *   lastTopic: string,
 *   leadClassification: string,
 *   summary: string
 * }
 */
async function loadConversationContext(leadId, contactId) {
  const key = String(leadId);

  // 1. Verificar cache
  if (conversationCache.has(key)) {
    const cached = conversationCache.get(key);
    cached.isReturningLead = true;
    return cached;
  }

  // 2. Buscar dados do lead e notas do Kommo
  const [leadDetails, notes] = await Promise.all([
    kommo.getLeadDetails(leadId).catch(() => null),
    kommo.getLeadNotes(leadId, 20).catch(() => [])
  ]);

  // 3. Reconstruir contexto
  const context = {
    isReturningLead: notes.length > 0,
    currentStage: extractStageName(leadDetails),
    conversationHistory: extractConversationHistory(notes),
    lastTopic: extractLastTopic(notes),
    leadClassification: extractClassification(notes),
    summary: buildSummary(notes)
  };

  // Salvar no cache
  saveToCache(key, context);

  return context;
}

/**
 * Salvar um turno de conversa no cache.
 */
function saveConversationTurn(leadId, { userMessage, aiResponse, classification, timestamp }) {
  const key = String(leadId);
  let context = conversationCache.get(key) || {
    isReturningLead: false,
    currentStage: 'Novo Seguidor',
    conversationHistory: [],
    lastTopic: '',
    leadClassification: 'cold',
    summary: ''
  };

  context.conversationHistory.push(
    { role: 'user', content: userMessage, timestamp },
    { role: 'assistant', content: aiResponse, timestamp }
  );

  // Manter histórico gerenciável
  if (context.conversationHistory.length > MAX_HISTORY_TURNS * 2) {
    context.conversationHistory = context.conversationHistory.slice(-MAX_HISTORY_TURNS * 2);
  }

  // Atualizar classificação se fornecida
  if (classification) {
    context.leadClassification = classification.lead_temperature || context.leadClassification;
    context.lastTopic = classification.interest_area || context.lastTopic;
  }

  saveToCache(key, context);
}

/**
 * Limpar cache de um lead (ex: após handoff).
 */
function clearConversation(leadId) {
  conversationCache.delete(String(leadId));
}

/**
 * Formatar contexto para inclusão no prompt da IA.
 */
function formatContextForAI(context) {
  if (!context || !context.isReturningLead) {
    return 'Este é um novo contato. Não há histórico anterior.';
  }

  const parts = [];

  parts.push(`LEAD RECORRENTE — já interagiu antes.`);
  parts.push(`Estágio atual no pipeline: ${context.currentStage}`);

  if (context.lastTopic) {
    parts.push(`Último assunto discutido: ${context.lastTopic}`);
  }

  if (context.leadClassification) {
    parts.push(`Classificação atual: ${context.leadClassification}`);
  }

  if (context.summary) {
    parts.push(`Resumo do histórico: ${context.summary}`);
  }

  // Incluir últimas mensagens para continuidade
  if (context.conversationHistory.length > 0) {
    parts.push('\nÚltimas mensagens:');
    const recent = context.conversationHistory.slice(-6);
    for (const msg of recent) {
      const label = msg.role === 'user' ? 'Lead' : 'Agente';
      parts.push(`  ${label}: ${msg.content.substring(0, 150)}`);
    }
  }

  return parts.join('\n');
}

// --- Funções auxiliares ---

function extractStageName(leadDetails) {
  if (!leadDetails) return 'Novo Seguidor';

  // Mapear status_id para nome do estágio
  const stageMap = {
    [process.env.KOMMO_STATUS_NOVO_SEGUIDOR]: 'Novo Seguidor',
    [process.env.KOMMO_STATUS_INTERACAO_INICIAL]: 'Interação Inicial',
    [process.env.KOMMO_STATUS_QUALIFICACAO]: 'Qualificação',
    [process.env.KOMMO_STATUS_INTERESSE_REAL]: 'Interesse Real',
    [process.env.KOMMO_STATUS_ANDREA]: 'Encaminhado Andrea',
    [process.env.KOMMO_STATUS_THAIS]: 'Encaminhado Thais',
    [process.env.KOMMO_STATUS_CONSULTA_AGENDADA]: 'Consulta Agendada'
  };

  return stageMap[String(leadDetails.status_id)] || 'Novo Seguidor';
}

function extractConversationHistory(notes) {
  if (!notes || notes.length === 0) return [];

  const history = [];

  for (const note of notes.reverse()) {
    const text = note.params && note.params.text;
    if (!text) continue;

    // Extrair mensagens do lead e respostas da IA das notas
    const msgMatch = text.match(/Mensagem:\s*(.+)/);
    const respMatch = text.match(/Resposta IA:\s*(.+?)(?:\.\.\.|$)/);

    if (msgMatch) {
      history.push({
        role: 'user',
        content: msgMatch[1].trim(),
        timestamp: note.created_at ? new Date(note.created_at * 1000).toISOString() : null
      });
    }

    if (respMatch) {
      history.push({
        role: 'assistant',
        content: respMatch[1].trim(),
        timestamp: note.created_at ? new Date(note.created_at * 1000).toISOString() : null
      });
    }
  }

  return history.slice(-MAX_HISTORY_TURNS * 2);
}

function extractLastTopic(notes) {
  if (!notes || notes.length === 0) return '';

  for (const note of notes) {
    const text = note.params && note.params.text;
    if (!text) continue;

    // Procurar menções a temas
    const topicKeywords = {
      'emagrecimento': 'emagrecimento',
      'emagrecer': 'emagrecimento',
      'peso': 'emagrecimento',
      'tirzepatida': 'emagrecimento',
      'estética': 'estética',
      'celulite': 'estética',
      'glúteo': 'estética',
      'remodelação': 'estética',
      'hormonal': 'hormonal',
      'hormônio': 'hormonal',
      'libido': 'hormonal',
      'consulta': 'consulta',
      'agendar': 'consulta'
    };

    const lowerText = text.toLowerCase();
    for (const [keyword, topic] of Object.entries(topicKeywords)) {
      if (lowerText.includes(keyword)) return topic;
    }
  }

  return '';
}

function extractClassification(notes) {
  if (!notes || notes.length === 0) return 'cold';

  for (const note of notes) {
    const text = note.params && note.params.text;
    if (!text) continue;

    const tempMatch = text.match(/Temperatura:\s*(hot|warm|cold|unqualified)/i);
    if (tempMatch) return tempMatch[1].toLowerCase();
  }

  return 'cold';
}

function buildSummary(notes) {
  if (!notes || notes.length === 0) return '';

  const summaryParts = [];

  for (const note of notes.slice(0, 5)) {
    const text = note.params && note.params.text;
    if (!text) continue;

    const resumoMatch = text.match(/Resumo:\s*(.+)/);
    if (resumoMatch) {
      summaryParts.push(resumoMatch[1].trim());
    }
  }

  return summaryParts.join(' | ').substring(0, 500);
}

function saveToCache(key, context) {
  // Limitar tamanho do cache
  if (conversationCache.size >= MAX_CACHE_SIZE) {
    const firstKey = conversationCache.keys().next().value;
    conversationCache.delete(firstKey);
  }
  conversationCache.set(key, context);
}

module.exports = {
  loadConversationContext,
  saveConversationTurn,
  clearConversation,
  formatContextForAI
};
