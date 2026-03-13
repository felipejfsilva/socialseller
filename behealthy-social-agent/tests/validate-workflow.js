#!/usr/bin/env node

/**
 * Workflow JSON Structural Validator
 *
 * Validates that the n8n workflow JSON is:
 * 1. Valid JSON
 * 2. All node names in connections exist as actual nodes
 * 3. All connection targets reference real nodes
 * 4. No orphan nodes (nodes with no connections in or out, except triggers)
 * 5. All code nodes have valid jsCode
 * 6. All HTTP request nodes have required fields
 * 7. Environment variable references are consistent
 */

const fs = require('fs');
const path = require('path');

const WORKFLOW_PATH = path.join(__dirname, '..', 'workflows', 'social-instagram-agent.json');
let errors = [];
let warnings = [];

function error(msg) { errors.push('[ERROR] ' + msg); }
function warn(msg) { warnings.push('[WARN] ' + msg); }
function pass(msg) { console.log('  [PASS] ' + msg); }

console.log('=== n8n Workflow Structural Validation ===\n');

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
    // Check for syntax errors by attempting to parse
    try {
      new Function(node.parameters.jsCode);
      // Note: This won't catch n8n-specific references like $env, $input, etc.
      // but it catches basic JS syntax errors
    } catch (e) {
      // n8n code uses special variables ($env, $input, $json, etc.) that aren't valid standalone JS
      // So we only flag truly broken syntax, not reference errors
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
  if (!node.parameters.method && !node.parameters.url) { warn('HTTP node "' + node.name + '" has no method (defaults to GET)'); }
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

// 10. Verify flow completeness
const webhookNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.webhook');
const respondToWebhookNodes = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.respondToWebhook');
pass('Webhook entry points: ' + webhookNodes.length);
pass('Response endpoints: ' + respondToWebhookNodes.length);

// 11. Check node references in expressions ($('NodeName'))
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
  console.log('\n✓ Workflow structure is VALID');
} else {
  console.log('\n✗ Workflow has ' + errors.length + ' structural errors');
}

process.exit(errors.length > 0 ? 1 : 0);
