import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

import { verifyShopifyHmac, normalizeShopifyPayload } from './src/shopify-handler.mjs';
import { verifyMetaWebhook, parseIncomingWhatsAppMessages } from './src/whatsapp-handler.mjs';
import { generateSaathiReply } from './src/gemini-engine.mjs';
import { sendWhatsAppMessage } from './src/meta-api.mjs';

if (!getApps().length) {
  initializeApp();
}

const db = getFirestore();

// Environment parameters with safe defaults
const shopifySecret = defineString('SHOPIFY_WEBHOOK_SECRET', { default: 'saathi_shopify_secret_2026' });
const metaToken = defineString('META_WHATSAPP_TOKEN', { default: '' });
const metaPhoneId = defineString('META_PHONE_NUMBER_ID', { default: '' });
const metaVerifyToken = defineString('META_VERIFY_TOKEN', { default: 'saathi_meta_verify_token_2026' });
const geminiApiKey = defineString('GEMINI_API_KEY', { default: '' });

/**
 * 1. Shopify Webhook Endpoint (checkouts/create or checkouts/update)
 */
export const shopifyWebhook = onRequest(
  {
    region: 'asia-south1',
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: false,
    invoker: 'public'
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const hmac = req.headers['x-shopify-hmac-sha256'];
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const secret = shopifySecret.value() || 'default_saathi_shopify_secret';

    // Verify authenticity
    const isValid = verifyShopifyHmac(rawBody, hmac, secret);
    if (!isValid && process.env.NODE_ENV === 'production') {
      logger.warn('Shopify webhook HMAC mismatch', { hmac });
      res.status(401).json({ error: 'Unauthorized: HMAC verification failed' });
      return;
    }

    try {
      const cart = normalizeShopifyPayload(req.body);
      if (!cart.customerPhone) {
        logger.info('Checkout skipped: No valid customer phone number provided', { checkoutId: cart.checkoutId });
        res.status(200).json({ status: 'skipped', reason: 'Missing phone' });
        return;
      }

      const storeId = req.query.storeId || 'neer';
      const now = Date.now();
      const delayMs = 15 * 60 * 1000; // 15-minute verification delay
      const scheduledCheckAt = Timestamp.fromMillis(now + delayMs);

      const docRef = db.collection('abandoned_checkouts').doc(cart.checkoutId);
      await docRef.set({
        ...cart,
        storeId,
        status: 'waiting_delay',
        scheduledCheckAt,
        createdAt: Timestamp.fromMillis(now),
        updatedAt: Timestamp.fromMillis(now)
      });

      logger.info('Abandoned checkout registered', { checkoutId: cart.checkoutId, storeId, phone: cart.customerPhone });
      res.status(200).json({
        status: 'success',
        checkoutId: cart.checkoutId,
        scheduledCheckAt: now + delayMs
      });
    } catch (err) {
      logger.error('Error processing Shopify webhook', err);
      res.status(500).json({ error: 'Internal server error processing cart' });
    }
  }
);

/**
 * 2. Meta WhatsApp Cloud API Webhook (Inbound shopper replies)
 */
export const whatsappWebhook = onRequest(
  {
    region: 'asia-south1',
    memory: '512MiB',
    timeoutSeconds: 45,
    cors: false,
    invoker: 'public'
  },
  async (req, res) => {
    // A. Meta Webhook Verification (GET)
    if (req.method === 'GET') {
      const verifyToken = metaVerifyToken.value() || 'saathi_meta_verify_token_2026';
      const challenge = verifyMetaWebhook(req.query, verifyToken);
      if (challenge) {
        res.status(200).send(challenge);
      } else {
        res.status(403).send('Forbidden');
      }
      return;
    }

    // B. Inbound Customer WhatsApp Message (POST)
    if (req.method === 'POST') {
      res.status(200).json({ status: 'received' }); // Meta requires fast 200 OK acknowledgment

      const incomingList = parseIncomingWhatsAppMessages(req.body);
      if (!incomingList.length) return;

      for (const msg of incomingList) {
        try {
          logger.info('Processing inbound WhatsApp reply', { from: msg.from, text: msg.text });

          // 1. Find active conversation or latest cart for this phone
          const checkoutsSnap = await db.collection('abandoned_checkouts')
            .where('customerPhone', '==', msg.from)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();

          const cart = checkoutsSnap.empty ? { customerName: msg.name, customerPhone: msg.from } : checkoutsSnap.docs[0].data();
          const storeId = cart.storeId || 'neer';

          // 2. Fetch Store Profile & Knowledge Base
          const storeDoc = await db.collection('stores').doc(storeId).get();
          const storeProfile = storeDoc.exists ? storeDoc.data() : { name: 'Neer Studio' };

          // 3. Fetch recent conversation history
          const convRef = db.collection('conversations').doc(`${storeId}_${msg.from.replace(/\D/g, '')}`);
          const convDoc = await convRef.get();
          const convData = convDoc.exists ? convDoc.data() : { messages: [], humanTakeover: false };

          // If merchant is in human takeover mode, skip AI reply
          if (convData.humanTakeover) {
            logger.info('Human takeover active: skipping AI response', { from: msg.from });
            await convRef.set({
              ...convData,
              updatedAt: Timestamp.now(),
              messages: [...convData.messages, { sender: 'shopper', text: msg.text, timestamp: Date.now() }]
            }, { merge: true });
            continue;
          }

          // 4. Generate intelligent grounded response via Gemini 2.0 Flash
          const aiResponse = await generateSaathiReply({
            shopperMessage: msg.text,
            conversationHistory: convData.messages || [],
            storeProfile,
            cartDetails: cart,
            geminiApiKey: geminiApiKey.value()
          });

          // 5. Dispatch reply via Meta WhatsApp Cloud API
          await sendWhatsAppMessage({
            to: msg.from,
            body: aiResponse.text,
            phoneNumberId: metaPhoneId.value(),
            accessToken: metaToken.value(),
            dryRun: !metaToken.value()
          });

          // 6. Record conversation in Firestore
          await convRef.set({
            storeId,
            customerPhone: msg.from,
            customerName: cart.customerName || msg.name,
            humanTakeover: Boolean(aiResponse.needsHandoff),
            updatedAt: Timestamp.now(),
            messages: [
              ...(convData.messages || []),
              { sender: 'shopper', text: msg.text, timestamp: Date.now() },
              { sender: 'saathi', text: aiResponse.text, timestamp: Date.now(), source: aiResponse.source }
            ]
          }, { merge: true });

          // Update cart status to 'chatting'
          if (!checkoutsSnap.empty) {
            await checkoutsSnap.docs[0].ref.update({
              status: 'chatting',
              updatedAt: Timestamp.now()
            });
          }
        } catch (err) {
          logger.error('Error handling customer WhatsApp reply', err);
        }
      }
      return;
    }

    res.status(405).json({ error: 'Method Not Allowed' });
  }
);

