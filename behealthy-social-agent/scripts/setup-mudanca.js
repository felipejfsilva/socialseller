#!/usr/bin/env node

/**
 * Setup script for MUDANÇA Reel Comment Automation
 *
 * Fetches the media ID for the target reel from Instagram Graph API,
 * validates all required environment variables, and outputs the
 * MUDANCA_MEDIA_ID for .env configuration.
 *
 * Usage: node scripts/setup-mudanca.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const REEL_SHORTCODE = 'DWT8AMJxcHH';
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const API_VERSION = 'v21.0';

const REQUIRED_VARS = [
  'KOMMO_BASE_URL',
  'KOMMO_ACCESS_TOKEN',
  'KOMMO_PIPELINE_ID',
  'KOMMO_STATUS_INTERESSE_REAL',
  'KOMMO_STATUS_CONSULTA_AGENDADA',
  'OPENAI_API_KEY',
  'META_ACCESS_TOKEN',
  'INSTAGRAM_ACCOUNT_ID'
];

async function validateEnvVars() {
  console.log('[1/3] Validating environment variables...');

  const missing = REQUIRED_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('  ERROR: Missing environment variables:');
    missing.forEach(v => console.error(`    - ${v}`));
    process.exit(1);
  }

  console.log('  All required variables present.');
}

async function fetchMediaId() {
  console.log(`[2/3] Fetching media ID for reel shortcode: ${REEL_SHORTCODE}...`);

  if (!INSTAGRAM_ACCOUNT_ID || !META_ACCESS_TOKEN) {
    console.warn('  SKIP: INSTAGRAM_ACCOUNT_ID or META_ACCESS_TOKEN not set.');
    console.warn('  You will need to set MUDANCA_MEDIA_ID manually in .env');
    return null;
  }

  const url = `https://graph.instagram.com/${API_VERSION}/${INSTAGRAM_ACCOUNT_ID}/media?fields=id,shortcode,caption,timestamp&limit=50&access_token=${META_ACCESS_TOKEN}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      const text = await response.text();
      console.error(`  ERROR: Instagram API returned ${response.status}: ${text}`);
      console.warn('  You will need to set MUDANCA_MEDIA_ID manually.');
      return null;
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      console.warn('  No media found for this account.');
      return null;
    }

    // Search for the reel by shortcode
    const reel = data.data.find(m => m.shortcode === REEL_SHORTCODE);

    if (reel) {
      console.log(`  Found reel: ID=${reel.id}, shortcode=${reel.shortcode}`);
      if (reel.caption) {
        console.log(`  Caption: "${reel.caption.substring(0, 80)}..."`);
      }
      return reel.id;
    }

    // If not in first 50, try pagination
    let nextUrl = data.paging && data.paging.next;
    let page = 2;

    while (nextUrl && page <= 10) {
      console.log(`  Searching page ${page}...`);
      const nextResp = await fetch(nextUrl, { signal: AbortSignal.timeout(15000) });
      if (!nextResp.ok) break;

      const nextData = await nextResp.json();
      if (!nextData.data || nextData.data.length === 0) break;

      const found = nextData.data.find(m => m.shortcode === REEL_SHORTCODE);
      if (found) {
        console.log(`  Found reel on page ${page}: ID=${found.id}`);
        return found.id;
      }

      nextUrl = nextData.paging && nextData.paging.next;
      page++;
    }

    console.warn(`  Reel with shortcode ${REEL_SHORTCODE} not found in account media.`);
    console.warn('  This may be because:');
    console.warn('    - The reel is too old (API returns recent posts first)');
    console.warn('    - The shortcode is from a different account');
    console.warn('  You can set MUDANCA_MEDIA_ID manually in .env');
    return null;
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    console.warn('  You will need to set MUDANCA_MEDIA_ID manually.');
    return null;
  }
}

async function validateKommoAccess() {
  console.log('[3/3] Validating Kommo CRM access...');

  try {
    const response = await fetch(`${process.env.KOMMO_BASE_URL}/users`, {
      headers: { 'Authorization': `Bearer ${process.env.KOMMO_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      console.error(`  ERROR: Kommo API returned ${response.status}`);
      console.error('  Check KOMMO_ACCESS_TOKEN in .env');
      process.exit(1);
    }

    console.log('  Kommo API access confirmed.');
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('=== MUDANCA Reel Automation Setup ===\n');

  await validateEnvVars();
  const mediaId = await fetchMediaId();
  await validateKommoAccess();

  console.log('\n=== Setup Summary ===');
  console.log(`  Reel shortcode: ${REEL_SHORTCODE}`);
  console.log(`  Reel URL: https://www.instagram.com/reel/${REEL_SHORTCODE}/`);

  if (mediaId) {
    console.log(`  Media ID: ${mediaId}`);
    console.log(`\n  Add to your .env file:`);
    console.log(`  MUDANCA_MEDIA_ID=${mediaId}`);
  } else {
    console.log('  Media ID: NOT FOUND (workflow will match MUDANCA on ALL posts)');
    console.log('\n  To restrict to this specific reel, set MUDANCA_MEDIA_ID manually:');
    console.log(`  1. Open: https://graph.instagram.com/${API_VERSION}/${INSTAGRAM_ACCOUNT_ID}/media?fields=id,shortcode&access_token=YOUR_TOKEN`);
    console.log(`  2. Find the entry with shortcode "${REEL_SHORTCODE}"`);
    console.log('  3. Copy the "id" value to MUDANCA_MEDIA_ID in .env');
  }

  console.log('\n  Pipeline stages used:');
  console.log(`    Interesse Real: ${process.env.KOMMO_STATUS_INTERESSE_REAL}`);
  console.log(`    Consulta Agendada: ${process.env.KOMMO_STATUS_CONSULTA_AGENDADA}`);

  console.log('\n  Next steps:');
  console.log('    1. npm run import:mudanca     (import workflow into n8n)');
  console.log('    2. npm run test:mudanca        (validate workflow structure)');
  console.log('    3. Activate workflow in n8n UI');
  console.log('    4. npm run test:mudanca:webhook (test with simulated comment)');

  console.log('\n  Setup complete.');
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
