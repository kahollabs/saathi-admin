/**
 * Meta WhatsApp Cloud API Client
 */

/**
 * Sends a WhatsApp message via Meta Cloud API
 * @param {object} params
 * @param {string} params.to - Recipient phone number in E.164 (e.g. +919871234567)
 * @param {string} params.body - Message text
 * @param {string} params.phoneNumberId - Meta Phone Number ID
 * @param {string} params.accessToken - Meta Cloud API Access Token
 * @param {boolean} [params.dryRun=false] - If true, skips actual HTTP call (for testing)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
export async function sendWhatsAppMessage({
  to,
  body,
  phoneNumberId,
  accessToken,
  dryRun = false
}) {
  if (!to || !body) {
    return { success: false, error: 'Recipient phone number and message body are required' };
  }

  // Normalize phone number (strip leading + for Meta API)
  const recipient = to.replace(/\D/g, '');

  if (dryRun || !phoneNumberId || !accessToken) {
    // Return simulated success for dev/test mode
    return {
      success: true,
      messageId: `sim_wamid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      simulated: true
    };
  }

  const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: true, body }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      const err = data.error?.message || 'Failed to dispatch WhatsApp message via Meta API';
      return { success: false, error: err };
    }

    const messageId = data.messages?.[0]?.id || `wamid_${Date.now()}`;
    return { success: true, messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
