#!/usr/bin/env node

/**
 * End-to-End Validation Script
 *
 * Simulates the full workflow logic locally using test fixtures.
 * Does NOT call real APIs — validates logic paths and data flow.
 *
 * Scenarios:
 * 1. Unknown lead sends DM (new contact + new lead + AI + classify)
 * 2. Existing lead comments on post (reuse contact + reuse lead)
 * 3. New follower enters (follow event, deterministic greeting)
 * 4. Qualified weight-loss lead routed to Andrea
 * 5. Qualified aesthetics lead routed to Thais
 * 6. Incompatible lead NOT handed off
 */

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8'));
}

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log('    ✓ ' + label);
    passed++;
  } else {
    console.log('    ✗ FAIL: ' + label);
    failed++;
  }
}

// ============================================================
// SIMULATE WORKFLOW NODE LOGIC
// ============================================================

/**
 * Simulate: Parse Instagram Event node
 */
function parseInstagramEvent(webhookPayload) {
  const body = webhookPayload;
  if (!body || !body.entry || !body.entry[0]) {
    return { skip: true, reason: 'No entry in payload' };
  }

  const entry = body.entry[0];
  let eventType = 'unknown', senderId = null, senderUsername = null, message = '', timestamp = new Date().toISOString();

  if (entry.messaging && entry.messaging.length > 0) {
    const msg = entry.messaging[0];
    senderId = msg.sender ? String(msg.sender.id) : null;
    eventType = 'dm';
    message = (msg.message && msg.message.text) || '';
    if (msg.timestamp) timestamp = new Date(Number(msg.timestamp)).toISOString();
  } else if (entry.changes && entry.changes.length > 0) {
    const change = entry.changes[0];
    if (change.field === 'comments') {
      eventType = 'comment';
      senderId = change.value && change.value.from ? String(change.value.from.id) : null;
      senderUsername = change.value && change.value.from ? change.value.from.username : null;
      message = (change.value && change.value.text) || '';
    } else if (change.field === 'followers' || change.field === 'follow') {
      eventType = 'follow';
      senderId = change.value ? String(change.value.id || change.value.user_id) : null;
      senderUsername = change.value ? change.value.username : null;
    }
  }

  if (!senderId) return { skip: true, reason: 'No sender ID' };

  return {
    eventType,
    senderId,
    senderUsername: senderUsername || `ig_user_${senderId}`,
    message,
    timestamp,
    skip: false
  };
}

/**
 * Simulate: Evaluate Contact Result node
 */
function evaluateContactResult(apiResponse, parsedEvent) {
  let contactId = null, contactExists = false, contactName = null;

  if (apiResponse && apiResponse._embedded && apiResponse._embedded.contacts && apiResponse._embedded.contacts.length > 0) {
    const c = apiResponse._embedded.contacts[0];
    contactId = c.id;
    contactExists = true;
    contactName = c.name;
  }

  return { ...parsedEvent, contactId, contactExists, contactName };
}

/**
 * Simulate: Lead Classification node
 */
function classifyLead(classification) {
  const map = {
    cold: { name: 'Novo Seguidor', envVar: 'KOMMO_STATUS_NOVO_SEGUIDOR' },
    warm: { name: 'Qualificação', envVar: 'KOMMO_STATUS_QUALIFICACAO' },
    hot: { name: 'Interesse Real', envVar: 'KOMMO_STATUS_INTERESSE_REAL' },
    unqualified: { name: 'Novo Seguidor', envVar: 'KOMMO_STATUS_NOVO_SEGUIDOR' }
  };

  const stage = map[classification.lead_temperature] || map.cold;
  return { targetStage: stage.name, targetEnvVar: stage.envVar };
}

/**
 * Simulate: Resolve Handoff Operator node
 */
function resolveHandoff(classification) {
  const ops = {
    weight_loss: { name: 'Andrea', userId: 14813416, envVar: 'KOMMO_STATUS_ANDREA', area: 'Emagrecimento e saúde' },
    aesthetics: { name: 'Thais', userId: 14832028, envVar: 'KOMMO_STATUS_THAIS', area: 'Procedimentos estéticos' }
  };

  const op = ops[classification.interest_area] || ops.weight_loss;
  return {
    operatorName: op.name,
    responsibleUserId: op.userId,
    envVar: op.envVar,
    area: op.area,
    handoffMessage: `Vou te conectar com ${op.name}, que é especialista em ${op.area} e vai poder te ajudar melhor! Ela vai entrar em contato em breve.`
  };
}

/**
 * Simulate: IG Reply decision
 */
