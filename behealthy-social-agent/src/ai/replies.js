/**
 * Gerador de Respostas IA — Agente SDR Be Healthy
 *
 * Usa OpenAI GPT-4o para gerar respostas seguindo:
 *   - Manual oficial Be Healthy (SPIN, tom, regras)
 *   - Contexto da conversa (memória)
 *   - Classificação do lead
 *   - Limites éticos (nunca dar orientação médica)
 *
 * Tom: Dr. Felipe — masculino, seguro, autoridade tranquila,
 * profissional, direto, educado. Sem emojis exagerados.
 */

const fs = require('fs');
const path = require('path');
const { formatContextForAI } = require('../services/conversationMemory');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Cache do manual
let manualCache = null;

// Cache de histórico por lead
const conversationHistory = new Map();
const MAX_HISTORY = 20;

function loadManual() {
  if (manualCache) return manualCache;
  const manualPath = path.join(__dirname, '..', '..', 'knowledge', 'manual-behealthy.md');
  try {
    manualCache = fs.readFileSync(manualPath, 'utf8');
  } catch {
    manualCache = '';
  }
  return manualCache;
}

const SYSTEM_PROMPT = `Você é o agente SDR digital do Instituto Be Healthy, operando no Instagram do @dr.felipefranca.

IDENTIDADE E TOM:
- Você representa o Dr. Felipe.
- Tom: masculino, seguro, autoridade tranquila, profissional, direto, educado.
- Use linguagem natural: "Perfeito.", "Entendi.", "Me conta uma coisa."
- NUNCA use: emojis exagerados, corações, tom infantil, "amoooor", "querido(a)".
- Pode usar no máximo 1 emoji discreto por mensagem quando apropriado.
- Fale em português brasileiro.
- Use o nome da pessoa sempre que possível.

SEU PAPEL:
1. Acolher e engajar seguidores e leads do Instagram
2. Seguir o método SPIN de vendas:
   S (Situação): "Como está sua relação com [tema] hoje?"
   P (Problema): "O que mais te incomoda ultimamente?"
   I (Implicação): "Isso tem impactado sua autoestima / rotina / vida social?"
   N (Necessidade): "Se pudesse mudar uma coisa agora, o que seria?"
3. Qualificar leads usando sinais de compra
4. Conduzir a conversa até o agendamento da consulta
5. Encaminhar para equipe humana quando necessário

FLUXO DA CONVERSA:
1. Saudação personalizada (conectada ao contexto)
2. Descoberta do problema (SPIN)
3. Qualificação
4. Convite para consulta
5. Encaminhamento humano se necessário

ABERTURA PADRÃO (quando a pessoa inicia conversa):
"Me conta uma coisa: o que você gostaria de melhorar hoje — saúde, estética ou emagrecimento?"

LEAD RECORRENTE (quando a pessoa volta depois de dias):
NUNCA diga "Olá, como posso ajudar?"
SEMPRE retome de onde parou: "Você chegou a conseguir ver os horários para a consulta que comentamos?"

REGRAS ABSOLUTAS — NUNCA:
- Dar orientação médica ou diagnósticos
- Prescrever medicamentos ou tratamentos
- Analisar exames ou resultados laboratoriais
- Prometer resultados específicos de procedimentos
- Agendar consultas diretamente
- Compartilhar informações de outros pacientes
- Mencionar PMMA, bioplastia, polimetilmetacrilato ou biopolímeros
- Usar "Agende sua consulta" — sempre ofereça 2 horários específicos

FRASE-CHAVE para perguntas técnicas/médicas:
"Essa é exatamente uma das coisas que avaliamos na consulta, de forma personalizada para o seu caso."

FECHAMENTO — sempre ofereça 2 horários com escassez:
"Tenho disponível [DIA 1] ou [DIA 2]. Qual encaixa melhor na sua semana?"

SINAIS DE COMPRA (quando detectados, avance para fechamento):
- Pergunta sobre preço/valor
- Pergunta sobre como funciona
- Pergunta sobre resultados
- Pergunta sobre consulta/agendamento
- Pergunta sobre como começar
- Pede agendamento
- Pergunta sobre parcelamento
- Pergunta sobre recuperação/pós-procedimento

ÁREAS DE ATENDIMENTO:
- Andrea: emagrecimento, saúde, hormônios, consultas médicas
- Thais: estética, procedimentos, remodelação, celulite

PRODUTOS PRINCIPAIS (use para contextualizar, não para vender diretamente):
- Consulta Diagnóstica: R$ 800 (avaliação completa + bioimpedância + plano personalizado)
- MEP-6X: protocolo de emagrecimento em 6 fases
- Fast Slim: tirzepatida avulsa (a partir de R$ 250)
- Consulta Start: R$ 500 (entrada acessível)
- NutriSlim: R$ 1.750 (5 consultas nutricionais)
- Protocolo ATENA/APOLO: remodelação corporal
- GoldIncision: tratamento de celulite
- Modulação hormonal e implantes
- Soroterapia (diversas bolsas)

OBJEÇÕES COMUNS E COMO RESPONDER:
- "Está caro" → "Em 1 hora você sai com plano exclusivo. Quanto já investiu em soluções que não funcionaram?"
- "Vou pensar" → "O que te trava? Se for dúvida, posso responder agora."
- "Preciso ver com marido/esposa" → "Tem alguma dúvida que eu possa esclarecer para facilitar essa conversa?"
- "Já fiz em outro lugar e não funcionou" → "Aqui o médico investiga a causa raiz. Posso te mostrar resultados?"
- "Tenho medo" → "Esse medo é totalmente compreensível. A avaliação existe para você conhecer o processo sem compromisso."

Ao final de CADA resposta, inclua um bloco de classificação JSON:
<classification>
{
  "lead_temperature": "hot|warm|cold|unqualified",
  "interest_area": "weight_loss|aesthetics|hormonal|general|unknown",
  "should_handoff": true|false,
  "reasoning": "explicação breve"
}
</classification>`;

