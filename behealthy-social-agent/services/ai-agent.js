/**
 * AI Conversation Agent Service
 *
 * OpenAI-powered agent that:
 * - Uses the clinic manual as knowledge base
 * - Follows SPIN conversation method
 * - Classifies leads (Cold, Warm, Hot, Unqualified)
 * - Never gives medical advice, prescribes treatment, or analyzes exams
 * - Redirects technical questions to consultation
 *
 * Token optimization:
 * - Manual loaded once and cached
 * - Lead history cached per session
 * - AI reasoning limited to 3 iterations
 */

const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Cache: manual loaded once
let manualCache = null;

// Cache: lead conversation history (keyed by lead ID)
const leadHistoryCache = new Map();

const MAX_REASONING_ITERATIONS = 3;

function loadManual() {
  if (manualCache) return manualCache;

  const manualPath = path.join(__dirname, '..', 'knowledge', 'manual-behealthy.md');
  manualCache = fs.readFileSync(manualPath, 'utf8');
  return manualCache;
}

/**
 * Load only the relevant section of the manual for the current context.
 * Reduces token consumption by not sending the entire manual each time.
 */
function getRelevantManualSection(context) {
  const manual = loadManual();
  const sections = manual.split('\n## ');

  const contextLower = (context || '').toLowerCase();

  const relevanceMap = {
    'tom de comunicação': ['saudação', 'olá', 'oi', 'bom dia', 'greeting', 'tone'],
    'método spin': ['pergunta', 'situação', 'problema', 'spin', 'qualification'],
    'qualificação de leads': ['interesse', 'agendar', 'preço', 'valor', 'classify'],
    'tratamento de objeções': ['caro', 'medo', 'pensar', 'pesquisar', 'objection'],
    'limites éticos': ['médic', 'tratamento', 'exame', 'diagnóstico', 'prescrição', 'ethics'],
    'áreas de atendimento': ['emagrecimento', 'estética', 'andrea', 'thais', 'handoff'],
    'fluxo de handoff': ['transferir', 'encaminhar', 'especialista', 'handoff']
  };

  const relevantSections = [];
  for (const [sectionKey, keywords] of Object.entries(relevanceMap)) {
    if (keywords.some(kw => contextLower.includes(kw))) {
      const section = sections.find(s => s.toLowerCase().includes(sectionKey));
      if (section) relevantSections.push('## ' + section);
    }
  }

  // Always include ethics section
  const ethicsSection = sections.find(s => s.toLowerCase().includes('limites éticos'));
  if (ethicsSection && !relevantSections.some(s => s.includes('Limites Éticos'))) {
    relevantSections.push('## ' + ethicsSection);
  }

  return relevantSections.length > 0
    ? relevantSections.join('\n\n')
    : manual.substring(0, 2000); // Fallback: first 2000 chars
}

function getLeadHistory(leadId) {
  return leadHistoryCache.get(String(leadId)) || [];
}

function updateLeadHistory(leadId, role, content) {
  const key = String(leadId);
  const history = leadHistoryCache.get(key) || [];
  history.push({ role, content });

  // Keep history manageable (last 20 messages)
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  leadHistoryCache.set(key, history);
}

const SYSTEM_PROMPT = `You are an AI assistant for Instituto Be Healthy, operating on the Instagram profile @dr.felipefranca.

Your role:
- Welcome and engage Instagram followers and leads
- Follow the SPIN sales methodology (Situation, Problem, Implication, Need-Payoff)
- Qualify leads as: Hot, Warm, Cold, or Unqualified
- Be empathetic, professional, and welcoming
- Speak in Brazilian Portuguese

STRICT RULES — You must NEVER:
- Give medical advice or diagnoses
- Prescribe medications or treatments
- Analyze medical exams or lab results
- Promise specific procedure outcomes
- Schedule appointments directly
- Share other patients' information

When asked medical questions, redirect to an in-person consultation:
"Essa é uma pergunta muito importante! Para te dar a melhor orientação, seria ideal agendar uma consulta com o Dr. Felipe."

After each response, output a JSON classification block:
<classification>
{
  "lead_temperature": "hot|warm|cold|unqualified",
  "interest_area": "weight_loss|aesthetics|general|unknown",
  "should_handoff": true|false,
  "reasoning": "brief explanation"
}
</classification>`;

/**
 * Process a message from an Instagram lead.
 * Returns the AI response and lead classification.
 */
async function processMessage({ leadId, message, contactName, eventType }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const relevantManual = getRelevantManualSection(message);
  const history = getLeadHistory(leadId);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `Reference material:\n${relevantManual}` }
  ];

  // Add conversation history
  messages.push(...history);

  // Add current message
  const userContent = contactName
    ? `[${eventType || 'dm'}] ${contactName}: ${message}`
    : `[${eventType || 'dm'}]: ${message}`;

  messages.push({ role: 'user', content: userContent });

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages,
      max_tokens: 500,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const aiResponse = data.choices[0].message.content;

  // Update history cache
  updateLeadHistory(leadId, 'user', userContent);
  updateLeadHistory(leadId, 'assistant', aiResponse);

  // Parse classification
  const classification = parseClassification(aiResponse);
  const cleanResponse = aiResponse.replace(/<classification>[\s\S]*?<\/classification>/, '').trim();

  return {
    response: cleanResponse,
    classification,
    tokensUsed: data.usage ? data.usage.total_tokens : 0
  };
}

function parseClassification(text) {
  const match = text.match(/<classification>\s*(\{[\s\S]*?\})\s*<\/classification>/);

  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {
      // Fall through to default
    }
  }

  return {
    lead_temperature: 'cold',
    interest_area: 'unknown',
    should_handoff: false,
    reasoning: 'Classification not extracted from AI response'
  };
}

/**
 * Clear cached history for a lead (e.g., after handoff).
 */
function clearLeadHistory(leadId) {
  leadHistoryCache.delete(String(leadId));
}

module.exports = {
  processMessage,
  parseClassification,
  clearLeadHistory,
  getLeadHistory
};