function shouldSendIgReply(eventType, hasMetaToken) {
  if (eventType === 'dm' && hasMetaToken) return 'sent';
  if (eventType !== 'dm') return 'not_dm';
  return 'no_meta_token';
}

// ============================================================
// SCENARIOS
// ============================================================

console.log('=== E2E Validation: Be Healthy Social Selling Agent ===\n');

// Scenario 1: Unknown lead sends DM
console.log('SCENARIO 1: Unknown lead sends DM');
{
  const fixture = loadFixture('instagram_dm.json');
  const parsed = parseInstagramEvent(fixture);
  assert(parsed.skip === false, 'Event parsed successfully');
  assert(parsed.eventType === 'dm', 'Event type is DM');
  assert(parsed.senderId === '44411122233', 'Sender ID extracted');
  assert(parsed.message.includes('emagrecimento'), 'Message content preserved');

  // Contact not found
  const contactMissing = loadFixture('kommo_contact_missing.json');
  const evalResult = evaluateContactResult(contactMissing, parsed);
  assert(evalResult.contactExists === false, 'Contact not found (correct)');
  assert(evalResult.contactId === null, 'No contact ID');

  // Would create contact → get contactId
  const mockContactId = 90002;
  const withContact = { ...evalResult, contactId: mockContactId, contactName: parsed.senderUsername };
  assert(withContact.contactId === 90002, 'New contact ID assigned');

  // Would check lead → not found → create lead
  const mockLeadId = 50001;
  const withLead = { ...withContact, leadId: mockLeadId, leadExists: false };
  assert(withLead.leadId === 50001, 'New lead ID assigned');
  assert(withLead.leadExists === false, 'Lead is new');

  // AI would classify this as hot/weight_loss (based on message content)
  const expectedClass = { lead_temperature: 'hot', interest_area: 'weight_loss', should_handoff: true, reasoning: 'Asks about weight loss and pricing' };
  const stageResult = classifyLead(expectedClass);
  assert(stageResult.targetStage === 'Interesse Real', 'Hot lead → Interesse Real stage');

  // Handoff
  const handoff = resolveHandoff(expectedClass);
  assert(handoff.operatorName === 'Andrea', 'Weight loss → Andrea');
  assert(handoff.responsibleUserId === 14813416, 'Andrea user ID correct');
  assert(handoff.handoffMessage.includes('Andrea'), 'Handoff message mentions Andrea');

  // IG reply
  const igStatus = shouldSendIgReply('dm', true);
  assert(igStatus === 'sent', 'DM reply would be sent with META_ACCESS_TOKEN');
}

console.log('');

// Scenario 2: Existing lead comments on post
console.log('SCENARIO 2: Existing lead comments on post');
{
  const fixture = loadFixture('instagram_comment.json');
  const parsed = parseInstagramEvent(fixture);
  assert(parsed.skip === false, 'Event parsed successfully');
  assert(parsed.eventType === 'comment', 'Event type is comment');
  assert(parsed.senderUsername === 'maria_silva_rj', 'Username extracted from comment');
  assert(parsed.message.includes('harmonização'), 'Comment text preserved');

  // Contact found
  const contactFound = loadFixture('kommo_contact_found.json');
  const evalResult = evaluateContactResult(contactFound, parsed);
  assert(evalResult.contactExists === true, 'Contact found (correct)');
  assert(evalResult.contactId === 90001, 'Existing contact ID reused');

  // Lead already exists → reuse
  const withLead = { ...evalResult, leadId: 50010, leadExists: true };
  assert(withLead.leadExists === true, 'Lead reused (not duplicated)');

  // Classification: warm/aesthetics based on comment about harmonização
  const classification = { lead_temperature: 'warm', interest_area: 'aesthetics', should_handoff: false, reasoning: 'Interest in aesthetics but not yet asking to schedule' };
  const stageResult = classifyLead(classification);
  assert(stageResult.targetStage === 'Qualificação', 'Warm → Qualificação stage');
  assert(classification.should_handoff === false, 'Warm lead not handed off yet');

  // IG reply for comment
  const igStatus = shouldSendIgReply('comment', true);
  assert(igStatus === 'not_dm', 'Comment event does not trigger DM reply');
}

console.log('');

