import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSaathiSystemPrompt,
  generateLocalFallbackReply,
  generateSaathiReply
} from '../functions/src/gemini-engine.mjs';

const storeProfile = {
  name: 'Neer Studio',
  knowledgeBase: {
    tone: 'Warm, respectful Indian boutique (Hinglish/English friendly)',
    sizingChart: 'S: 36-38 in, M: 38-40 in, L: 40-42 in, XL: 42-44 in',
    fabricCare: '100% pre-shrunk organic cotton and handblock dyes. Will not shrink >1%.',
    policy: 'Free shipping 3-5 days. 7-day hassle-free exchange. COD under ₹5k.'
  }
};

const cartDetails = {
  customerName: 'Rahul Sharma',
  totalPrice: 1499,
  checkoutUrl: 'https://neerstudio.com/checkouts/r9281a',
  items: [{ title: 'Everyday Cotton Kurta', variant: 'Sage (M)', price: 1499, quantity: 1 }]
};

test('buildSaathiSystemPrompt injects store sizing rules and brand tone', () => {
  const prompt = buildSaathiSystemPrompt(storeProfile, cartDetails);

  assert.match(prompt, /Neer Studio/);
  assert.match(prompt, /Rahul Sharma/);
  assert.match(prompt, /Everyday Cotton Kurta/);
  assert.match(prompt, /S: 36-38 in, M: 38-40 in/);
  assert.match(prompt, /100% pre-shrunk organic cotton/);
});

test('generateLocalFallbackReply resolves 41-inch chest query to Size L', () => {
  const res = generateLocalFallbackReply(
    'Bhaiya mera chest 41 inch hai, M fit aayega ya L lena chahiye?',
    storeProfile,
    cartDetails
  );

  assert.equal(res.needsHandoff, false);
  assert.match(res.text, /41-inch/);
  assert.match(res.text, /L \(40–42 in\)/);
  assert.match(res.text, /neerstudio\.com\/checkouts\/r9281a/);
});

test('generateLocalFallbackReply handles fabric shrinkage queries accurately', () => {
  const res = generateLocalFallbackReply(
    'Will this kurta shrink after washing? Is it pure cotton?',
    storeProfile,
    cartDetails
  );

  assert.equal(res.needsHandoff, false);
  assert.match(res.text, /100% pre-shrunk organic cotton/);
  assert.match(res.text, /shrink nahi hota/);
});

test('generateLocalFallbackReply flags custom alteration for human handoff', () => {
  const res = generateLocalFallbackReply(
    'Can you do custom stitching or fall-pico alteration before dispatch?',
    storeProfile,
    cartDetails
  );

  assert.equal(res.needsHandoff, true);
  assert.match(res.text, /lead stylist/);
});

test('generateSaathiReply uses local fallback cleanly when API key is omitted in tests', async () => {
  const res = await generateSaathiReply({
    shopperMessage: 'Mera chest 39 inch hai',
    conversationHistory: [],
    storeProfile,
    cartDetails,
    geminiApiKey: ''
  });

  assert.equal(res.needsHandoff, false);
  assert.match(res.text, /39-inch/);
  assert.match(res.text, /M \(38–40 in\)/);
});
