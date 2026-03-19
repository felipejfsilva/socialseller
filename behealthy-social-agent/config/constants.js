/**
 * Single source of truth for all system constants.
 *
 * Used by: services/*.js, scripts/*.js, and referenced by n8n workflow inline code.
 * The n8n workflow duplicates some of these as inline values since it cannot
 * require() external modules — but this file is the canonical reference.
 */

const PIPELINE_NAME = 'SOCIAL SELLING INSTAGRAM';

const PIPELINE_STAGES = [
  { name: 'Novo Seguidor', sort: 1, color: '#fffeb2', envVar: 'KOMMO_STATUS_NOVO_SEGUIDOR' },
  { name: 'Interação Inicial', sort: 2, color: '#d6eaff', envVar: 'KOMMO_STATUS_INTERACAO_INICIAL' },
  { name: 'Qualificação', sort: 3, color: '#c1e0ff', envVar: 'KOMMO_STATUS_QUALIFICACAO' },
  { name: 'Interesse Real', sort: 4, color: '#ebffb1', envVar: 'KOMMO_STATUS_INTERESSE_REAL' },
  { name: 'Encaminhado Andrea', sort: 5, color: '#ffdc7f', envVar: 'KOMMO_STATUS_ANDREA' },
  { name: 'Encaminhado Thais', sort: 6, color: '#ffc8c8', envVar: 'KOMMO_STATUS_THAIS' },
  { name: 'Consulta Agendada', sort: 7, color: '#b1ffb1', envVar: 'KOMMO_STATUS_CONSULTA_AGENDADA' }
];

const OPERATORS = {
  andrea: {
    name: 'Andrea',
    userId: 14813416,
    stage: 'Encaminhado Andrea',
    envVar: 'KOMMO_STATUS_ANDREA',
    area: 'weight_loss',
    areaLabel: 'Emagrecimento e saúde'
  },
  thais: {
    name: 'Thais',
    userId: 14832028,
    stage: 'Encaminhado Thais',
    envVar: 'KOMMO_STATUS_THAIS',
    area: 'aesthetics',
    areaLabel: 'Procedimentos estéticos'
  }
};

// Maps AI interest_area classification to operator key
const INTEREST_TO_OPERATOR = {
  weight_loss: 'andrea',
  aesthetics: 'thais',
  hormonal: 'andrea',
  general: 'andrea',
  unknown: 'andrea'
};

const LEAD_TEMPERATURES = ['hot', 'warm', 'cold', 'unqualified'];
const INTEREST_AREAS = ['weight_loss', 'aesthetics', 'general', 'unknown'];

const TEMPERATURE_TO_STAGE = {
  cold: 'Novo Seguidor',
  warm: 'Qualificação',
  hot: 'Interesse Real',
  unqualified: 'Novo Seguidor'
};

const EVENT_TYPES = ['dm', 'comment', 'follow'];

const REQUIRED_ENV_VARS = [
  'KOMMO_BASE_URL',
  'KOMMO_ACCESS_TOKEN',
  'KOMMO_PIPELINE_ID',
  'KOMMO_STATUS_NOVO_SEGUIDOR',
  'KOMMO_STATUS_QUALIFICACAO',
  'KOMMO_STATUS_INTERESSE_REAL',
  'KOMMO_STATUS_ANDREA',
  'KOMMO_STATUS_THAIS',
  'OPENAI_API_KEY'
];

const OPTIONAL_ENV_VARS = [
  'OPENAI_MODEL',           // defaults to gpt-4o
  'META_ACCESS_TOKEN',      // required for sending IG replies
  'INSTAGRAM_VERIFY_TOKEN', // required for webhook verification
  'KOMMO_STATUS_INTERACAO_INICIAL',
  'KOMMO_STATUS_CONSULTA_AGENDADA'
];

// Conversation memory limits
const MAX_CONVERSATION_HISTORY_NOTES = 5;
const MAX_AI_TOKENS = 400;
const AI_TEMPERATURE = 0.7;
const DEFAULT_AI_MODEL = 'gpt-4o';

// Instagram Graph API version
const META_GRAPH_API_VERSION = 'v21.0';

module.exports = {
  PIPELINE_NAME,
  PIPELINE_STAGES,
  OPERATORS,
  INTEREST_TO_OPERATOR,
  LEAD_TEMPERATURES,
  INTEREST_AREAS,
  TEMPERATURE_TO_STAGE,
  EVENT_TYPES,
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS,
  MAX_CONVERSATION_HISTORY_NOTES,
  MAX_AI_TOKENS,
  AI_TEMPERATURE,
  DEFAULT_AI_MODEL,
  META_GRAPH_API_VERSION
};
