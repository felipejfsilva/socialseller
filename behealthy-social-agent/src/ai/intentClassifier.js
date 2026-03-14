/**
 * Classificador de Intenção
 *
 * Analisa mensagens do Instagram e classifica:
 *   - Tipo de lead: NOVO_LEAD, LEAD_RECORRENTE, LEAD_QUALIFICADO, LEAD_QUENTE, PACIENTE_EXISTENTE
 *   - Temperatura: hot, warm, cold, unqualified
 *   - Área de interesse: weight_loss, aesthetics, hormonal, general, unknown
 *   - Sinais de compra detectados
 *   - Necessidade de handoff
 */

// Sinais de compra — quando o lead demonstra interesse real
const BUYING_SIGNALS = [
  // Preço e pagamento
  { pattern: /pre[cç]o|valor|quanto custa|custa quanto|investimento|parcela/i, weight: 3, signal: 'pergunta_preco' },
  { pattern: /pix|cart[aã]o|pagamento|parcelar/i, weight: 3, signal: 'forma_pagamento' },

  // Agendamento
  { pattern: /agendar|marcar|horário|disponível|agenda|consulta/i, weight: 4, signal: 'interesse_agendamento' },
  { pattern: /quando posso|como fa[cç]o para|quero come[cç]ar/i, weight: 4, signal: 'intencao_inicio' },

  // Funcionamento
  { pattern: /como funciona|como [eé]|o que inclui|o que faz/i, weight: 2, signal: 'pergunta_funcionamento' },
  { pattern: /resultado|antes e depois|depoimento/i, weight: 2, signal: 'busca_prova_social' },

  // Procedimentos específicos
  { pattern: /sess[aã]o|sess[oõ]es|quantas vezes/i, weight: 2, signal: 'pergunta_sessoes' },
  { pattern: /recupera[cç][aã]o|p[oó]s|dura[cç][aã]o/i, weight: 2, signal: 'pergunta_recuperacao' },

  // Interesse direto
  { pattern: /quero|tenho interesse|me interess/i, weight: 3, signal: 'interesse_direto' },
  { pattern: /pode me ajudar|preciso de ajuda/i, weight: 2, signal: 'pedido_ajuda' },

  // Exames e preparo
  { pattern: /exame|levar exame|preparo/i, weight: 3, signal: 'preparo_consulta' },

  // Comparação (está decidindo)
  { pattern: /outro m[eé]dico|outra cl[ií]nica|diferencial|diferen[cç]a/i, weight: 2, signal: 'comparacao' },

  // Urgência
  { pattern: /urgente|r[aá]pido|o mais r[aá]pido|essa semana|amanh[aã]/i, weight: 3, signal: 'urgencia' }
];

// Palavras-chave por área de interesse
const INTEREST_KEYWORDS = {
  weight_loss: [
    'emagrecer', 'emagrecimento', 'peso', 'gordo', 'gorda', 'barriga',
    'tirzepatida', 'ozempic', 'dieta', 'metabolismo', 'mep', 'fast slim',
    'nutrislim', 'kg', 'quilos', 'sobrepeso', 'obesidade'
  ],
  aesthetics: [
    'celulite', 'glúteo', 'bumbum', 'estria', 'flacidez', 'remodelação',
    'goldincision', 'atena', 'apolo', 'lipo', 'drenagem', 'lipedema',
    'preenchedor', 'corpo', 'perna', 'coxa', 'braço', 'abdome'
  ],
  hormonal: [
    'hormônio', 'hormonal', 'menopausa', 'libido', 'testosterona',
    'implante', 'modulação', 'tpm', 'reposição', 'tireoide'
  ],
  general: [
    'saúde', 'energia', 'cansaço', 'imunidade', 'soro', 'soroterapia',
    'vitamina', 'bem-estar', 'consulta'
  ]
};

// Saudações e mensagens genéricas (não são sinais de compra)
const GREETING_PATTERNS = [
  /^(oi|ol[aá]|bom dia|boa tarde|boa noite|e a[ií]|opa|hey|hi)\s*[!?.]*$/i,
  /^(obrigad[oa]|valeu|brigad[oa])\s*[!?.]*$/i
];

