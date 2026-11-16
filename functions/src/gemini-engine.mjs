/**
 * Saathi by Kahol Labs - Gemini 2.0 Flash AI Sales Partner Engine
 */

/**
 * Builds the strict system prompt grounding Saathi in the store's Knowledge Base
 */
export function buildSaathiSystemPrompt(storeProfile, cartDetails) {
  const kb = storeProfile.knowledgeBase || {};
  const itemsList = (cartDetails.items || [])
    .map(i => `${i.quantity}x ${i.title} (${i.variant || 'Standard'}) - ₹${i.price}`)
    .join(', ');

  return `
You are "Saathi" (साथी), the dedicated AI Sales Partner for "${storeProfile.name || 'our store'}", built by Kahol Labs.
You are talking to a shopper on WhatsApp who abandoned their checkout.

STORE KNOWLEDGE BASE & GROUNDING:
- Brand Tone: ${kb.tone || 'Warm, respectful, conversational Indian boutique (Hinglish/English friendly)'}
- Sizing Chart & Fit Rules:
${kb.sizingChart || 'S: 36-38 in, M: 38-40 in, L: 40-42 in, XL: 42-44 in. In between sizes -> suggest larger size.'}
- Fabric & Quality Details:
${kb.fabricCare || '100% pre-shrunk organic cotton. Cold gentle wash recommended. Does not shrink more than 1%.'}
- Shipping, Returns & COD Policies:
${kb.policy || 'Free delivery across India in 3-5 days. 7-day hassle-free exchange. COD available for orders under ₹5,000.'}

SHOPPER'S ABANDONED CART CONTEXT:
- Customer Name: ${cartDetails.customerName || 'Shopper'}
- Cart Items: ${itemsList || 'Items'}
- Total Amount: ₹${cartDetails.totalPrice || 0}
- 1-Click Checkout Link: ${cartDetails.checkoutUrl || '#'}

STRICT SALES RULES:
1. Always be polite, warm, and concise (under 3 sentences per WhatsApp message).
2. Answer sizing doubts strictly based on the Sizing Chart. Explain *why* that size fits.
3. Never invent unauthorized discount codes or fake promises.
4. End with a helpful, friendly call to action with the 1-Click Checkout link.
5. If the shopper asks for custom stitching, alterations, or wants a human manager, set handover flag to true.
`.trim();
}

/**
 * Generates an autonomous reply via Gemini 2.0 Flash
 */
export async function generateSaathiReply({
  shopperMessage,
  conversationHistory = [],
  storeProfile = {},
  cartDetails = {},
  geminiApiKey = ''
}) {
  const systemPrompt = buildSaathiSystemPrompt(storeProfile, cartDetails);

  // If no Gemini API key is provided, use deterministic rule-based grounding
  if (!geminiApiKey) {
    return generateLocalFallbackReply(shopperMessage, storeProfile, cartDetails);
  }

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I am Saathi, ready to assist the shopper warmly and accurately.' }] }
  ];

  for (const msg of conversationHistory) {
    contents.push({
      role: msg.sender === 'saathi' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    });
  }

  contents.push({
    role: 'user',
    parts: [{ text: shopperMessage }]
  });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 250
        }
      })
    });

    if (!res.ok) {
      return generateLocalFallbackReply(shopperMessage, storeProfile, cartDetails);
    }

    const data = await res.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!replyText) {
      return generateLocalFallbackReply(shopperMessage, storeProfile, cartDetails);
    }

    return {
      text: replyText,
      needsHandoff: /connect you with our|human stylist|manager/i.test(replyText),
      source: 'gemini-2.0-flash'
    };
  } catch {
    return generateLocalFallbackReply(shopperMessage, storeProfile, cartDetails);
  }
}

/**
 * Rule-based fallback grounded in the store's knowledge base
 */
export function generateLocalFallbackReply(message = '', storeProfile = {}, cartDetails = {}) {
  const text = message.toLowerCase();
  const link = cartDetails.checkoutUrl || 'https://store.kaholsaathi.com/checkout';

  // 1. Sizing query
  const chestMatch = text.match(/(\d{2})\s*(?:inch|inches|in|\")/i);
  if (chestMatch) {
    const chest = parseInt(chestMatch[1], 10);
    let size = 'M';
    if (chest <= 38) size = 'S (36–38 in)';
    else if (chest <= 40) size = 'M (38–40 in)';
    else if (chest <= 42) size = 'L (40–42 in)';
    else if (chest <= 44) size = 'XL (42–44 in)';
    else size = 'XXL (44–46 in)';

    return {
      text: `${chest}-inch chest measurement ke liye ${size} bilkul comfortable aayega! Maine aapki cart update kar di hai aur 7-day free exchange policy bhi hai. You can complete your order here: ${link}`,
      needsHandoff: false,
      source: 'rules-sizing'
    };
  }

  // 2. Fabric / Shrinkage query
  if (/shrink|cotton|fabric|wash|kapda/i.test(text)) {
    return {
      text: `Humara saara collection 100% pre-shrunk organic cotton hai with natural handblock dyes! Normal cold gentle wash par shrink nahi hota. You can safely complete your order here: ${link}`,
      needsHandoff: false,
      source: 'rules-fabric'
    };
  }

  // 3. Human assistance / Custom alteration
  if (/custom|alter|stitching|human|call|pico/i.test(text)) {
    return {
      text: `Bilkul, custom alteration aur special requests ke liye main hamari lead stylist ko aapki chat assign kar raha hoon. They will assist you shortly!`,
      needsHandoff: true,
      source: 'rules-escalation'
    };
  }

  // 4. General recovery nudge
  return {
    text: `Ji bilkul! Agar checkout ya delivery me koi bhi doubt ho toh I'm right here to help. You can complete your order easily here: ${link}`,
    needsHandoff: false,
    source: 'rules-general'
  };
}
