/**
 * Kommo CRM — Lead Management Service
 *
 * Handles lead creation, updates, stage progression, and duplicate prevention.
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.KOMMO_BASE_URL || 'https://felipebhcrm.kommo.com/api/v4';
const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

function loadPipelineConfig() {
  const configPath = path.join(__dirname, '..', 'config', 'pipeline.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function getStatusId(stageName) {
  const config = loadPipelineConfig();
  const status = config.pipeline.statuses.find(s => s.name === stageName);
  if (!status || !status.status_id) {
    throw new Error(`Status "${stageName}" not found or not configured. Run setup first.`);
  }
  return status.status_id;
}

function getPipelineId() {
  const config = loadPipelineConfig();
  if (!config.pipeline.pipeline_id) {
    throw new Error('Pipeline not configured. Run setup first.');
  }
  return config.pipeline.pipeline_id;
}

/**
 * Search for existing leads by contact ID to prevent duplicates.
 */
async function findLeadByContact(contactId) {
  const url = `${BASE_URL}/leads?filter[contacts]=${contactId}`;
  const response = await fetch(url, { method: 'GET', headers });

  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Lead search failed: ${response.status}`);

  const data = await response.json();
  const pipelineId = getPipelineId();

  if (data._embedded && data._embedded.leads) {
    const lead = data._embedded.leads.find(l => l.pipeline_id === pipelineId);
    if (lead) return lead;
  }
  return null;
}

/**
 * Create a new lead in the SOCIAL SELLING INSTAGRAM pipeline.
 * Stage defaults to "Novo Seguidor".
 */
async function createLead({ contactId, name, instagram_username }) {
  const pipelineId = getPipelineId();
  const statusId = getStatusId('Novo Seguidor');

  const body = [
    {
      name: `Instagram - ${name || instagram_username || 'Lead'}`,
      pipeline_id: pipelineId,
      status_id: statusId,
      _embedded: {
        contacts: [{ id: contactId }],
        tags: [{ name: 'instagram' }, { name: 'ai-agent' }]
      }
    }
  ];

  const response = await fetch(`${BASE_URL}/leads`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lead creation failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.leads[0];
}

/**
 * Update lead stage in the pipeline.
 */
async function updateLeadStage(leadId, stageName) {
  const statusId = getStatusId(stageName);

  const body = [
    {
      id: leadId,
      status_id: statusId
    }
  ];

  const response = await fetch(`${BASE_URL}/leads`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lead update failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.leads[0];
}

/**
 * Assign lead to a responsible user and update stage.
 */
async function assignLead(leadId, responsibleUserId, stageName) {
  const statusId = getStatusId(stageName);

  const body = [
    {
      id: leadId,
      status_id: statusId,
      responsible_user_id: responsibleUserId
    }
  ];

  const response = await fetch(`${BASE_URL}/leads`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lead assignment failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.leads[0];
}

/**
 * Get or create lead for a contact — prevents duplicates.
 */
async function getOrCreateLead({ contactId, name, instagram_username }) {
  const existing = await findLeadByContact(contactId);

  if (existing) {
    return { lead: existing, created: false };
  }

  const newLead = await createLead({ contactId, name, instagram_username });
  return { lead: newLead, created: true };
}

module.exports = {
  getStatusId,
  getPipelineId,
  findLeadByContact,
  createLead,
  updateLeadStage,
  assignLead,
  getOrCreateLead
};