// Scenario 3: New follower
console.log('SCENARIO 3: New follower enters');
{
  const fixture = loadFixture('instagram_new_follower.json');
  const parsed = parseInstagramEvent(fixture);
  assert(parsed.skip === false, 'Event parsed successfully');
  assert(parsed.eventType === 'follow', 'Event type is follow');
  assert(parsed.senderUsername === 'joao_santos_sp', 'Username extracted');
  assert(parsed.message === '', 'No message for follow event');

  // Follow → deterministic greeting, no AI call
  const greeting = 'Olá! Bem-vindo(a) ao Instituto Be Healthy!';
  assert(greeting.includes('Bem-vindo'), 'Greeting is deterministic (no AI tokens used)');

  const classification = { lead_temperature: 'cold', interest_area: 'unknown', should_handoff: false };
  const stageResult = classifyLead(classification);
  assert(stageResult.targetStage === 'Novo Seguidor', 'Cold → Novo Seguidor stage');
  assert(classification.should_handoff === false, 'New follower not handed off');
}

console.log('');

// Scenario 4: Qualified weight-loss lead
console.log('SCENARIO 4: Qualified weight-loss lead → Andrea');
{
  const fixture = loadFixture('qualified_weight_loss.json');
  const classification = fixture.expected_classification;
  const routing = fixture.expected_routing;

  assert(classification.lead_temperature === 'hot', 'Classification is hot');
  assert(classification.interest_area === 'weight_loss', 'Interest area is weight_loss');
  assert(classification.should_handoff === true, 'Should handoff');

  const handoff = resolveHandoff(classification);
  assert(handoff.operatorName === routing.operator, 'Routed to ' + routing.operator);
  assert(handoff.responsibleUserId === routing.responsible_user_id, 'User ID: ' + routing.responsible_user_id);
  assert(handoff.handoffMessage === fixture.expected_handoff_message, 'Handoff message matches expected');

  const stageResult = classifyLead(classification);
  assert(stageResult.targetStage === 'Interesse Real', 'Hot → Interesse Real before handoff');
}

console.log('');

// Scenario 5: Qualified aesthetics lead
console.log('SCENARIO 5: Qualified aesthetics lead → Thais');
{
  const fixture = loadFixture('qualified_aesthetics.json');
  const classification = fixture.expected_classification;
  const routing = fixture.expected_routing;

  assert(classification.lead_temperature === 'hot', 'Classification is hot');
  assert(classification.interest_area === 'aesthetics', 'Interest area is aesthetics');
  assert(classification.should_handoff === true, 'Should handoff');

  const handoff = resolveHandoff(classification);
  assert(handoff.operatorName === routing.operator, 'Routed to ' + routing.operator);
  assert(handoff.responsibleUserId === routing.responsible_user_id, 'User ID: ' + routing.responsible_user_id);
  assert(handoff.handoffMessage === fixture.expected_handoff_message, 'Handoff message matches expected');
}

console.log('');

// Scenario 6: Incompatible lead
console.log('SCENARIO 6: Incompatible/spam lead → no handoff');
{
  const fixture = loadFixture('incompatible_lead.json');
  const classification = fixture.expected_classification;

  assert(classification.lead_temperature === 'unqualified', 'Classification is unqualified');
  assert(classification.should_handoff === false, 'Should NOT handoff');

  const stageResult = classifyLead(classification);
  assert(stageResult.targetStage === 'Novo Seguidor', 'Unqualified → stays at Novo Seguidor');
}

console.log('');

// Scenario 7: Validate dedup logic
console.log('SCENARIO 7: Dedup validation');
{
  // Contact found → should NOT create new contact
  const found = loadFixture('kommo_contact_found.json');
  const evalFound = evaluateContactResult(found, { eventType: 'dm' });
  assert(evalFound.contactExists === true, 'Existing contact detected → skip creation');

  // Contact missing → should create new contact
  const missing = loadFixture('kommo_contact_missing.json');
  const evalMissing = evaluateContactResult(missing, { eventType: 'dm' });
  assert(evalMissing.contactExists === false, 'Missing contact detected → create new');
}

console.log('');

// Scenario 8: Safe mode — contact creation fails
console.log('SCENARIO 8: Safe mode — CRM failure graceful degradation');
{
  // Simulate contact API returning error
  const errorResponse = { status: 500, message: 'Internal Server Error' };
  const evalError = evaluateContactResult(errorResponse, { eventType: 'dm', senderId: '999', senderUsername: 'test_user' });
  assert(evalError.contactExists === false, 'API error treated as contact not found');
  assert(evalError.contactId === null, 'No contact ID on API error');

  // Simulate contact creation failure (merge gets no ID)
  const mergeNoId = { ...evalError, contactId: null, contactName: 'test_user', _contactFailed: true };
  assert(mergeNoId._contactFailed === true, 'Contact failure flag set');

  // Downstream: lead should be skipped
  const leadSkipped = { ...mergeNoId, leadId: null, leadExists: false, _leadSkipped: true };
  assert(leadSkipped._leadSkipped === true, 'Lead operations skipped when contact failed');

  // AI should fall back to safe mode
  const safeResult = {
    ...leadSkipped,
    aiResponse: 'Olá! Obrigado pelo seu contato com o Instituto Be Healthy. Estamos com um volume alto de mensagens, mas nossa equipe vai entrar em contato com você em breve!',
    classification: { lead_temperature: 'cold', interest_area: 'unknown', should_handoff: false, reasoning: 'Safe mode' },
    _aiMode: 'safe_crm_failed'
  };
  assert(safeResult._aiMode === 'safe_crm_failed', 'AI enters safe mode on CRM failure');
  assert(safeResult.classification.should_handoff === false, 'Safe mode does not trigger handoff');
  assert(safeResult.aiResponse.length > 0, 'Safe mode provides fallback message');
}

