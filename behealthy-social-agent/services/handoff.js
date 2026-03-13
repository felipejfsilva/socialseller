/**
 * Human Handoff Service
 *
 * Manages the transition from AI agent to human operator.
 * Routes qualified leads to Andrea (weight loss) or Thais (aesthetics).
 *
 * ARCHITECTURE NOTE: See lead-classifier.js for sync instructions with n8n workflow.
 */

const { assignLead } = require('./kommo-leads');
const { addHandoffNote } = require('./kommo-notes');
const { clearLeadHistory } = require('./ai-agent');
const constants = require('../config/constants');

const OPERATORS = {
  andrea: {
    name: constants.OPERATORS.andrea.name,
    userId: constants.OPERATORS.andrea.userId,
    stage: constants.OPERATORS.andrea.stage,
    area: constants.OPERATORS.andrea.area,
    description: constants.OPERATORS.andrea.areaLabel
  },
  thais: {
    name: constants.OPERATORS.thais.name,
    userId: constants.OPERATORS.thais.userId,
    stage: constants.OPERATORS.thais.stage,
    area: constants.OPERATORS.thais.area,
    description: constants.OPERATORS.thais.areaLabel
  }
};

/**
 * Determine which operator should handle the lead based on interest area.
 */
function resolveOperator(interestArea) {
  if (interestArea === 'weight_loss') return OPERATORS.andrea;
  if (interestArea === 'aesthetics' || interestArea === 'aesthetic_procedures') return OPERATORS.thais;
  // Default to Andrea for general/unknown
  return OPERATORS.andrea;
}

/**
 * Execute handoff: assign lead, add note, clear AI cache.
 */
async function executeHandoff(leadId, { interestArea, classification, conversationSummary }) {
  const operator = resolveOperator(interestArea);

  // Assign lead to operator in CRM
  await assignLead(leadId, operator.userId, operator.stage);

  // Add handoff note
  await addHandoffNote(leadId, {
    operatorName: operator.name,
    classification: classification || 'hot',
    conversationSummary: conversationSummary || 'Lead qualified automatically by Instagram AI agent. Transferred to human operator.'
  });

  // Clear AI conversation cache for this lead
  clearLeadHistory(leadId);

  return {
    success: true,
    operator: operator.name,
    stage: operator.stage,
    message: `Vou te conectar com ${operator.name}, que é especialista em ${operator.description} e vai poder te ajudar melhor! Ela vai entrar em contato em breve.`
  };
}

module.exports = { executeHandoff, resolveOperator, OPERATORS };
