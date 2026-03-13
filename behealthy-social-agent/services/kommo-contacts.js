/**
 * Kommo CRM — Contact Management Service
 *
 * Handles contact lookup, creation, and duplicate prevention.
 * Used by the n8n workflow via Code nodes.
 */

const BASE_URL = process.env.KOMMO_BASE_URL || 'https://felipebhcrm.kommo.com/api/v4';
const TOKEN = process.env.KOMMO_ACCESS_TOKEN;

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

/**
 * Search for existing contact by Instagram username, phone, or name.
 * Returns the first match or null.
 */
async function findContact(query) {
  const url = `${BASE_URL}/contacts?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { method: 'GET', headers });

  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Contact search failed: ${response.status}`);

  const data = await response.json();
  if (data._embedded && data._embedded.contacts && data._embedded.contacts.length > 0) {
    return data._embedded.contacts[0];
  }
  return null;
}

/**
 * Search for contact across multiple fields to prevent duplicates.
 * Checks: instagram_username, phone, name.
 */
async function findContactDedup({ instagram_username, phone, name }) {
  const queries = [instagram_username, phone, name].filter(Boolean);

  for (const query of queries) {
    const contact = await findContact(query);
    if (contact) return contact;
  }
  return null;
}

/**
 * Create a new contact in Kommo.
 */
async function createContact({ name, instagram_username, phone }) {
  const customFields = [];

  if (instagram_username) {
    customFields.push({
      field_code: 'IM',
      values: [{ value: instagram_username, enum_code: 'OTHER' }]
    });
  }

  if (phone) {
    customFields.push({
      field_code: 'PHONE',
      values: [{ value: phone }]
    });
  }

  const body = [
    {
      name: name || instagram_username || 'Instagram Lead',
      custom_fields_values: customFields,
      _embedded: {
        tags: [{ name: 'instagram' }, { name: 'social-selling' }]
      }
    }
  ];

  const response = await fetch(`${BASE_URL}/contacts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Contact creation failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data._embedded.contacts[0];
}

/**
 * Get or create contact — main entry point for the workflow.
 * Prevents duplicates by searching first.
 */
async function getOrCreateContact({ name, instagram_username, phone }) {
  const existing = await findContactDedup({ instagram_username, phone, name });

  if (existing) {
    return { contact: existing, created: false };
  }

  const newContact = await createContact({ name, instagram_username, phone });
  return { contact: newContact, created: true };
}

module.exports = { findContact, findContactDedup, createContact, getOrCreateContact };
