import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { verifyMetaWebhook, parseIncomingWhatsAppMessages } from '../functions/src/whatsapp-handler.mjs';

const samplePayload = JSON.parse(
  await readFile(new URL('../fixtures/whatsapp-incoming-message.json', import.meta.url), 'utf8')
);

test('verifyMetaWebhook handles GET challenge handshake correctly', () => {
  const verifyToken = 'my_secure_meta_token_123';
  const query = {
    'hub.mode': 'subscribe',
    'hub.verify_token': verifyToken,
    'hub.challenge': '1154382901'
  };

  assert.equal(verifyMetaWebhook(query, verifyToken), '1154382901');

  // Wrong token
  assert.equal(verifyMetaWebhook(query, 'wrong_token'), null);

  // Missing mode
  assert.equal(verifyMetaWebhook({ ...query, 'hub.mode': 'unsubscribe' }, verifyToken), null);
});

test('parseIncomingWhatsAppMessages extracts customer text and sender details', () => {
  const messages = parseIncomingWhatsAppMessages(samplePayload);

  assert.equal(messages.length, 1);
  const msg = messages[0];
  assert.equal(msg.from, '+919871234567');
  assert.equal(msg.name, 'Rahul Sharma');
  assert.equal(msg.type, 'text');
  assert.match(msg.text, /Bhaiya mera chest 41 inch hai/);
});
