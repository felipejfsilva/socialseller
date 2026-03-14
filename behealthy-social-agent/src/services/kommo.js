/**
 * Kommo CRM — Serviço Unificado
 *
 * Agrupa todas as operações do Kommo em uma única interface:
 * - Contatos: buscar, criar, deduplicar
 * - Leads: buscar, criar, atualizar estágio, atribuir operador
 * - Notas: registrar conversas, handoffs, eventos
 * - Histórico: carregar notas anteriores do lead
 *
 * Usa as variáveis de ambiente:
 *   KOMMO_BASE_URL, KOMMO_ACCESS_TOKEN, KOMMO_PIPELINE_ID,
 *   KOMMO_STATUS_NOVO_SEGUIDOR, etc.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.KOMMO_BASE_URL || 'https://felipebhcrm.kommo.com/api/v4';

function getHeaders() {
  return {
    'Authorization': `Bearer ${process.env.KOMMO_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

// --- Pipeline config ---

let pipelineConfigCache = null;

function loadPipelineConfig() {
  if (pipelineConfigCache) return pipelineConfigCache;
  const configPath = path.join(__dirname, '..', '..', 'config', 'pipeline.json');
  try {
    pipelineConfigCache = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    pipelineConfigCache = null;
  }
  return pipelineConfigCache;
}

function getPipelineId() {
  // Prefer env var, fallback to config file
  if (process.env.KOMMO_PIPELINE_ID) return Number(process.env.KOMMO_PIPELINE_ID);
  const config = loadPipelineConfig();
  if (config && config.pipeline && config.pipeline.pipeline_id) {
    return config.pipeline.pipeline_id;
  }
  throw new Error('KOMMO_PIPELINE_ID não configurado. Execute npm run setup primeiro.');
}

function getStatusId(stageName) {
  // Map stage names to env var names
  const stageToEnv = {
    'Novo Seguidor': 'KOMMO_STATUS_NOVO_SEGUIDOR',
    'Interação Inicial': 'KOMMO_STATUS_INTERACAO_INICIAL',
    'Qualificação': 'KOMMO_STATUS_QUALIFICACAO',
    'Interesse Real': 'KOMMO_STATUS_INTERESSE_REAL',
    'Encaminhado Andrea': 'KOMMO_STATUS_ANDREA',
    'Encaminhado Thais': 'KOMMO_STATUS_THAIS',
    'Consulta Agendada': 'KOMMO_STATUS_CONSULTA_AGENDADA'
  };

  const envVar = stageToEnv[stageName];
  if (envVar && process.env[envVar]) return Number(process.env[envVar]);

  // Fallback to pipeline.json
  const config = loadPipelineConfig();
  if (config && config.pipeline && config.pipeline.statuses) {
    const status = config.pipeline.statuses.find(s => s.name === stageName);
    if (status && status.status_id) return status.status_id;
  }

  throw new Error(`Status "${stageName}" não encontrado. Execute npm run setup.`);
}

// --- Contatos ---

async function findContact(query) {
  const url = `${BASE_URL}/contacts?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { method: 'GET', headers: getHeaders() });

  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Busca de contato falhou: ${response.status}`);

  const data = await response.json();
  if (data._embedded && data._embedded.contacts && data._embedded.contacts.length > 0) {
    return data._embedded.contacts[0];
  }
  return null;
}

async function createContact({ name, instagram_username, phone }) {
  const customFields = [];

  if (instagram_username) {
    customFields.push({
      field_code: 'IM',
      values: [{ value: instagram_username, enum_code: 'OTHER' }]
    });
  }

  if (phone) {
    customFields.push({
      field_code: 'PHONE',
      values: [{ value: phone }]
    });
  }

  const body = [{
    name: name || instagram_username || 'Instagram Lead',
    custom_fields_values: customFields,
    _embedded: {
      tags: [{ name: 'instagram' }, { name: 'social-selling' }]
    }
  }];

  const response = await fetch(`${BASE_URL}/contacts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Criação de contato falhou (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.contacts[0];
}

async function getOrCreateContact({ name, instagram_username, phone }) {
  // Deduplicate: search by instagram, phone, name
  const queries = [instagram_username, phone, name].filter(Boolean);
  for (const query of queries) {
    const existing = await findContact(query);
    if (existing) return { contact: existing, created: false };
  }

  const newContact = await createContact({ name, instagram_username, phone });
  return { contact: newContact, created: true };
}

// --- Leads ---

async function findLeadByContact(contactId) {
  const url = `${BASE_URL}/leads?filter[contacts]=${contactId}`;
  const response = await fetch(url, { method: 'GET', headers: getHeaders() });

  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Busca de lead falhou: ${response.status}`);

  const data = await response.json();
  const pipelineId = getPipelineId();

  if (data._embedded && data._embedded.leads) {
    const lead = data._embedded.leads.find(l => l.pipeline_id === pipelineId);
    if (lead) return lead;
  }
  return null;
}

async function createLead({ contactId, name, instagram_username }) {
  const pipelineId = getPipelineId();
  const statusId = getStatusId('Novo Seguidor');

  const body = [{
    name: `Instagram - ${name || instagram_username || 'Lead'}`,
    pipeline_id: pipelineId,
    status_id: statusId,
    _embedded: {
      contacts: [{ id: contactId }],
      tags: [{ name: 'instagram' }, { name: 'ai-agent' }]
    }
  }];

  const response = await fetch(`${BASE_URL}/leads`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Criação de lead falhou (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.leads[0];
}

async function getOrCreateLead({ contactId, name, instagram_username }) {
  const existing = await findLeadByContact(contactId);
  if (existing) return { lead: existing, created: false };

  const newLead = await createLead({ contactId, name, instagram_username });
  return { lead: newLead, created: true };
}

async function updateLeadStage(leadId, stageName) {
  const statusId = getStatusId(stageName);

  const response = await fetch(`${BASE_URL}/leads`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify([{ id: leadId, status_id: statusId }])
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Atualização de lead falhou (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.leads[0];
}

async function assignLead(leadId, responsibleUserId, stageName) {
  const statusId = getStatusId(stageName);

  const response = await fetch(`${BASE_URL}/leads`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify([{
      id: leadId,
      status_id: statusId,
      responsible_user_id: responsibleUserId
    }])
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Atribuição de lead falhou (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.leads[0];
}

// --- Notas ---

async function addLeadNote(leadId, { origin, initialMessage, summary }) {
  const noteText = [
    `Origem: ${origin || 'Instagram'}`,
    `Mensagem: ${initialMessage || 'N/A'}`,
    `Resumo: ${summary || 'Interação registrada pelo agente AI.'}`
  ].join('\n');

  const body = [{
    note_type: 'common',
    params: { text: noteText }
  }];

  const response = await fetch(`${BASE_URL}/leads/${leadId}/notes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Criação de nota falhou (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.notes[0];
}

async function addHandoffNote(leadId, { operatorName, classification, conversationSummary }) {
  const noteText = [
    'Lead qualificado automaticamente pelo agente Instagram AI.',
    `Encaminhado para: ${operatorName}`,
    `Classificação: ${classification}`,
    `Resumo: ${conversationSummary || 'Ver histórico de conversa.'}`
  ].join('\n');

  const body = [{
    note_type: 'common',
    params: { text: noteText }
  }];

  const response = await fetch(`${BASE_URL}/leads/${leadId}/notes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Nota de handoff falhou (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.notes[0];
}

async function logInstagramEvent(leadId, { eventType, content, timestamp }) {
  const labels = {
    follow: 'Novo seguidor',
    comment: 'Comentário',
    dm: 'Mensagem direta'
  };

  const noteText = [
    labels[eventType] || 'Evento Instagram',
    `Data: ${timestamp || new Date().toISOString()}`,
    content ? `Conteúdo: ${content}` : ''
  ].filter(Boolean).join('\n');

  const body = [{
    note_type: 'common',
    params: { text: noteText }
  }];

  const response = await fetch(`${BASE_URL}/leads/${leadId}/notes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[KOMMO] Falha ao registrar evento (${response.status}): ${text}`);
    return null;
  }

  const data = await response.json();
  return data._embedded.notes[0];
}

/**
 * Carregar notas do lead para reconstruir contexto de conversa.
 */
async function getLeadNotes(leadId, limit = 10) {
  const url = `${BASE_URL}/leads/${leadId}/notes?limit=${limit}&order=desc`;
  const response = await fetch(url, { method: 'GET', headers: getHeaders() });

  if (response.status === 204) return [];
  if (!response.ok) return [];

  const data = await response.json();
  if (data._embedded && data._embedded.notes) {
    return data._embedded.notes;
  }
  return [];
}

/**
 * Obter dados completos do lead (incluindo estágio).
 */
async function getLeadDetails(leadId) {
  const url = `${BASE_URL}/leads/${leadId}`;
  const response = await fetch(url, { method: 'GET', headers: getHeaders() });

  if (!response.ok) return null;
  return response.json();
}

module.exports = {
  // Contatos
  findContact,
  createContact,
  getOrCreateContact,
  // Leads
  findLeadByContact,
  createLead,
  getOrCreateLead,
  updateLeadStage,
  assignLead,
  getLeadDetails,
  // Notas
  addLeadNote,
  addHandoffNote,
  logInstagramEvent,
  getLeadNotes,
  // Config
  getPipelineId,
  getStatusId
};
