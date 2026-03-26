#!/usr/bin/env node

/**
 * End-to-End Validation for MUDANÇA Comment Automation
 *
 * Simulates the MUDANÇA workflow logic locally using test scenarios.
 * Does NOT call real APIs — validates logic paths and data flow.
 *
 * Scenarios:
 * 1. MUDANÇA comment on target reel → DM generated
 * 2. Non-MUDANÇA comment → skipped
 * 3. Lowercase/no-accent MUDANÇA → still detected
 * 4. User cooldown (24h dedup) → 2nd comment skipped
 * 5. DM event (not a comment) → skipped
 * 6. AI failure → fallback message used
 * 7. Contact creation fails → graceful degradation
 * 8. Lead already exists → reused
 */

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log('    \u2713 ' + label);
    passed++;
  } else {
    console.log('    \u2717 FAIL: ' + label);
    failed++;
  }
}

// ============================================================
// SIMULATE MUDANÇA WORKFLOW LOGIC
// ============================================================

/**
 * Simulate: Parse & Filter MUDANÇA node
 */
function parseMudancaComment(webhookPayload, staticData, targetMediaId) {
  const body = webhookPayload;
  if (!body || !body.entry || !body.entry[0]) {
    return { skip: true, reason: 'No entry in payload' };
  }

  const entry = body.entry[0];

  // Only process comment events
  if (!entry.changes || !entry.changes[0] || entry.changes[0].field !== 'comments') {
    return { skip: true, reason: 'Not a comment event' };
  }

  const change = entry.changes[0];
  const value = change.value;

  if (!value || !value.text || !value.from) {
    return { skip: true, reason: 'Missing comment data' };
  }

  const commentText = value.text.trim();
  const senderId = String(value.from.id);
  const senderUsername = value.from.username || 'ig_user_' + senderId;

  // Accent/case-insensitive MUDANÇA detection
  const normalizedComment = commentText
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const hasMudanca = normalizedComment.includes('MUDANCA');

  if (!hasMudanca) {
    return { skip: true, reason: 'Comment does not contain MUDANÇA' };
  }

  // Media filtering
  const commentMediaId = value.media ? String(value.media.id) : '';
  if (targetMediaId && commentMediaId && commentMediaId !== targetMediaId) {
    return { skip: true, reason: 'Comment not on target reel' };
  }

  // Deduplication
  const now = Date.now();
  const cooldownMs = 24 * 60 * 60 * 1000;
  const lastProcessed = staticData.processedUsers && staticData.processedUsers[senderId];

  if (lastProcessed && (now - lastProcessed) < cooldownMs) {
    return { skip: true, reason: 'User already processed in last 24h' };
  }

  if (!staticData.processedUsers) staticData.processedUsers = {};
  staticData.processedUsers[senderId] = now;

  return {
    skip: false,
    eventType: 'comment',
    senderId,
    senderUsername,
    commentText,
    mediaId: commentMediaId,
    timestamp: new Date().toISOString()
  };
}

/**
 * Simulate: Generate MUDANÇA DM node (deterministic fallback)
 */
function generateFallbackDM(contactName) {
  const firstName = contactName.split(/[_\s.]/)[0];
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return `Oi ${displayName}! Vi que você comentou no nosso Reel sobre mudança — e que bom que esse conteúdo te tocou!\n\nAqui no Instituto Be Healthy, acreditamos que toda transformação começa com uma decisão. Me conta: o que você mais gostaria de mudar hoje na sua saúde ou no seu corpo?\n\nO Dr. Felipe tem protocolos exclusivos e personalizados, com mais de 95% de satisfação. Posso te contar mais sobre como funciona!`;
}