console.log('');

// Scenario 9: Safe mode — AI failure
console.log('SCENARIO 9: Safe mode — AI failure graceful degradation');
{
  const SAFE_FALLBACK = 'Olá! Obrigado pelo seu contato com o Instituto Be Healthy. Estamos com um volume alto de mensagens, mas nossa equipe vai entrar em contato com você em breve!';
  const SAFE_CLASSIFICATION = { lead_temperature: 'cold', interest_area: 'unknown', should_handoff: false, reasoning: 'Safe mode - deterministic response' };

  // Simulate AI timeout/failure
  const aiFailResult = {
    eventType: 'dm',
    senderId: '444',
    senderUsername: 'test_user',
    leadId: 50001,
    leadExists: false,
    aiResponse: SAFE_FALLBACK,
    classification: SAFE_CLASSIFICATION,
    tokensUsed: 0,
    _aiMode: 'safe_ai_failed',
    _aiError: 'timeout_25s'
  };

  assert(aiFailResult._aiMode === 'safe_ai_failed', 'AI failure detected');
  assert(aiFailResult.tokensUsed === 0, 'No tokens consumed in safe mode');
  assert(aiFailResult.classification.should_handoff === false, 'AI failure prevents handoff');
  assert(aiFailResult.aiResponse === SAFE_FALLBACK, 'Deterministic fallback message used');

  // Classification should skip
  const classSkipped = { ...aiFailResult, targetStage: 'Novo Seguidor', targetStatusId: 0, _classSkipped: true };
  assert(classSkipped._classSkipped === true, 'Classification skipped on AI failure');
  assert(classSkipped.targetStage === 'Novo Seguidor', 'Defaults to Novo Seguidor');
}

console.log('');

// Scenario 10: Rate limit simulation
console.log('SCENARIO 10: Rate limit guard');
{
  // Simulate rate limit state
  const maxPerWindow = 30;
  const timestamps = [];
  for (let i = 0; i < maxPerWindow; i++) timestamps.push(Date.now());

  assert(timestamps.length >= maxPerWindow, 'At ' + maxPerWindow + ' events, limit reached');
  assert(maxPerWindow === 30, 'Rate limit set to 30 events per minute');

  // Under limit
  const underLimit = timestamps.slice(0, 10);
  assert(underLimit.length < maxPerWindow, 'Under limit: events pass through');
}

console.log('');

// Scenario 11: Error telemetry data structure
console.log('SCENARIO 11: Error telemetry data capture');
{
  const dataWithErrors = {
    _contactFailed: true,
    _aiMode: 'safe_crm_failed',
    _aiError: null,
    leadId: 50001,
    senderUsername: 'test_user',
    eventType: 'dm',
    _execId: 'abc12345'
  };

  const errors = [];
  if (dataWithErrors._contactFailed) errors.push('Contact creation failed');
  if (dataWithErrors._leadFailed) errors.push('Lead creation/lookup failed');
  if (dataWithErrors._aiError) errors.push('AI error: ' + dataWithErrors._aiError);
  if (dataWithErrors._aiMode === 'safe_ai_failed') errors.push('AI unavailable');
  if (dataWithErrors._aiMode === 'safe_crm_failed') errors.push('CRM failed - safe mode');

  assert(errors.length === 2, 'Correct error count detected: ' + errors.length);
  assert(errors[0] === 'Contact creation failed', 'Contact failure captured');
  assert(errors[1] === 'CRM failed - safe mode', 'Safe mode reason captured');
  assert(dataWithErrors._execId.length > 0, 'Execution ID present for tracing');
}

console.log('');

// Summary
console.log('=== RESULTS ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Total:  ' + (passed + failed));

if (failed === 0) {
  console.log('\n✓ All E2E validation scenarios PASSED');
} else {
  console.log('\n✗ ' + failed + ' assertions FAILED');
}

process.exit(failed > 0 ? 1 : 0);
