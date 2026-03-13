#!/usr/bin/env node

/**
 * Test script to validate the pipeline was created correctly in Kommo.
 *
 * Checks:
 *  1. Local config files are populated (pipeline.json, n8n-env-vars.json)
 *  2. Pipeline exists in Kommo API with correct name
 *  3. All 7 stages exist and IDs match local config
 *
 * Usage: KOMMO_BASE_URL=... KOMMO_ACCESS_TOKEN=... node scripts/test-pipeline.js
 */

const fs = require('fs');
const path = require('path');
const { PIPELINE_STAGES, PIPELINE_NAME } = require('../config/constants');

const BASE_URL = process.env.KOMMO_BASE_URL || 'https://felipebhcrm.kommo.com/api/v4';
const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'pipeline.json');
const ENV_VARS_PATH = path.join(__dirname, '..', 'config', 'n8n-env-vars.json');

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

async function apiGet(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` }
  });
  if (!res.ok) {
    throw new Error(`GET ${endpoint} failed (${res.status})`);
  }
  return res.json();
}

async function main() {
  console.log('\n=== Teste do Funil — SOCIAL SELLING INSTAGRAM ===\n');

  // ── 1. Arquivos locais ───────────────────────────────────────────
  console.log('1. Arquivos locais');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    check('pipeline.json existe e é JSON válido', false, 'arquivo não encontrado ou inválido');
    console.log('\n  Rode "npm run setup" primeiro.\n');
    process.exit(1);
  }

  const pipelineId = config.pipeline && config.pipeline.pipeline_id;
  check('pipeline_id está preenchido', pipelineId != null, `valor: ${pipelineId}`);

  const statuses = config.pipeline && config.pipeline.statuses;
  const allStatusIds = Array.isArray(statuses) && statuses.every(s => s.status_id != null);
  check('Todos os 7 status_id estão preenchidos', allStatusIds,
    Array.isArray(statuses)
      ? statuses.filter(s => s.status_id == null).map(s => s.name).join(', ') + ' sem ID'
      : 'statuses ausentes'
  );

  let envVars;
  try {
    envVars = JSON.parse(fs.readFileSync(ENV_VARS_PATH, 'utf8'));
    const nullKeys = Object.entries(envVars).filter(([, v]) => v == null).map(([k]) => k);
    check('n8n-env-vars.json está completo', nullKeys.length === 0,
      nullKeys.length > 0 ? `campos null: ${nullKeys.join(', ')}` : undefined
    );
  } catch {
    check('n8n-env-vars.json existe', false, 'arquivo não encontrado');
  }

  // ── 2. API — Pipeline existe ─────────────────────────────────────
  console.log('\n2. API Kommo — Pipeline');

  if (!TOKEN) {
    check('KOMMO_ACCESS_TOKEN definido', false, 'variável de ambiente não encontrada');
    printSummary();
    return;
  }

  let apiPipeline;
  try {
    const data = await apiGet(`/leads/pipelines/${pipelineId}`);
    apiPipeline = data;
    check('Pipeline encontrado na API', true);
  } catch (err) {
    check('Pipeline encontrado na API', false, err.message);
    printSummary();
    return;
  }

  check('Nome confere', apiPipeline.name === PIPELINE_NAME,
    `esperado "${PIPELINE_NAME}", recebido "${apiPipeline.name}"`
  );

  // ── 3. API — Estágios ────────────────────────────────────────────
  console.log('\n3. API Kommo — Estágios');

  const apiStatuses = apiPipeline._embedded && apiPipeline._embedded.statuses
    ? apiPipeline._embedded.statuses
    : [];

  for (const expected of PIPELINE_STAGES) {
    const localStatus = statuses && statuses.find(s => s.name === expected.name);
    const apiStatus = apiStatuses.find(s => s.name === expected.name);

    if (!apiStatus) {
      check(`"${expected.name}" existe na API`, false, 'não encontrado');
      continue;
    }

    check(`"${expected.name}" existe na API`, true);

    if (localStatus && localStatus.status_id != null) {
      check(`  ID confere (${localStatus.status_id})`,
        localStatus.status_id === apiStatus.id,
        `local=${localStatus.status_id}, API=${apiStatus.id}`
      );
    }
  }

  printSummary();
}

function printSummary() {
  console.log(`\n─────────────────────────────────────`);
  console.log(`  Resultado: ${passed} passou, ${failed} falhou`);
  console.log(`─────────────────────────────────────\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro no teste:', err.message);
  process.exit(1);
});
