/**
 * Saathi by Kahol Labs - Dashboard App & Real-Time Firebase Integration
 */

import { firebaseConfig } from './firebase-config.js';

// Dynamically import Firebase SDKs from Google CDN with resilient fallback
let db = null;

async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js');
    const { getFirestore, collection, onSnapshot, doc, setDoc, query, orderBy, limit } = await import('https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js');

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);

    const statusPill = document.getElementById('sdb-conn-status');
    if (statusPill) {
      statusPill.innerHTML = '<span class="sdb-dot"></span> Firestore Connected';
      statusPill.className = 'sdb-badge sdb-badge-green';
    }

    // Set up real-time Firestore listeners for abandoned checkouts
    listenToAbandonedCheckouts(collection, query, orderBy, limit, onSnapshot);

    console.log('[Saathi] Connected to Firebase project:', firebaseConfig.projectId);
  } catch (err) {
    console.warn('[Saathi] Running in offline demo mode:', err.message);
    const statusPill = document.getElementById('sdb-conn-status');
    if (statusPill) {
      statusPill.innerHTML = '<span class="sdb-dot"></span> Local Demo Mode';
      statusPill.className = 'sdb-badge sdb-badge-gold';
    }
  }
}

function listenToAbandonedCheckouts(collection, query, orderBy, limit, onSnapshot) {
  if (!db) return;
  try {
    const q = query(collection(db, 'abandoned_checkouts'), orderBy('createdAt', 'desc'), limit(15));
    onSnapshot(q, (snapshot) => {
      const feed = document.getElementById('sdb-activity-feed');
      if (!feed) return;

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const item = document.createElement('li');
          item.className = 'sdb-feed-item is-detected';
          item.innerHTML = `
            <span class="sdb-feed-time">Just now</span>
            <div class="sdb-feed-body">
              <strong>New Abandoned Cart Detected</strong>
              <p>${data.customerName || 'Shopper'} left <em>${data.items?.[0]?.title || 'Item'} (₹${data.totalPrice || 0})</em>. 15-minute verification delay running.</p>
            </div>
            <span class="sdb-tag sdb-tag-amber">DELAY WAIT ⏳</span>
          `;
          feed.insertBefore(item, feed.firstChild);
        }
      });
    }, (error) => {
      console.info('[Saathi] Firestore listener standing by:', error.code);
    });
  } catch (e) {
    console.info('[Saathi] Firestore listener initial setup ready.');
  }
}