/**
 * Gerar resposta para mensagem do Instagram.
 */
async function generateReply({ leadId, message, contactName, eventType, conversationContext, classification }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const model = process.env.OPENAI_MODEL || 'gpt-4o';
  const manual = loadManual();

  // Construir mensagens para a IA
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  // Adicionar manual relevante
  if (manual) {
    const relevantSection = getRelevantManualSection(manual, message, classification);
    messages.push({ role: 'system', content: `Material de referência:\n${relevantSection}` });
  }

  // Adicionar contexto da conversa
  if (conversationContext) {
    const contextText = formatContextForAI(conversationContext);
    messages.push({ role: 'system', content: `Contexto do lead:\n${contextText}` });
  }

  // Adicionar classificação pré-computada
  if (classification) {
    const classInfo = [
      `Classificação pré-análise:`,
      `- Tipo: ${classification.leadType}`,
      `- Temperatura: ${classification.temperature}`,
      `- Área de interesse: ${classification.interestArea}`,
      `- Sinais de compra: ${classification.buyingSignals.join(', ') || 'nenhum'}`,
      `- É saudação: ${classification.isGreeting ? 'sim' : 'não'}`,
      `- Novo seguidor: ${classification.isNewFollower ? 'sim' : 'não'}`
    ].join('\n');
    messages.push({ role: 'system', content: classInfo });
  }

  // Adicionar histórico de conversa (cache local)
  const history = getHistory(leadId);
  messages.push(...history);

  // Adicionar mensagem atual
  const userContent = buildUserMessage(eventType, contactName, message);
  messages.push({ role: 'user', content: userContent });

  // Chamar OpenAI
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OPENAI] Erro (${response.status}): ${errorText}`);

    // Fallback: resposta determinística
    return {
      response: getFallbackResponse(eventType, contactName),
      classification: {
        lead_temperature: classification ? (classification.temperature || classification.lead_temperature || 'cold') : 'cold',
        interest_area: classification ? (classification.interestArea || classification.interest_area || 'unknown') : 'unknown',
        should_handoff: false,
        reasoning: 'Fallback — erro na API OpenAI'
      }
    };
  }

  const data = await response.json();
  const aiResponse = data.choices[0].message.content;

  // Atualizar histórico
  updateHistory(leadId, 'user', userContent);
  updateHistory(leadId, 'assistant', aiResponse);

  // Parsear classificação da resposta
  const aiClassification = parseClassification(aiResponse);
  const cleanResponse = aiResponse.replace(/<classification>[\s\S]*?<\/classification>/, '').trim();

  return {
    response: cleanResponse,
    classification: aiClassification,
    tokensUsed: data.usage ? data.usage.total_tokens : 0
  };
}

/**
 * Selecionar seção relevante do manual baseado no contexto.
 */
function getRelevantManualSection(manual, message, classification) {
  const sections = manual.split('\n## ');
  const lowerMsg = (message || '').toLowerCase();
  const area = classification ? classification.interestArea : 'unknown';

  const relevanceMap = {
    'regras de ouro': ['atendimento', 'regra', 'como falar'],
    'perfis disc': ['disc', 'perfil', 'comportamento'],
    'qualificação': ['qualificar', 'lead', 'classificar'],
    'sinais de compra': ['preço', 'valor', 'agendar', 'quanto', 'parcela', 'horário'],
    'funil': ['abertura', 'spin', 'fechamento', 'follow-up'],
    'consulta diagnóstica': ['consulta', 'diagnóstica', 'r$ 800', 'bioimpedância'],
    'emagrecimento': ['emagrecer', 'peso', 'mep', 'gordo'],
    'fast slim': ['tirzepatida', 'fast slim', 'dose'],
    'nutrislim': ['nutri', 'nutricional', 'alimentação'],
    'remodelação glútea': ['glúteo', 'bumbum', 'atena'],
    'celulite': ['celulite', 'goldincision'],
    'modulação hormonal': ['hormônio', 'hormonal', 'libido', 'menopausa', 'implante'],
    'remodelação corporal': ['corpo', 'apolo', 'braço', 'abdome'],
    'protocolos corporais': ['lipo', 'estria', 'drenagem', 'lipedema'],
    'soroterapia': ['soro', 'vitamina', 'energia', 'imunidade'],
    'objeções': ['caro', 'medo', 'pensar', 'pesquisar', 'arrepender', 'outro médico']
  };

  const matched = [];

  for (const [sectionKey, keywords] of Object.entries(relevanceMap)) {
    if (keywords.some(kw => lowerMsg.includes(kw))) {
      const section = sections.find(s => s.toLowerCase().includes(sectionKey));
      if (section) matched.push('## ' + section);
    }
  }

  // Sempre incluir regras éticas
  const ethicsSection = sections.find(s => s.toLowerCase().includes('limites éticos') || s.toLowerCase().includes('regras de ouro'));
  if (ethicsSection && !matched.some(s => s.includes(ethicsSection.substring(0, 30)))) {
    matched.push('## ' + ethicsSection);
  }

  if (matched.length > 0) {
    // Limitar a 3000 chars para economizar tokens
    return matched.join('\n\n').substring(0, 3000);
  }

  // Fallback: primeiros 2000 chars do manual
  return manual.substring(0, 2000);
}

function buildUserMessage(eventType, contactName, message) {
  const prefix = contactName ? `${contactName}` : 'Usuário';

  switch (eventType) {
    case 'follow':
      return `[Novo seguidor] ${prefix} começou a seguir o perfil.`;
    case 'comment':
      return `[Comentário] ${prefix}: ${message}`;
    case 'dm':
    default:
      return `[DM] ${prefix}: ${message}`;
  }
}

function getFallbackResponse(eventType, contactName) {
  const name = contactName ? ` ${contactName}` : '';

  if (eventType === 'follow') {
    return `Que bom ter você por aqui${name}! Me conta uma coisa: o que você gostaria de melhorar hoje — saúde, estética ou emagrecimento?`;
  }

  return `Oi${name}! Me conta uma coisa: o que te trouxe aqui? Estou à disposição para te ajudar.`;
}

// --- Histórico local ---

function getHistory(leadId) {
  return conversationHistory.get(String(leadId)) || [];
}

function updateHistory(leadId, role, content) {
  const key = String(leadId);
  const history = conversationHistory.get(key) || [];
  history.push({ role, content });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  conversationHistory.set(key, history);
}

function clearHistory(leadId) {
  conversationHistory.delete(String(leadId));
}

function parseClassification(text) {
  const match = text.match(/<classification>\s*(\{[\s\S]*?\})\s*<\/classification>/);

  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // fall through
    }
  }

  return {
    lead_temperature: 'cold',
    interest_area: 'unknown',
    should_handoff: false,
    reasoning: 'Classificação não extraída da resposta IA'
  };
}

module.exports = { generateReply, clearHistory, parseClassification };
