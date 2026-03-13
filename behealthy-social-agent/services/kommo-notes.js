/**
 * Kommo CRM — Notes Service
 *
 * Adds conversation notes and interaction logs to leads.
 */

const BASE_URL = process.env.KOMMO_BASE_URL || 'https://felipebhcrm.kommo.com/api/v4';
const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

/**
 * Add a conversation note to a lead.
 */
async function addLeadNote(leadId, { origin, initialMessage, summary }) {
  const noteText = [
    `📱 Origem: ${origin || 'Instagram'}`,
    `💬 Mensagem inicial: ${initialMessage || 'N/A'}`,
    `📝 Resumo: ${summary || 'Interação registrada pelo agente AI.'}`
  ].join('\n');

  const body = [
    {
      note_type: 'common',
      params: {
        text: noteText
      }
    }
  ];

  const response = await fetch(`${BASE_URL}/leads/${leadId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Note creation failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.notes[0];
}

/**
 * Add a handoff note when transferring to a human operator.
 */
async function addHandoffNote(leadId, { operatorName, classification, conversationSummary }) {
  const noteText = [
    '🤖 Lead qualified automatically by Instagram AI agent.',
    `Transferred to human operator: ${operatorName}.`,
    '',
    `Classification: ${classification}`,
    `Summary: ${conversationSummary || 'See conversation history.'}`
  ].join('\n');

  const body = [
    {
      note_type: 'common',
      params: {
        text: noteText
      }
    }
  ];

  const response = await fetch(`${BASE_URL}/leads/${leadId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Handoff note failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.notes[0];
}

/**
 * Log an Instagram event (follow, comment, DM) as a note.
 */
async function logInstagramEvent(leadId, { eventType, content, timestamp }) {
  const eventLabels = {
    follow: '👤 Novo seguidor',
    comment: '💬 Comentário',
    dm: '📩 Mensagem direta'
  };

  const noteText = [
    `${eventLabels[eventType] || '📌 Evento Instagram'}`,
    `Data: ${timestamp || new Date().toISOString()}`,
    content ? `Conteúdo: ${content}` : ''
  ].filter(Boolean).join('\n');

  const body = [
    {
      note_type: 'common',
      params: {
        text: noteText
      }
    }
  ];

  const response = await fetch(`${BASE_URL}/leads/${leadId}/notes`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Event log failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.notes[0];
}

module.exports = { addLeadNote, addHandoffNote, logInstagramEvent };
