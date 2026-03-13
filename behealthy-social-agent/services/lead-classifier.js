/**
 * Lead Classification Service
 *
 * Maps AI classification results to Kommo pipeline stages
 * and determines handoff routing.
 */

const { updateLeadStage, assignLead } = require('./kommo-leads');
const { addHandoffNote } = require('./kommo-notes');

const RESPONSIBLE_USERS = {
  weight_loss: { name: 'Andrea', userId: 14813416, stage: 'Encaminhado Andrea' },
  aesthetics: { name: 'Thais', userId: 14832028, stage: 'Encaminhado Thais' }
};

const TEMPERATURE_TO_STAGE = {
  cold: 'Novo Seguidor',
  warm: 'Qualificação',
  hot: 'Interesse Real',
  unqualified: 'Novo Seguidor'
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