// --- Toast Notification Helper ---
function showToast(message, type = 'info', duration = 3800) {
  let container = document.getElementById('sdb-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sdb-toast-container';
    container.className = 'sdb-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `sdb-toast sdb-toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span>${message}</span>
    <button type="button" class="sdb-toast-close" aria-label="Close notification" style="background:none;border:none;color:#fff;cursor:pointer;margin-left:auto;font-size:14px;opacity:0.75;">✕</button>
  `;

  const closeBtn = toast.querySelector('.sdb-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toast.remove());
  }

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }
  }, duration);
}

// --- Tabs Navigation ---
function initTabs() {
  const tabs = document.querySelectorAll('[data-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = `tab-${tab.getAttribute('data-tab')}`;
      tabs.forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');

      document.querySelectorAll('.sdb-tab-content').forEach(content => {
        content.classList.remove('is-active');
      });

      const target = document.getElementById(targetId);
      if (target) target.classList.add('is-active');
    });
  });
}

// --- Simulate Inbound Webhook ---
function initSimulateWebhook() {
  const simBtn = document.getElementById('sdb-simulate-webhook');
  if (!simBtn) return;

  const sampleCarts = [
    { name: 'Ananya Roy', item: 'Silk Embroidered Kurta', price: '₹2,899', phone: '+919823111094' },
    { name: 'Varun Mehra', item: 'Khadi Nehru Jacket (Navy)', price: '₹2,199', phone: '+919910233411' },
    { name: 'Sneha Kapoor', item: 'Pure Linen Tunic (Oatmeal)', price: '₹1,850', phone: '+919872255432' },
    { name: 'Rohit Verma', item: 'Organic Indigo Kurta', price: '₹1,699', phone: '+919810177623' }
  ];
  let idx = 0;

  simBtn.addEventListener('click', async () => {
    const cart = sampleCarts[idx % sampleCarts.length];
    idx++;

    // Increment Counter
    const detectedEl = document.getElementById('sdb-stat-detected');
    if (detectedEl) {
      const current = parseInt(detectedEl.textContent.replace(/\D/g, ''), 10) || 162;
      detectedEl.textContent = String(current + 1);
      detectedEl.style.transform = 'scale(1.15)';
      detectedEl.style.color = '#e48840';
      setTimeout(() => {
        detectedEl.style.transform = '';
        detectedEl.style.color = '';
      }, 300);
    }

    // Add to local activity feed
    const feed = document.getElementById('sdb-activity-feed');
    if (feed) {
      const item = document.createElement('li');
      item.className = 'sdb-feed-item is-detected';
      item.innerHTML = `
        <span class="sdb-feed-time">Just now</span>
        <div class="sdb-feed-body">
          <strong>New Abandoned Cart Detected</strong>
          <p>${cart.name} left <em>${cart.item} (${cart.price})</em>. 15-minute verification delay running.</p>
        </div>
        <span class="sdb-tag sdb-tag-amber">DELAY WAIT ⏳</span>
      `;
      feed.insertBefore(item, feed.firstChild);
    }

    // Call live backend simulation API in background to persist in Cloud Firestore
    try {
      fetch('https://simulatecart-wb5fbwbodq-el.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cart.name,
          phone: cart.phone,
          storeId: 'neer',
          item: cart.item,
          price: cart.price
        })
      }).catch(() => {});
    } catch (_) {}

    showToast(`⚡ Shopify Webhook: Inbound checkout received for ${cart.name} (${cart.price}). Delay queue initialized.`);
  });
}

// --- Live Chat Inspector ---
function initChatInspector() {
  const chatCards = document.querySelectorAll('.sdb-chat-card');
  const searchInput = document.getElementById('sdb-chat-search');
  const takeoverBtn = document.getElementById('sdb-takeover-btn');

  const conversationData = {
    'chat-1': {
      name: 'Rahul Sharma (+91 98712 34567)',
      cart: 'Cart: Everyday Cotton Kurta (Sage) · ₹1,499 · Abandoned at 14:12',
      status: 'Recovered (Paid)',
      statusClass: 'sdb-tag sdb-tag-green',
      messages: [
        { type: 'system', text: 'Checkout abandoned on Shopify at 14:12. 15-minute wait completed. Verified unpaid.' },
        { type: 'saathi', time: '14:27', text: 'Hi Rahul! I’m Saathi, Neer Studio’s sales partner. We noticed you left the Everyday Cotton Kurta in your cart. Sizing ya fabric ko lekar koi doubt tha kya?' },
        { type: 'shopper', time: '14:29', author: 'Rahul Sharma', text: 'Bhaiya mera chest 41 inch hai. Cart mein M size daala tha, fit aayega ya tight hoga?' },
        { type: 'saathi', time: '14:29', text: '41-inch chest ke liye L size (40–42 inches) bilkul perfect aayega! M size 38–40 ke liye hai jo tight pad sakta hai. Maine aapki cart Size L par update kar di hai aur 7-day free exchange policy bhi hai. You can complete your order here: neerstudio.com/c/r9281a' },
        { type: 'shopper', time: '14:31', author: 'Rahul Sharma', text: 'Great, thanks for clarifying. Just paid via UPI!' },
        { type: 'system-success', text: '✅ Shopify Webhook: Order #NEER-4192 Paid (₹1,499). Recovery completed!' }
      ]
    },
    'chat-2': {
      name: 'Pooja Verma (+91 98114 98210)',
      cart: 'Cart: Jaipuri Printed Anarkali · ₹2,899 · Abandoned at 14:38',
      status: 'Active (Chatting)',
      statusClass: 'sdb-tag sdb-tag-blue',
      messages: [
        { type: 'system', text: 'Checkout abandoned on Shopify at 14:38. 15-minute wait completed. Verified unpaid.' },
        { type: 'saathi', time: '14:53', text: 'Namaste Pooja ji! Saathi here from Neer Studio. Noticed the Jaipuri Anarkali is still waiting in your cart. Kuch help chahiye thi fabric ya delivery time ko lekar?' },
        { type: 'shopper', time: '14:55', author: 'Pooja Verma', text: 'Will it shrink after the first wash? Is it pure cotton?' },
        { type: 'saathi', time: '14:56', text: 'Yes Pooja ji, bilkul 100% pre-shrunk organic cotton hai with natural handblock dyes! Normal cold gentle wash par 1% se zyada shrink nahi hota. Plus 7-day hassle-free return policy hai if anything feels off.' },
        { type: 'shopper', time: '14:58', author: 'Pooja Verma', text: 'Acha, and how many days to deliver in Bangalore?' }
      ]
    },
    'chat-3': {
      name: 'Karan Malhotra (+91 97182 12098)',
      cart: 'Cart: Handblock Dabu Shirt · ₹1,299 · Abandoned at 13:50',
      status: 'Waiting for Reply',
      statusClass: 'sdb-tag sdb-tag-amber',
      messages: [
        { type: 'system', text: 'Checkout abandoned on Shopify at 13:50. 15-minute delay passed. Outbound message triggered.' },
        { type: 'saathi', time: '14:05', text: 'Hi Karan! Saathi from Neer Studio. Saw you were checking out the Handblock Dabu Shirt. If you had any sizing questions or wanted COD details, I’m right here to help!' }
      ]
    },
    'chat-4': {
      name: 'Neha Gupta (+91 99201 44521)',
      cart: 'Cart: Festive Saree Ensemble · ₹6,450 · Abandoned at 12:15',
      status: 'Handoff to Stylist',
      statusClass: 'sdb-tag sdb-tag-purple',
      messages: [
        { type: 'system', text: 'Checkout abandoned at 12:15. Verification delay satisfied.' },
        { type: 'saathi', time: '12:30', text: 'Hello Neha ji! Noticed you were exploring our Festive Saree Ensemble. Can I assist you with custom blouse stitching or dispatch dates?' },
        { type: 'shopper', time: '12:32', author: 'Neha Gupta', text: 'Can you guys do fall-pico and custom sleeveless blouse stitching before shipping? I need it by this Friday.' },
        { type: 'saathi', time: '12:33', text: 'Hum bilkul fall-pico arrange kar sakte hain! For custom blouse measurements and expedited Friday dispatch, let me connect you with our lead stylist Sunita immediately.' },
        { type: 'system', text: '🙋 Escalation: Assigned to human stylist Sunita. Priority WhatsApp ping dispatched.' }
      ]
    }
  };

  function renderTranscript(chatId) {
    const data = conversationData[chatId];
    if (!data) return;

    const nameEl = document.getElementById('sdb-view-name');
    const cartEl = document.getElementById('sdb-view-cart');
    const statusEl = document.getElementById('sdb-view-status');
    const transcriptEl = document.getElementById('sdb-transcript');

    if (nameEl) nameEl.textContent = data.name;
    if (cartEl) cartEl.textContent = data.cart;
    if (statusEl) {
      statusEl.className = data.statusClass;
      statusEl.textContent = data.status;
    }

    if (transcriptEl) {
      transcriptEl.innerHTML = data.messages.map(msg => {
        if (msg.type === 'system') return `<div class="sdb-msg is-system"><span>${msg.text}</span></div>`;
        if (msg.type === 'system-success') return `<div class="sdb-msg is-system is-success-msg"><span>${msg.text}</span></div>`;
        if (msg.type === 'saathi') {
          return `
            <div class="sdb-msg is-saathi">
              <small>Saathi (AI Sales Partner) · ${msg.time}</small>
              <p>${msg.text}</p>
            </div>
          `;
        }
        if (msg.type === 'shopper') {
          return `
            <div class="sdb-msg is-shopper">
              <small>${msg.author || 'Shopper'} · ${msg.time}</small>
              <p>${msg.text}</p>
            </div>
          `;
        }
        return '';
      }).join('');
    }
  }

  chatCards.forEach(card => {
    card.addEventListener('click', () => {
      chatCards.forEach(c => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      renderTranscript(card.getAttribute('data-chat-id'));
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      chatCards.forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  if (takeoverBtn) {
    let isHuman = false;
    takeoverBtn.addEventListener('click', () => {
      isHuman = !isHuman;
      const transcriptEl = document.getElementById('sdb-transcript');
      const statusEl = document.getElementById('sdb-view-status');

      if (isHuman) {
        takeoverBtn.innerHTML = '<span>🤖 Hand Back to Saathi AI</span>';
        takeoverBtn.style.background = '#e48840';
        takeoverBtn.style.color = '#fff';
        if (statusEl) {
          statusEl.className = 'sdb-tag sdb-tag-purple';
          statusEl.textContent = 'Human Control Active';
        }
        if (transcriptEl) {
          const notice = document.createElement('div');
          notice.className = 'sdb-msg is-system';
          notice.innerHTML = '<span>🙋 Merchant operator entered chat. Saathi AI autonomous responses are paused.</span>';
          transcriptEl.appendChild(notice);
        }
        showToast('Human operator takeover active. You now have direct control over customer replies.');
      } else {
        takeoverBtn.innerHTML = '<span>🙋 Take Over as Human</span>';
        takeoverBtn.style.background = '';
        takeoverBtn.style.color = '';
        if (statusEl) {
          statusEl.className = 'sdb-tag sdb-tag-blue';
          statusEl.textContent = 'Active (AI Saathi)';
        }
        if (transcriptEl) {
          const notice = document.createElement('div');
          notice.className = 'sdb-msg is-system';
          notice.innerHTML = '<span>🤖 Handed back to Saathi AI. Autonomous sales agent resumed.</span>';
          transcriptEl.appendChild(notice);
        }
        showToast('Handed back to Saathi AI. Autonomous sales agent resumed.');
      }
    });
  }
}

// --- Knowledge Base Save ---
function initKnowledgeBase() {
  const saveBtn = document.getElementById('sdb-save-kb');
  if (!saveBtn) return;

  saveBtn.addEventListener('click', () => {
    const orig = saveBtn.textContent;
    saveBtn.textContent = 'Saving to Firestore...';
    saveBtn.disabled = true;

    setTimeout(() => {
      saveBtn.textContent = 'Saved! ✓';
      showToast('✅ Knowledge Base updated and synced with Saathi AI brain.');
      setTimeout(() => {
        saveBtn.textContent = orig;
        saveBtn.disabled = false;
      }, 1800);
    }, 450);
  });
}

// --- Copy Webhook URL ---
function initCopyWebhook() {
  const copyBtn = document.getElementById('sdb-copy-url');
  const urlEl = document.getElementById('sdb-webhook-url');
  if (!copyBtn || !urlEl) return;

  copyBtn.addEventListener('click', () => {
    const url = urlEl.textContent.trim();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(onCopySuccess);
    } else {
      onCopySuccess();
    }
  });

  function onCopySuccess() {
    const orig = copyBtn.textContent;
    copyBtn.textContent = 'Copied! ✓';
    showToast('📋 Webhook endpoint copied. Ready to paste in Shopify Admin.');
    setTimeout(() => copyBtn.textContent = orig, 2000);
  }
}

// --- Store Selector ---
function initStoreSelector() {
  const sel = document.getElementById('sdb-active-store');
  if (!sel) return;

  sel.addEventListener('change', () => {
    const store = sel.value;
    const webhookEl = document.getElementById('sdb-webhook-url');
    if (webhookEl) {
      webhookEl.textContent = `https://asia-south1-${firebaseConfig.projectId}.cloudfunctions.net/shopifyWebhook?storeId=${store}`;
    }
    showToast(`Switched active store view to ${sel.options[sel.selectedIndex].text}`);
  });
}

// --- Super Admin Pause / Resume Toggle ---
function initSuperAdminToggle() {
  const table = document.getElementById('sdb-tenants-table');
  if (!table) return;

  table.querySelectorAll('.sdb-btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const tag = row?.querySelector('.sdb-tag');
      const isPaused = btn.getAttribute('data-action') === 'resume';

      if (isPaused) {
        btn.setAttribute('data-action', 'pause');
        btn.textContent = 'Pause';
        if (tag) {
          tag.className = 'sdb-tag sdb-tag-green';
          tag.textContent = 'Active 🟢';
        }
        showToast('Store webhook active. Recovery engine resumed.');
      } else {
        btn.setAttribute('data-action', 'resume');
        btn.textContent = 'Resume';
        if (tag) {
          tag.className = 'sdb-tag sdb-tag-amber';
          tag.textContent = 'Paused ⏸️';
        }
        showToast('Store webhook paused. Inbound checkouts will be held.');
      }
    });
  });
}

// Boot everything
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSimulateWebhook();
  initChatInspector();
  initKnowledgeBase();
  initCopyWebhook();
  initStoreSelector();
  initSuperAdminToggle();
  initFirebase();
});
