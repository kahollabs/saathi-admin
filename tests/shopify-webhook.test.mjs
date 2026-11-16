import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

import { verifyShopifyHmac, normalizeShopifyPayload, normalizePhone } from '../functions/src/shopify-handler.mjs';

const samplePayload = JSON.parse(
  await readFile(new URL('../fixtures/shopify-abandoned-checkout.json', import.meta.url), 'utf8')
);

test('normalizePhone formats Indian 10-digit, with spaces, and standard E.164 numbers', () => {
  assert.equal(normalizePhone('9871234567'), '+919871234567');
  assert.equal(normalizePhone('+91 98712 34567'), '+919871234567');
  assert.equal(normalizePhone('919871234567'), '+919871234567');
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('123'), null);
});

test('verifyShopifyHmac validates authentic Shopify signatures and rejects tempered payloads', () => {
  const secret = 'shpss_test_secret_key_kahol_labs';
  const rawBody = JSON.stringify(samplePayload);
  const validHmac = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');

  // Authentic payload
  assert.equal(verifyShopifyHmac(rawBody, validHmac, secret), true);

  // Wrong secret
  assert.equal(verifyShopifyHmac(rawBody, validHmac, 'wrong_secret'), false);

  // Tampered body
  const tamperedBody = rawBody.replace('1499.00', '1999.00');
  assert.equal(verifyShopifyHmac(tamperedBody, validHmac, secret), false);

  // Empty inputs
  assert.equal(verifyShopifyHmac('', validHmac, secret), false);
  assert.equal(verifyShopifyHmac(rawBody, '', secret), false);
});

test('normalizeShopifyPayload extracts clean, typed abandoned checkout records', () => {
  const cart = normalizeShopifyPayload(samplePayload);

  assert.equal(cart.checkoutId, '89281726152');
  assert.equal(cart.customerName, 'Rahul Sharma');
  assert.equal(cart.customerPhone, '+919871234567');
  assert.equal(cart.email, 'rahul.sharma@gmail.com');
  assert.equal(cart.totalPrice, 1499);
  assert.equal(cart.currency, 'INR');
  assert.match(cart.checkoutUrl, /recover\?key=saathi9281a/);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].title, 'Everyday Cotton Kurta');
  assert.equal(cart.items[0].variant, 'Sage / Size M');
  assert.equal(cart.items[0].price, 1499);
});
