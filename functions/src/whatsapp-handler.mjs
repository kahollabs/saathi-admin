/**
 * Meta WhatsApp Cloud API Webhook verification & incoming payload parser
 */

/**
 * Handles GET challenge request from Meta during webhook verification
 * @param {object} query - req.query
 * @param {string} verifyToken - Configured META_VERIFY_TOKEN
 * @returns {string|null} - Challenge string if valid, null if forbidden
 */
export function verifyMetaWebhook(query = {}, verifyToken) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return challenge;
  }
  return null;
}

/**
 * Extracts normalized inbound customer messages from Meta WhatsApp webhook payload
 * @param {object} body - req.body from Meta
 * @returns {Array<object>} List of inbound messages
 */
export function parseIncomingWhatsAppMessages(body = {}) {
  const messages = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactMap = new Map();
      contacts.forEach(c => contactMap.set(c.wa_id, c.profile?.name || 'Shopper'));

      const rawMessages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of rawMessages) {
        let content = '';
        if (msg.type === 'text') {
          content = msg.text?.body || '';
        } else if (msg.type === 'button') {
          content = msg.button?.text || '';
        } else if (msg.type === 'interactive') {
          content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
        }

        if (content.trim()) {
          messages.push({
            messageId: msg.id,
            from: `+${msg.from.replace(/\D/g, '')}`,
            name: contactMap.get(msg.from) || 'Customer',
            timestamp: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
            text: content.trim(),
            type: msg.type
          });
        }
      }
    }
  }

  return messages;
}