/**
 * Classificar a intenção de uma mensagem.
 *
 * @param {Object} event - Evento parseado { type, senderId, senderName, text }
 * @param {Object} conversationContext - Contexto de memória do lead
 * @returns {Object} Classificação completa
 */
function classifyIntent(event, conversationContext) {
  const text = (event.text || '').trim();
  const eventType = event.type;

  // Novo seguidor sem mensagem
  if (eventType === 'follow' || !text) {
    return {
      leadType: conversationContext.isReturningLead ? 'LEAD_RECORRENTE' : 'NOVO_LEAD',
      temperature: 'cold',
      interestArea: 'unknown',
      buyingSignals: [],
      shouldHandoff: false,
      isGreeting: false,
      isNewFollower: eventType === 'follow'
    };
  }

  // Detectar sinais de compra
  const detectedSignals = [];
  let signalScore = 0;

  for (const signal of BUYING_SIGNALS) {
    if (signal.pattern.test(text)) {
      detectedSignals.push(signal.signal);
      signalScore += signal.weight;
    }
  }

  // Detectar área de interesse
  const interestArea = detectInterestArea(text, conversationContext);

  // Verificar se é apenas saudação
  const isGreeting = GREETING_PATTERNS.some(p => p.test(text));

  // Calcular temperatura
  const temperature = calculateTemperature(signalScore, detectedSignals, conversationContext, isGreeting);

  // Determinar tipo de lead
  const leadType = classifyLeadType(temperature, conversationContext, detectedSignals);

  // Verificar se precisa de handoff
  const shouldHandoff = temperature === 'hot' && detectedSignals.length >= 2;

  return {
    leadType,
    temperature,
    interestArea,
    buyingSignals: detectedSignals,
    shouldHandoff,
    isGreeting,
    isNewFollower: false,
    signalScore
  };
}

/**
 * Detectar área de interesse a partir do texto e contexto.
 */
function detectInterestArea(text, context) {
  const lowerText = text.toLowerCase();

  const scores = { weight_loss: 0, aesthetics: 0, hormonal: 0, general: 0 };

  for (const [area, keywords] of Object.entries(INTEREST_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        scores[area] += 1;
      }
    }
  }

  // Considerar contexto anterior
  if (context && context.lastTopic) {
    const topicToArea = {
      'emagrecimento': 'weight_loss',
      'estética': 'aesthetics',
      'hormonal': 'hormonal',
      'consulta': 'general'
    };
    const contextArea = topicToArea[context.lastTopic];
    if (contextArea) scores[contextArea] += 0.5;
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return 'unknown';

  return Object.keys(scores).find(k => scores[k] === maxScore);
}

/**
 * Calcular temperatura do lead.
 */
function calculateTemperature(signalScore, signals, context, isGreeting) {
  if (isGreeting && signals.length === 0) return 'cold';

  // Lead que já estava quente continua quente
  if (context && context.leadClassification === 'hot') return 'hot';

  if (signalScore >= 6) return 'hot';
  if (signalScore >= 3) return 'warm';
  if (signalScore >= 1) return 'warm';

  // Lead recorrente que voltou é pelo menos morno
  if (context && context.isReturningLead && !isGreeting) return 'warm';

  return 'cold';
}

/**
 * Classificar tipo do lead.
 */
function classifyLeadType(temperature, context, signals) {
  if (!context || !context.isReturningLead) return 'NOVO_LEAD';

  if (context.currentStage === 'Consulta Agendada') return 'PACIENTE_EXISTENTE';

  if (temperature === 'hot' || signals.length >= 2) return 'LEAD_QUENTE';

  if (temperature === 'warm') return 'LEAD_QUALIFICADO';

  return 'LEAD_RECORRENTE';
}

module.exports = { classifyIntent, BUYING_SIGNALS, INTEREST_KEYWORDS };
