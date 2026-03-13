#!/usr/bin/env node

/**
 * Setup script for Kommo CRM Pipeline
 *
 * Checks if "SOCIAL SELLING INSTAGRAM" pipeline exists.
 * If not, creates it with all required stages.
 * Saves pipeline_id and status_id values to /config/pipeline.json.
 *
 * Usage: KOMMO_BASE_URL=... KOMMO_ACCESS_TOKEN=... node scripts/setup-pipeline.js
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.KOMMO_BASE_URL || 'https://felipebhcrm.kommo.com/api/v4';
const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Error: KOMMO_ACCESS_TOKEN environment variable is required.');
  process.exit(1);
}

const PIPELINE_NAME = 'SOCIAL SELLING INSTAGRAM';
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'pipeline.json');

const PIPELINE_STATUSES = [
  { name: 'Novo Seguidor', sort: 1, color: '#fffeb2' },
  { name: 'Interação Inicial', sort: 2, color: '#d6eaff' },
  { name: 'Qualificação', sort: 3, color: '#c1e0ff' },
  { name: 'Interesse Real', sort: 4, color: '#ebffb1' },
  { name: 'Encaminhado Andrea', sort: 5, color: '#ffdc7f' },
  { name: 'Encaminhado Thais', sort: 6, color: '#ffc8c8' },
  { name: 'Consulta Agendada', sort: 7, color: '#b1ffb1' }
];

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

async function apiRequest(method, endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${method} ${endpoint} failed (${response.status}): ${text}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return null;
}

async function getPipelines() {
  const data = await apiRequest('GET', '/leads/pipelines');
  return data._embedded ? data._embedded.pipelines : [];
}

async function findPipeline() {
  const pipelines = await getPipelines();
  return pipelines.find(p => p.name === PIPELINE_NAME) || null;
}

async function createPipeline() {
  console.log(`Creating pipeline: ${PIPELINE_NAME}`);

  const body = [
    {
      name: PIPELINE_NAME,
      sort: 1,
      is_main: false,
      _embedded: {
        statuses: PIPELINE_STATUSES.map(s => ({
          name: s.name,
          sort: (s.sort + 1) * 10,
          color: s.color
        }))
      }
    }
  ];

  const data = await apiRequest('POST', '/leads/pipelines', body);
  if (data._embedded && data._embedded.pipelines && data._embedded.pipelines.length > 0) {
    return data._embedded.pipelines[0];
  }
  throw new Error('Pipeline creation response did not contain pipeline data');
}

function extractStatuses(pipeline) {
  const statuses = pipeline._embedded && pipeline._embedded.statuses
    ? pipeline._embedded.statuses
    : [];

  return PIPELINE_STATUSES.map(expected => {
    const found = statuses.find(s => s.name === expected.name);
    return {
      name: expected.name,
      status_id: found ? found.id : null,
      sort: expected.sort,
      color: expected.color
    };
  });
}

function saveConfig(pipelineId, statuses) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  config.pipeline.pipeline_id = pipelineId;
  config.pipeline.statuses = statuses;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Configuration saved to ${CONFIG_PATH}`);
}

/**
 * Generate n8n environment variable mapping from pipeline config.
 * Outputs a file that can be sourced or pasted into n8n settings.
 */
function generateN8nEnvMapping(pipelineId, statuses) {
  const envPath = path.join(__dirname, '..', 'config', 'n8n-env-vars.json');

  const statusMap = {};
  for (const s of statuses) {
    if (s.status_id === null) {
      console.warn(`  WARNING: Status "${s.name}" has no status_id. Pipeline may need manual verification.`);
    }
  }

  const findStatus = (name) => {
    const s = statuses.find(st => st.name === name);
    return s ? s.status_id : null;
  };

  const envVars = {
    KOMMO_BASE_URL: BASE_URL,
    KOMMO_PIPELINE_ID: pipelineId,
    KOMMO_STATUS_NOVO_SEGUIDOR: findStatus('Novo Seguidor'),
    KOMMO_STATUS_INTERACAO_INICIAL: findStatus('Interação Inicial'),
    KOMMO_STATUS_QUALIFICACAO: findStatus('Qualificação'),
    KOMMO_STATUS_INTERESSE_REAL: findStatus('Interesse Real'),
    KOMMO_STATUS_ANDREA: findStatus('Encaminhado Andrea'),
    KOMMO_STATUS_THAIS: findStatus('Encaminhado Thais'),
    KOMMO_STATUS_CONSULTA_AGENDADA: findStatus('Consulta Agendada')
  };

  // Check for any null values
  const nullVars = Object.entries(envVars).filter(([, v]) => v === null);
  if (nullVars.length > 0) {
    console.warn('\n  WARNING: The following environment variables could not be resolved:');
    nullVars.forEach(([k]) => console.warn(`    - ${k}`));
    console.warn('  The workflow will fail if these are not set manually in n8n.\n');
  }

  fs.writeFileSync(envPath, JSON.stringify(envVars, null, 2));
  console.log(`n8n environment variables saved to ${envPath}`);

  return envVars;
}

async function main() {
  console.log('Checking Kommo API access...');
  try {
    await apiRequest('GET', '/users');
    console.log('API access confirmed.');
  } catch (err) {
    console.error('Failed to verify API access:', err.message);
    process.exit(1);
  }

  let pipeline = await findPipeline();

  if (pipeline) {
    console.log(`Pipeline "${PIPELINE_NAME}" already exists (ID: ${pipeline.id}).`);
  } else {
    pipeline = await createPipeline();
    console.log(`Pipeline created (ID: ${pipeline.id}).`);
  }

  const statuses = extractStatuses(pipeline);
  saveConfig(pipeline.id, statuses);

  console.log('\nPipeline stages:');
  statuses.forEach(s => {
    const idDisplay = s.status_id !== null ? s.status_id : 'NOT FOUND';
    console.log(`  ${s.sort}. ${s.name} (status_id: ${idDisplay})`);
  });

  // Generate n8n environment variable mapping
  const envVars = generateN8nEnvMapping(pipeline.id, statuses);

  console.log('\nn8n environment variables:');
  Object.entries(envVars).forEach(([k, v]) => {
    console.log(`  ${k}=${v !== null ? v : 'MISSING'}`);
  });

  console.log('\nSetup complete.');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
