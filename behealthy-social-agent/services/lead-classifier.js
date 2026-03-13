/**
 * Lead Classification Service
 *
 * Maps AI classification results to Kommo pipeline stages
 * and determines handoff routing.
 *
 * ARCHITECTURE NOTE:
 * This module is the Node.js reference implementation.
 * The n8n workflow duplicates this logic inline because n8n Code nodes
 * cannot require() external files. Both use config/constants.js as
 * the canonical source of truth for operator IDs and stage mappings.
 *
 * If you change classification logic here, also update:
 * - workflows/social-instagram-agent.json (Lead Classification node)
 * - workflows/social-instagram-agent.json (Resolve Handoff Operator node)
 */

const { updateLeadStage, assignLead } = require('./kommo-leads');
const { addHandoffNote } = require('./kommo-notes');
const { OPERATORS, TEMPERATURE_TO_STAGE, INTEREST_TO_OPERATOR } = require('../config/constants');

const RESPONSIBLE_USERS = {
  weight_loss: { name: OPERATORS.andrea.name, userId: OPERATORS.andrea.userId, stage: OPERATORS.andrea.stage },
  aesthetics: { name: OPERATORS.thais.name, userId: OPERATORS.thais.userId, stage: OPERATORS.thais.stage }
};

/**
 * Process lead classification and update CRM accordingly.
 */
async function classifyAndRoute(leadId, classification, conversationSummary) {
  const { lead_temperature, interest_area, should_handoff } = classification;

  // Step 1: Update lead stage based on temperature
  const stageName = TEMPERATURE_TO_STAGE[lead_temperature] || 'Novo Seguidor';
  await updateLeadStage(leadId, stageName);

  // Step 2: If handoff is needed, assign to the right person
  if (should_handoff && (lead_temperature === 'hot' || lead_temperature === 'warm')) {
    const handler = RESPONSIBLE_USERS[interest_area];

    if (handler) {
      await assignLead(leadId, handler.userId, handler.stage);
      await addHandoffNote(leadId, {
        operatorName: handler.name,
        classification: lead_temperature,
        conversationSummary
      });

      return {
        action: 'handoff',
        assignedTo: handler.name,
        stage: handler.stage
      };
    }
  }

  return {
    action: 'continue',
    stage: stageName,
    temperature: lead_temperature
  };
}

/**
 * Map event type to initial pipeline stage.
 */
function getInitialStage(eventType) {
  switch (eventType) {
    case 'follow': return 'Novo Seguidor';
    case 'comment': return 'Interação Inicial';
    case 'dm': return 'Interação Inicial';
    default: return 'Novo Seguidor';
  }
}

module.exports = { classifyAndRoute, getInitialStage, RESPONSIBLE_USERS, TEMPERATURE_TO_STAGE };