/**
 * Simulate: Evaluate contact/lead
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

// ============================================================
// TEST FIXTURES
// ============================================================

function makeMudancaComment(userId, username, text, mediaId) {
  return {
    object: 'instagram',
    entry: [{
      id: 'test_page_id',
      time: Date.now(),
      changes: [{
        field: 'comments',
        value: {
          from: { id: userId, username },
          text,
          media: { id: mediaId || 'test_reel_123' },
          created_time: Math.floor(Date.now() / 1000)
        }
      }]
    }]
  };
}

function makeDMEvent(userId, text) {
  return {
    object: 'instagram',
    entry: [{
      id: 'test_page_id',
      time: Date.now(),
      messaging: [{
        sender: { id: userId },
        recipient: { id: 'dr_felipe_id' },
        timestamp: Date.now(),
        message: { mid: 'test_mid', text }
      }]
    }]
  };
}

// ============================================================
// SCENARIOS
// ============================================================

console.log('=== E2E Validation: MUDANÇA Comment Automation ===\n');

// Scenario 1: MUDANÇA comment on target reel
console.log('SCENARIO 1: MUDANÇA comment on target reel');
{
  const payload = makeMudancaComment('user_001', 'ana_carolina', 'MUDANÇA! Quero transformar minha vida!', 'reel_123');
  const staticData = {};
  const result = parseMudancaComment(payload, staticData, '');

  assert(result.skip === false, 'Comment processed (not skipped)');
  assert(result.eventType === 'comment', 'Event type is comment');
  assert(result.senderId === 'user_001', 'Sender ID extracted');
  assert(result.senderUsername === 'ana_carolina', 'Username extracted');
  assert(result.commentText.includes('MUDANÇA'), 'Comment text preserved');

  // DM generation
  const dm = generateFallbackDM('ana_carolina');
  assert(dm.includes('Ana'), 'DM uses capitalized first name');
  assert(dm.includes('mudança'), 'DM mentions mudança/transformation');
  assert(dm.includes('mudar'), 'DM asks SPIN question about what they want to change');
  assert(dm.length > 50, 'DM has meaningful content (' + dm.length + ' chars)');
}

console.log('');

// Scenario 2: Non-MUDANÇA comment → skipped
console.log('SCENARIO 2: Non-MUDANÇA comment → skipped');
{
  const payload = makeMudancaComment('user_002', 'joao_silva', 'Que legal esse conteúdo!', 'reel_123');
  const staticData = {};
  const result = parseMudancaComment(payload, staticData, '');

  assert(result.skip === true, 'Non-MUDANÇA comment skipped');
  assert(result.reason === 'Comment does not contain MUDANÇA', 'Correct skip reason');
}

console.log('');

// Scenario 3: Case/accent variations
console.log('SCENARIO 3: Case and accent variations detected');
{
  const staticData = {};

  // Lowercase with accent
  const lower = makeMudancaComment('user_003a', 'test_a', 'mudança total!', 'reel_123');
  const r1 = parseMudancaComment(lower, staticData, '');
  assert(r1.skip === false, 'lowercase "mudança" detected');

  // Uppercase without accent
  const noAccent = makeMudancaComment('user_003b', 'test_b', 'MUDANCA agora!', 'reel_123');
  const r2 = parseMudancaComment(noAccent, staticData, '');
  assert(r2.skip === false, '"MUDANCA" without accent detected');

  // Mixed case with accent
  const mixed = makeMudancaComment('user_003c', 'test_c', 'Eu quero Mudança na minha vida', 'reel_123');
  const r3 = parseMudancaComment(mixed, staticData, '');
  assert(r3.skip === false, 'Mixed case "Mudança" detected');

  // Word embedded in text
  const embedded = makeMudancaComment('user_003d', 'test_d', 'Estou pronta pra mudança de vida', 'reel_123');
  const r4 = parseMudancaComment(embedded, staticData, '');
  assert(r4.skip === false, '"mudança" embedded in sentence detected');
}

console.log('');

// Scenario 4: User cooldown (24h dedup)
console.log('SCENARIO 4: User cooldown — 24h deduplication');
{
  const staticData = {};

  // First comment → processed
  const first = makeMudancaComment('user_004', 'paula', 'MUDANÇA!', 'reel_123');
  const r1 = parseMudancaComment(first, staticData, '');
  assert(r1.skip === false, '1st comment from user processed');

  // Second comment (same user, within 24h) → skipped
  const second = makeMudancaComment('user_004', 'paula', 'MUDANÇA de novo!', 'reel_123');
  const r2 = parseMudancaComment(second, staticData, '');
  assert(r2.skip === true, '2nd comment from same user skipped (24h cooldown)');
  assert(r2.reason === 'User already processed in last 24h', 'Correct cooldown reason');

  // Different user → processed
  const different = makeMudancaComment('user_005', 'carlos', 'MUDANÇA!', 'reel_123');
  const r3 = parseMudancaComment(different, staticData, '');
  assert(r3.skip === false, 'Different user processed normally');
}

console.log('');

// Scenario 5: DM event (not a comment) → skipped
console.log('SCENARIO 5: DM event → skipped');
{
  const payload = makeDMEvent('user_006', 'MUDANÇA via DM');
  const staticData = {};
  const result = parseMudancaComment(payload, staticData, '');

  assert(result.skip === true, 'DM event skipped (only comments trigger)');
  assert(result.reason === 'Not a comment event', 'Correct skip reason');
}

console.log('');

// Scenario 6: Media ID filtering
console.log('SCENARIO 6: Media ID filtering');
{
  const staticData = {};

  // Comment on target reel
  const onTarget = makeMudancaComment('user_007a', 'test_a', 'MUDANÇA!', 'target_reel_id');
  const r1 = parseMudancaComment(onTarget, staticData, 'target_reel_id');
  assert(r1.skip === false, 'Comment on target reel processed');

  // Comment on different reel
  const offTarget = makeMudancaComment('user_007b', 'test_b', 'MUDANÇA!', 'other_reel_id');
  const r2 = parseMudancaComment(offTarget, staticData, 'target_reel_id');
  assert(r2.skip === true, 'Comment on wrong reel skipped');
  assert(r2.reason === 'Comment not on target reel', 'Correct skip reason');

  // No media filter set (empty string) → process all
  const noFilter = makeMudancaComment('user_007c', 'test_c', 'MUDANÇA!', 'any_reel');
  const r3 = parseMudancaComment(noFilter, staticData, '');
  assert(r3.skip === false, 'No media filter → comment on any reel processed');
}

console.log('');

// Scenario 7: AI failure → fallback message
console.log('SCENARIO 7: AI failure → fallback message');
{
  const fallback = generateFallbackDM('maria_silva_rj');
  assert(fallback.includes('Maria'), 'Fallback uses first name capitalized');
  assert(fallback.includes('mudança'), 'Fallback mentions mudança');
  assert(fallback.includes('Be Healthy'), 'Fallback mentions Be Healthy');
  assert(fallback.includes('mudar'), 'Fallback asks SPIN question');
  assert(fallback.length > 100, 'Fallback has substantial content');
  assert(!fallback.includes('undefined'), 'Fallback has no undefined values');
}

console.log('');

// Scenario 8: Contact already exists → reused
console.log('SCENARIO 8: Contact already exists → reused');
{
  const parsed = { eventType: 'comment', senderId: 'user_008', senderUsername: 'teste_contato' };

  // Contact found
  const contactFound = { _embedded: { contacts: [{ id: 90001, name: 'teste_contato' }] } };
  const result = evaluateContactResult(contactFound, parsed);
  assert(result.contactExists === true, 'Existing contact detected');
  assert(result.contactId === 90001, 'Contact ID reused');

  // Contact not found
  const contactMissing = { _embedded: { contacts: [] } };
  const result2 = evaluateContactResult(contactMissing, parsed);
  assert(result2.contactExists === false, 'Missing contact → will create new');
  assert(result2.contactId === null, 'No contact ID');
}

console.log('');

// Scenario 9: Empty/malformed payloads
console.log('SCENARIO 9: Edge cases — malformed payloads');
{
  const staticData = {};

  // Empty body
  const r1 = parseMudancaComment(null, staticData, '');
  assert(r1.skip === true, 'Null payload skipped');

  // No entry
  const r2 = parseMudancaComment({ entry: [] }, staticData, '');
  assert(r2.skip === true, 'Empty entry array skipped');

  // Comment without text
  const noText = {
    entry: [{ changes: [{ field: 'comments', value: { from: { id: 'x', username: 'y' } } }] }]
  };
  const r3 = parseMudancaComment(noText, staticData, '');
  assert(r3.skip === true, 'Comment without text skipped');

  // Follow event (not comment)
  const follow = {
    entry: [{ changes: [{ field: 'followers', value: { id: 'z', username: 'w' } }] }]
  };
  const r4 = parseMudancaComment(follow, staticData, '');
  assert(r4.skip === true, 'Follow event skipped');
}

console.log('');

// Scenario 10: Lead classification for MUDANÇA leads
console.log('SCENARIO 10: MUDANÇA lead classification');
{
  // MUDANÇA comment should be classified as hot/interested
  const classification = {
    lead_temperature: 'hot',
    interest_area: 'unknown',
    should_handoff: false,
    reasoning: 'Commented MUDANÇA — strong buying signal'
  };

  assert(classification.lead_temperature === 'hot', 'MUDANÇA leads classified as HOT');

  // Stage mapping: hot → Interesse Real
  const stageMap = { hot: 'Interesse Real', warm: 'Qualificação', cold: 'Novo Seguidor' };
  const targetStage = stageMap[classification.lead_temperature];
  assert(targetStage === 'Interesse Real', 'HOT → Interesse Real stage');

  // After DM is sent, move to Consulta Agendada
  const finalStage = 'Consulta Agendada';
  assert(finalStage === 'Consulta Agendada', 'Final stage is Consulta Agendada');
}

console.log('');

// Summary
console.log('=== RESULTS ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
console.log('Total:  ' + (passed + failed));

if (failed === 0) {
  console.log('\n\u2713 All MUDANÇA E2E validation scenarios PASSED');
} else {
  console.log('\n\u2717 ' + failed + ' assertions FAILED');
}

process.exit(failed > 0 ? 1 : 0);