/**
 * 3. Scheduled Worker: 15-Minute Delayed Verification Check
 * Runs every 2 minutes across all active stores
 */
export const processDelayedCheckouts = onSchedule(
  {
    schedule: 'every 2 minutes',
    region: 'asia-south1'
  },
  async () => {
    const now = Timestamp.now();
    logger.info('Running delayed checkouts recovery verification');

    const snap = await db.collection('abandoned_checkouts')
      .where('status', '==', 'waiting_delay')
      .where('scheduledCheckAt', '<=', now)
      .limit(20)
      .get();

    if (snap.empty) {
      logger.info('No checkouts due for recovery outreach');
      return;
    }

    for (const doc of snap.docs) {
      const cart = doc.data();
      const firstItem = cart.items?.[0]?.title || 'item';

      const initialMessage = `Hi ${cart.customerName.split(' ')[0]}! I’m Saathi, your sales assistant from Neer Studio. We noticed you left the ${firstItem} in your cart. Sizing ya fabric ko lekar koi doubt tha kya? Would love to help you find the perfect fit!`;

      // Dispatch initial outreach via WhatsApp
      await sendWhatsAppMessage({
        to: cart.customerPhone,
        body: initialMessage,
        phoneNumberId: metaPhoneId.value(),
        accessToken: metaToken.value(),
        dryRun: !metaToken.value()
      });

      // Update status to outreach_sent
      await doc.ref.update({
        status: 'outreach_sent',
        outreachSentAt: now,
        updatedAt: now
      });

      // Create conversation thread
      const convId = `${cart.storeId}_${cart.customerPhone.replace(/\D/g, '')}`;
      await db.collection('conversations').doc(convId).set({
        storeId: cart.storeId,
        checkoutId: doc.id,
        customerName: cart.customerName,
        customerPhone: cart.customerPhone,
        humanTakeover: false,
        updatedAt: now,
        messages: [
          { sender: 'saathi', text: initialMessage, timestamp: Date.now(), source: 'initial-recovery' }
        ]
      }, { merge: true });

      logger.info('Recovery message sent to shopper', { phone: cart.customerPhone, checkoutId: doc.id });
    }
  }
);

/**
 * 4. Helper API for Merchant Admin: Instant Simulation
 */
export const simulateCart = onRequest(
  {
    region: 'asia-south1',
    cors: true,
    invoker: 'public'
  },
  async (req, res) => {
    const sampleCart = {
      checkoutId: `sim_${Date.now()}`,
      storeId: req.body?.storeId || 'neer',
      customerName: req.body?.name || 'Ananya Roy',
      customerPhone: req.body?.phone || '+919823111094',
      items: [{ title: 'Chanderi Silk Saree', variant: 'Size Free', price: 3499, quantity: 1 }],
      totalPrice: 3499,
      checkoutUrl: 'https://neerstudio.com/checkouts/sim_r9281a',
      status: 'waiting_delay',
      scheduledCheckAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    try {
      await db.collection('abandoned_checkouts').doc(sampleCart.checkoutId).set(sampleCart);
      res.status(200).json({ status: 'success', cart: sampleCart });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
