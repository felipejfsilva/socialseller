#!/usr/bin/env node

/**
 * MUDANÇA Workflow JSON Structural Validator
 *
 * Validates that the MUDANÇA comment automation workflow JSON is:
 * 1. Valid JSON with correct structure
 * 2. All node names in connections exist as actual nodes
 * 3. All connection targets reference real nodes
 * 4. No orphan nodes (except triggers)
 * 5. All code nodes have valid jsCode
 * 6. All HTTP request nodes have required fields
 * 7. Environment variable references are consistent
 * 8. MUDANÇA-specific logic is present (keyword detection, cooldown, DM)
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(__dirname, '..', 'workflows', 'comment-mudanca-automation.json');
let errors = [];
let warnings = [];

function error(msg) { errors.push('[ERROR] ' + msg); }
function warn(msg) { warnings.push('[WARN] ' + msg); }
function pass(msg) { console.log('  [PASS] ' + msg); }

console.log('=== MUDANÇA Workflow Structural Validation ===\n');

// 1. Parse JSON
let workflow;
try {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  workflow = JSON.parse(raw);
  pass('Valid JSON');
} catch (e) {
  error('Invalid JSON: ' + e.message);
  console.log('\n' + errors.join('\n'));
  process.exit(1);
}

// 2. Basic structure
if (!workflow.name) error('Missing workflow name');
else pass('Workflow name: ' + workflow.name);

if (!Array.isArray(workflow.nodes)) error('Missing nodes array');
else pass('Nodes count: ' + workflow.nodes.length);

if (!workflow.connections) error('Missing connections');
else pass('Connections defined');

if (!workflow.settings) warn('No settings defined');
else pass('Settings defined');

// 3. Build node name map
const nodeNames = new Set();
const nodeById = {};
const nodeByName = {};

for (const node of workflow.nodes) {
  if (!node.name) { error('Node without name: ' + JSON.stringify(node).slice(0, 100)); continue; }
  if (!node.id) { error('Node without id: ' + node.name); }
  if (!node.type) { error('Node without type: ' + node.name); }
  if (nodeNames.has(node.name)) { error('Duplicate node name: ' + node.name); }
  nodeNames.add(node.name);
  nodeById[node.id] = node;
  nodeByName[node.name] = node;
}
pass('All nodes have names, ids, and types');

// 4. Validate connections
const connectedNodes = new Set();
const connectionSources = Object.keys(workflow.connections);

for (const source of connectionSources) {
  if (!nodeNames.has(source)) {
    error('Connection source "' + source + '" is not a node');
  }
  connectedNodes.add(source);

  const outputs = workflow.connections[source].main;
  if (!Array.isArray(outputs)) { error('Connection for "' + source + '" has no main array'); continue; }

  for (let i = 0; i < outputs.length; i++) {
    const branch = outputs[i];
    if (!Array.isArray(branch)) continue;
    for (const conn of branch) {
      if (!conn.node) { error('Connection from "' + source + '" branch ' + i + ' has no target node'); continue; }
      if (!nodeNames.has(conn.node)) {
        error('Connection target "' + conn.node + '" from "' + source + '" does not exist');
      }
      connectedNodes.add(conn.node);
    }
  }
}
pass('All connection references resolve to existing nodes');

// 5. Check orphan nodes
const triggerTypes = ['n8n-nodes-base.webhook'];
for (const node of workflow.nodes) {
  if (!connectedNodes.has(node.name) && !triggerTypes.includes(node.type)) {
    warn('Orphan node (no connections): ' + node.name);
  }
}

// 6. Validate code nodes
const codeNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code');
for (const node of codeNodes) {
  if (!node.parameters || !node.parameters.jsCode) {
    error('Code node "' + node.name + '" has no jsCode');
  } else {
    try {
      new Function(node.parameters.jsCode);
    } catch (e) {
      if (!e.message.includes('$') && !e.message.includes('is not defined')) {
        warn('Code node "' + node.name + '" may have syntax issue: ' + e.message);
      }
    }
    pass('Code node "' + node.name + '" has jsCode (' + node.parameters.jsCode.length + ' chars)');
  }
}

// 7. Validate HTTP request nodes
const httpNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
for (const node of httpNodes) {
  if (!node.parameters) { error('HTTP node "' + node.name + '" has no parameters'); continue; }
  if (!node.parameters.url) { error('HTTP node "' + node.name + '" has no URL'); }
  if (!node.credentials) { error('HTTP node "' + node.name + '" has no credentials configured'); }
  pass('HTTP node "' + node.name + '" (' + (node.parameters.method || 'GET') + ')');
}

// 8. Validate respondToWebhook nodes
const respondNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.respondToWebhook');
for (const node of respondNodes) {
  if (!node.parameters || !node.parameters.respondWith) {
    warn('Respond node "' + node.name + '" has no respondWith setting');
  }
  pass('Respond node "' + node.name + '" configured');
}

// 9. Check environment variable usage in code nodes
const envVarsUsed = new Set();
for (const node of codeNodes) {
  const code = node.parameters.jsCode;
  const envMatches = code.match(/\$env\.(\w+)/g) || [];
  const envMatches2 = code.match(/\$env\[['"](\w+)['"]\]/g) || [];
  [...envMatches, ...envMatches2].forEach(m => {
    const varName = m.replace(/\$env[.\['"]+/, '').replace(/['\]]+$/, '');
    envVarsUsed.add(varName);
  });
}

console.log('\n  Environment variables used in workflow:');
for (const v of [...envVarsUsed].sort()) {
  console.log('    - ' + v);
}

// 10. Check node references in code ($('NodeName'))
for (const node of codeNodes) {
  const code = node.parameters.jsCode;
  const refs = code.match(/\$\(['"]([^'"]+)['"]\)/g) || [];
  for (const ref of refs) {
    const refName = ref.match(/\$\(['"]([^'"]+)['"]\)/)[1];
    if (!nodeNames.has(refName)) {
      error('Code node "' + node.name + '" references non-existent node: "' + refName + '"');
    }
  }
}

// Also check expression references in HTTP/Respond nodes
for (const node of [...httpNodes, ...respondNodes]) {
  const json = JSON.stringify(node.parameters);
  const refs = json.match(/\$\((?:'|\\')([^'\\]+)(?:'|\\')\)/g) || [];
  for (const ref of refs) {
    const refName = ref.match(/\$\((?:'|\\')([^'\\]+)(?:'|\\')\)/)[1];
    if (!nodeNames.has(refName)) {
      error('Node "' + node.name + '" expression references non-existent node: "' + refName + '"');
    }
  }
}
pass('All inter-node references resolve correctly');

// 11. MUDANÇA-specific validations
console.log('\n  MUDANÇA-specific checks:');

// Check that MUDANÇA keyword detection exists
const parseNode = codeNodes.find(n => n.name.includes('Filter') || n.name.includes('Parse'));
if (parseNode) {
  const code = parseNode.parameters.jsCode;
  if (code.includes('MUDANCA') || code.includes('MUDANÇA')) {
    pass('MUDANÇA keyword detection present');
  } else {
    error('MUDANÇA keyword detection NOT found in parse node');
  }

  if (code.includes('normalize') || code.includes('NFD')) {
    pass('Accent-insensitive normalization present');
  } else {
    warn('No accent normalization found — may miss "MUDANCA" without accent');
  }

  if (code.includes('toUpperCase') || code.includes('toLowerCase')) {
    pass('Case-insensitive matching present');
  } else {
    warn('No case normalization — may miss "mudança"');
  }

  if (code.includes('cooldown') || code.includes('processedUsers')) {
    pass('User deduplication/cooldown present');
  } else {
    warn('No deduplication logic found');
  }

  if (code.includes('MUDANCA_MEDIA_ID')) {
    pass('Media ID filtering present (optional)');
  } else {
    warn('No media ID filtering — will match MUDANÇA on ALL posts');
  }
} else {
  error('No parse/filter node found');
}

// Check that DM generation exists
const dmNode = codeNodes.find(n => n.name.includes('DM') || n.name.includes('Generate'));
if (dmNode) {
  const code = dmNode.parameters.jsCode;
  if (code.includes('openai') || code.includes('chat/completions')) {
    pass('OpenAI DM generation present');
  } else {
    warn('No OpenAI call in DM generation node');
  }

  if (code.includes('SPIN') || code.includes('Situação')) {
    pass('SPIN methodology in DM prompt');
  } else {
    warn('SPIN methodology not found in DM prompt');
  }

  if (code.includes('fallback') || code.includes('Fallback')) {
    pass('Fallback message present (AI failure graceful degradation)');
  } else {
    warn('No fallback message for AI failure');
  }
} else {
  error('No DM generation node found');
}

// Check that Instagram send exists
const sendNode = codeNodes.find(n => n.name.includes('Send') || n.name.includes('Instagram'));
if (sendNode) {
  const code = sendNode.parameters.jsCode;
  if (code.includes('me/messages') || code.includes('graph.instagram')) {
    pass('Instagram DM send present');
  } else {
    warn('Instagram DM send endpoint not found');
  }
} else {
  error('No Instagram DM send node found');
}

// Check consulta stage update
const stageNode = httpNodes.find(n => n.name.includes('Consulta') || n.name.includes('Stage'));
if (stageNode) {
  pass('Consulta stage update node present');
} else {
  warn('No consulta stage update node found');
}

// 12. Flow completeness
const webhookNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.webhook');
const respondToWebhookNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.respondToWebhook');
pass('Webhook entry points: ' + webhookNodes.length);
pass('Response endpoints: ' + respondToWebhookNodes.length);

if (respondToWebhookNodes.length < 2) {
  warn('Expected at least 2 response nodes (OK + Skip)');
}

// Summary
console.log('\n=== RESULTS ===');
console.log('Nodes: ' + workflow.nodes.length);
console.log('Connections: ' + connectionSources.length);
console.log('Code nodes: ' + codeNodes.length);
console.log('HTTP nodes: ' + httpNodes.length);
console.log('Respond nodes: ' + respondToWebhookNodes.length);
console.log('Env vars: ' + envVarsUsed.size);

if (errors.length > 0) {
  console.log('\nERRORS (' + errors.length + '):');
  errors.forEach(e => console.log('  ' + e));
}

if (warnings.length > 0) {
  console.log('\nWARNINGS (' + warnings.length + '):');
  warnings.forEach(w => console.log('  ' + w));
}

if (errors.length === 0) {
  console.log('\n\u2713 MUDANCA workflow structure is VALID');
} else {
  console.log('\n\u2717 MUDANCA workflow has ' + errors.length + ' structural errors');
}

process.exit(errors.length > 0 ? 1 : 0);
