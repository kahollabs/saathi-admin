import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies Shopify webhook signature using HMAC-SHA256
 * @param {string|Buffer} rawBody - Raw unparsed webhook request body
 * @param {string} hmacHeader - The 'x-shopify-hmac-sha256' header from Shopify
 * @param {string} secret - Shared webhook secret key from store settings
 * @returns {boolean}
 */
export function verifyShopifyHmac(rawBody, hmacHeader, secret) {
  if (!rawBody || !hmacHeader || !secret) return false;
  try {
    const generated = createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    const expectedBuf = Buffer.from(hmacHeader, 'utf8');
    const actualBuf = Buffer.from(generated, 'utf8');

    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

/**
 * Normalizes phone numbers to standard E.164 format (defaults to India +91)
 * @param {string} rawPhone
 * @returns {string|null}
 */
export function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length > 10 && rawPhone.startsWith('+')) return `+${digits}`;
  return null;
}

/**
 * Extracts clean abandoned checkout model from raw Shopify payload
 * @param {object} payload - Shopify checkout payload (from checkouts/create or checkouts/update)
 * @returns {object}
 */
export function normalizeShopifyPayload(payload = {}) {
  const customer = payload.customer || {};
  const shipping = payload.shipping_address || {};
  const billing = payload.billing_address || {};

  const rawPhone = customer.phone || shipping.phone || billing.phone || payload.phone || '';
  const phone = normalizePhone(rawPhone);

  const rawName = customer.first_name
    ? `${customer.first_name} ${customer.last_name || ''}`.trim()
    : shipping.name || billing.name || 'Shopper';

  const lineItems = Array.isArray(payload.line_items) ? payload.line_items : [];
  const items = lineItems.map(item => ({
    title: item.title || 'Item',
    variant: item.variant_title || '',
    quantity: item.quantity || 1,
    price: Number(item.price) || 0,
    sku: item.sku || ''
  }));

  const total = Number(payload.total_price) || 0;
  const checkoutUrl = payload.abandoned_checkout_url || payload.checkout_url || '';

  return {
    checkoutId: String(payload.id || payload.token || Date.now()),
    customerName: rawName,
    customerPhone: phone,
    email: customer.email || payload.email || '',
    items,
    totalPrice: total,
    currency: payload.currency || 'INR',
    checkoutUrl,
    abandonedAt: payload.created_at ? new Date(payload.created_at).getTime() : Date.now(),
    completedAt: payload.completed_at ? new Date(payload.completed_at).getTime() : null
  };
}
