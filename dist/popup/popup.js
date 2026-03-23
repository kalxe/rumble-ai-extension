// ═══════════════════════════════════════════════════════════
// popup.js — Extension Popup Logic
// ═══════════════════════════════════════════════════════════
// Handles all UI interactions and communicates with background.js

// ─── CHAT STATE ─────────────────────────────────────
const chatHistory = []; // { role: 'user'|'assistant', content: string }

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadDashboard();
  loadRules();
  loadHistory();
  loadAgentTab();
  loadSettings();
  setupEventListeners();
  setupChat();
});

// ─── TAB NAVIGATION ────────────────────────────────
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(targetId).classList.add('active');
    });
  });
}

// ─── DASHBOARD ─────────────────────────────────────
async function loadDashboard() {
  // Load stats
  const stats = await sendMessage('GET_STATS');
  if (stats) {
    document.getElementById('totalTips').textContent = stats.totalTips || 0;
    document.getElementById('totalAmount').textContent = `$${(stats.totalAmount || 0).toFixed(2)}`;
    document.getElementById('todaySpent').textContent = `$${(stats.todaySpent || 0).toFixed(2)}`;
    document.getElementById('uniqueCreators').textContent = stats.uniqueCreators || 0;
  }

  // Load wallet info
  const walletInfo = await sendMessage('GET_WALLET_INFO');
  const walletInfoEl = document.getElementById('walletInfo');

  if (walletInfo?.initialized) {
    let html = '<div class="wallet-addresses-inline">';
    for (const [network, data] of Object.entries(walletInfo.networks || {})) {
      if (data.address) {
        html += `
          <div class="wallet-address-item">
            <span class="wallet-network">${network}</span>
            <span class="wallet-addr">${truncateAddress(data.address)}</span>
          </div>
        `;
      }
    }
    html += '</div>';
    walletInfoEl.innerHTML = html;
  }

  // Load active rules summary
  const rules = await sendMessage('GET_RULES');
  const activeRules = (rules || []).filter(r => r.isActive);
  const summaryEl = document.getElementById('activeRulesSummary');

  if (activeRules.length > 0) {
    let html = '';
    activeRules.forEach(rule => {
      html += `
        <div class="rule-card">
          <div class="rule-header">
            <span class="rule-creator">${rule.creatorName || (rule.creatorAddress === '*' ? 'All Creators' : truncateAddress(rule.creatorAddress))}</span>
          </div>
          <div class="rule-details">
            <span class="rule-tag">${rule.ratePerMinute} ${rule.token}/min</span>
            <span class="rule-tag">Min ${rule.minWatchMinutes}m</span>
            <span class="rule-tag">Max ${rule.maxTipAmount} ${rule.token}</span>
          </div>
        </div>
      `;
    });
    summaryEl.innerHTML = html;
  } else {
    summaryEl.innerHTML = '<p class="muted">No active rules</p>';
  }

  // Update status indicator
  const settings = await sendMessage('GET_SETTINGS');
  updateStatusIndicator(settings?.isEnabled !== false);
}

function updateStatusIndicator(isActive) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = indicator.querySelector('.status-text');

  if (isActive) {
    indicator.classList.remove('inactive');
    statusText.textContent = 'Active';
  } else {
    indicator.classList.add('inactive');
    statusText.textContent = 'Disabled';
  }
}

// ─── RULES ─────────────────────────────────────────
async function loadRules() {
  const rules = await sendMessage('GET_RULES');
  const activeRules = (rules || []).filter(r => r.isActive);
  const listEl = document.getElementById('rulesList');

  if (activeRules.length > 0) {
    let html = '';
    activeRules.forEach(rule => {
      html += `
        <div class="rule-card" data-rule-id="${rule.id}">
          <div class="rule-header">
            <span class="rule-creator">${rule.creatorName || (rule.creatorAddress === '*' ? 'All Creators' : truncateAddress(rule.creatorAddress))}</span>
            <button class="btn btn-danger btn-small delete-rule" data-rule-id="${rule.id}">Delete</button>
          </div>
          <div class="rule-details">
            <span class="rule-tag">${rule.ratePerMinute} ${rule.token}/min</span>
            <span class="rule-tag">Min ${rule.minWatchMinutes}m</span>
            <span class="rule-tag">Max ${rule.maxTipAmount} ${rule.token}</span>
            <span class="rule-tag">${rule.network}</span>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;

    // Add delete handlers
    listEl.querySelectorAll('.delete-rule').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const ruleId = e.target.dataset.ruleId;
        await sendMessage('DELETE_RULE', { ruleId });
        loadRules();
        loadDashboard();
      });
    });
  } else {
    listEl.innerHTML = '<p class="muted">No rules configured</p>';
  }
}

// ─── HISTORY ───────────────────────────────────────
async function loadHistory() {
  const history = await sendMessage('GET_TIP_HISTORY', { limit: 20 });
  const listEl = document.getElementById('historyList');

  if (history && history.length > 0) {
    let html = '';
    history.forEach(tip => {
      const date = new Date(tip.timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const explorerUrl = getExplorerUrl(tip.network, tip.txHash);

      html += `
        <div class="history-item ${tip.txHash ? 'clickable' : ''}" ${tip.txHash ? `data-tx-url="${explorerUrl}"` : ''}>
          <div class="history-header">
            <span class="history-amount">${tip.amount} ${tip.token}</span>
            <span class="history-status ${tip.status}">${tip.status}</span>
          </div>
          <div class="history-creator">→ ${tip.creatorName || truncateAddress(tip.creatorAddress)}</div>
          <div class="history-meta">
            <span>${dateStr} ${timeStr}</span>
            <span>${tip.network}</span>
            ${tip.watchMinutes ? `<span>${Math.round(tip.watchMinutes)}m watched</span>` : ''}
            ${tip.txHash ? `<span class="tx-link">🔗 ${truncateAddress(tip.txHash)}</span>` : ''}
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;
    
    // Add click handlers for TX links
    listEl.querySelectorAll('.history-item.clickable').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.txUrl;
        if (url) {
          chrome.tabs.create({ url });
        }
      });
    });
  } else {
    listEl.innerHTML = '<p class="muted">No tips yet</p>';
  }
}

function getExplorerUrl(network, txHash) {
  if (!txHash) return null;
  
  const explorers = {
    'polygon': `https://polygonscan.com/tx/${txHash}`,
    'ethereum': `https://etherscan.io/tx/${txHash}`,
    'arbitrum': `https://arbiscan.io/tx/${txHash}`,
    'bitcoin': `https://blockstream.info/tx/${txHash}`,
  };
  
  return explorers[network?.toLowerCase()] || `https://polygonscan.com/tx/${txHash}`;
}

// ─── AGENT TAB ────────────────────────────────────
async function loadAgentTab() {
  // Agent Decision Log
  await refreshAgentLog();

  // Pool Info
  const pool = await sendMessage('GET_POOL_INFO');
  if (pool) {
    document.getElementById('poolBalance').textContent = `$${(pool.totalAmount || 0).toFixed(2)}`;
    document.getElementById('poolContributors').textContent = (pool.contributions || []).length;
  }

  // Event Triggers
  await loadEventTriggers();
}

async function refreshAgentLog() {
  const log = await sendMessage('GET_AGENT_LOG', { limit: 15 });
  const logEl = document.getElementById('agentLog');

  if (log && log.length > 0) {
    let html = '';
    log.reverse().forEach(entry => {
      const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const isSuccess = entry.shouldTip;
      const msgClass = isSuccess ? 'success' : (entry.reason === 'daily_limit_reached' ? 'error' : '');
      const icon = isSuccess ? '✅' : '⏭';
      const detail = isSuccess
        ? `TIP ${entry.amount} ${entry.token} — ${entry.formula || ''}`
        : `SKIP: ${entry.reason}`;

      html += `
        <div class="log-entry">
          <span class="log-time">${time}</span>
          <span class="log-message ${msgClass}">${icon} ${detail}</span>
        </div>
      `;
    });
    logEl.innerHTML = html;
  }
}

async function loadEventTriggers() {
  const triggers = await sendMessage('GET_EVENT_TRIGGERS');
  const listEl = document.getElementById('eventTriggersList');

  if (triggers && triggers.length > 0) {
    let html = '';
    triggers.forEach(trigger => {
      html += `
        <div class="rule-card">
          <div class="rule-header">
            <span class="rule-creator">${trigger.description || trigger.eventType}</span>
            <label class="checkbox-label" style="margin: 0;">
              <input type="checkbox" class="event-trigger-toggle"
                     data-event-type="${trigger.eventType}"
                     ${trigger.isActive ? 'checked' : ''}>
            </label>
          </div>
          <div class="rule-details">
            <span class="rule-tag">$${trigger.tipAmount} ${trigger.token}</span>
            <span class="rule-tag">${trigger.network}</span>
            <span class="rule-tag">${trigger.cooldownMs >= 60000 ? Math.round(trigger.cooldownMs / 60000) + 'min cooldown' : 'No cooldown'}</span>
          </div>
        </div>
      `;
    });
    listEl.innerHTML = html;

    // Toggle handlers
    listEl.querySelectorAll('.event-trigger-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        await sendMessage('SET_EVENT_TRIGGER', {
          eventType: e.target.dataset.eventType,
          isActive: e.target.checked,
        });
      });
    });
  }
}

// ─── SETTINGS ──────────────────────────────────────
async function loadSettings() {
  const settings = await sendMessage('GET_SETTINGS');

  if (settings) {
    document.getElementById('maxDailySpend').value = settings.maxDailySpend || 50;
    document.getElementById('maxTipPerSession').value = settings.maxTipPerSession || 5;
    document.getElementById('isEnabled').checked = settings.isEnabled !== false;
    document.getElementById('showBadge').checked = settings.showBadge !== false;
    document.getElementById('showNotifications').checked = settings.showNotifications !== false;
    document.getElementById('openaiApiKey').value = settings.openaiApiKey || '';
    document.getElementById('aiAgentEnabled').checked = settings.aiAgentEnabled !== false;
  }

  // Load wallet addresses if initialized
  const walletInfo = await sendMessage('GET_WALLET_INFO');
  if (walletInfo?.initialized) {
    showWalletAddresses(walletInfo.networks);
  }
}

function showWalletAddresses(networks) {
  const container = document.getElementById('walletAddresses');
  let html = '<h4 style="color: var(--accent); margin-bottom: 10px;">Wallet Addresses</h4>';

  for (const [network, data] of Object.entries(networks || {})) {
    if (data.address) {
      html += `
        <div class="wallet-address-item">
          <div class="wallet-info">
            <span class="wallet-network">${network}</span>
            <span class="wallet-addr">${truncateAddress(data.address)}</span>
          </div>
          <button class="btn-copy" data-address="${data.address}" title="Copy full address">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span class="btn-copy-text">Copy</span>
          </button>
        </div>
      `;
    }
  }

  container.innerHTML = html;
  container.style.display = 'block';

  // Add copy handlers
  container.querySelectorAll('.btn-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(btn.dataset.address, btn);
    });
  });
}

// ─── EVENT LISTENERS ───────────────────────────────
function setupEventListeners() {
  // Go to settings from dashboard
  document.getElementById('goToSettings')?.addEventListener('click', () => {
    document.querySelector('[data-tab="settings"]').click();
  });

  // Creator select change
  document.getElementById('ruleCreator').addEventListener('change', (e) => {
    const customGroup = document.getElementById('customCreatorGroup');
    customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
  });

  // Create rule form
  document.getElementById('createRuleForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const creatorSelect = document.getElementById('ruleCreator').value;
    const creatorAddress = creatorSelect === 'custom'
      ? document.getElementById('ruleCreatorAddress').value
      : '*';

    const data = {
      creatorAddress,
      token: document.getElementById('ruleToken').value,
      network: document.getElementById('ruleNetwork').value,
      ratePerMinute: parseFloat(document.getElementById('ruleRate').value),
      minWatchMinutes: parseInt(document.getElementById('ruleMinWatch').value),
      maxTipAmount: parseFloat(document.getElementById('ruleMaxTip').value),
    };

    const result = await sendMessage('CREATE_RULE', data);

    if (result?.success) {
      // Reset form
      document.getElementById('createRuleForm').reset();
      document.getElementById('customCreatorGroup').style.display = 'none';
      // Reload lists
      loadRules();
      loadDashboard();
    } else {
      alert(result?.error || 'Failed to create rule');
    }
  });

  // Generate seed phrase (real BIP-39 via background.js)
  document.getElementById('generateSeed').addEventListener('click', async () => {
    const result = await sendMessage('GENERATE_SEED');
    if (result?.seedPhrase) {
      document.getElementById('seedPhrase').value = result.seedPhrase;
    } else {
      alert('Failed to generate seed phrase');
    }
  });

  // Initialize wallet
  document.getElementById('initWallet').addEventListener('click', async () => {
    const seedPhrase = document.getElementById('seedPhrase').value.trim();

    if (!seedPhrase) {
      alert('Please enter or generate a seed phrase');
      return;
    }

    // Validate BIP-39 seed phrase
    const validation = await sendMessage('VALIDATE_SEED', { seedPhrase });
    if (!validation?.valid) {
      alert('Invalid seed phrase. Please use a valid BIP-39 mnemonic (12 or 24 words).');
      return;
    }

    const networks = [];
    if (document.getElementById('netPolygon').checked) networks.push('polygon');
    if (document.getElementById('netArbitrum').checked) networks.push('arbitrum');
    if (document.getElementById('netEthereum').checked) networks.push('ethereum');
    if (document.getElementById('netBitcoin').checked) networks.push('bitcoin');

    if (networks.length === 0) {
      alert('Please select at least one network');
      return;
    }

    const result = await sendMessage('INIT_WALLET', { seedPhrase, networks });

    if (result?.success) {
      showWalletAddresses(result.addresses ? 
        Object.fromEntries(Object.entries(result.addresses).map(([k, v]) => [k, { address: v }])) 
        : {});
      loadDashboard();
      alert('Wallet initialized successfully!');
    } else {
      alert(result?.error || 'Failed to initialize wallet');
    }
  });

  // Reset all data
  document.getElementById('resetData').addEventListener('click', async () => {
    if (!confirm('Are you sure? This will delete all tip history, wallet data, and watch sessions.')) {
      return;
    }
    const result = await sendMessage('RESET_DATA');
    if (result?.success) {
      document.getElementById('walletAddresses').style.display = 'none';
      document.getElementById('seedPhrase').value = '';
      loadDashboard();
      loadHistory();
      loadRules();
      alert('All data has been reset.');
    }
  });

  // Refresh agent log
  document.getElementById('refreshAgentLog')?.addEventListener('click', refreshAgentLog);

  // Pool contribute
  document.getElementById('poolContribute')?.addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('poolAmount').value);
    if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
    const result = await sendMessage('POOL_CONTRIBUTE', { amount });
    if (result?.success) {
      document.getElementById('poolBalance').textContent = `$${result.poolTotal.toFixed(2)}`;
      alert(`Added $${amount} to pool!`);
      loadAgentTab();
    } else {
      alert(result?.error || 'Failed to contribute');
    }
  });

  // Pool distribute
  document.getElementById('poolDistribute')?.addEventListener('click', async () => {
    if (!confirm('Distribute the entire pool to your top watched creators?')) return;
    const result = await sendMessage('POOL_DISTRIBUTE', {});
    if (result?.success) {
      alert(`Pool distributed to: ${result.creators.join(', ')}`);
      loadAgentTab();
    } else {
      alert(result?.error || 'Distribution failed');
    }
  });

  // Split tip
  document.getElementById('sendSplitTip')?.addEventListener('click', async () => {
    const creatorAddr = document.getElementById('splitCreatorAddr').value.trim();
    const totalAmount = parseFloat(document.getElementById('splitAmount').value);
    const creatorPct = parseInt(document.getElementById('splitCreatorPct').value);
    const collabAddr = document.getElementById('splitCollabAddr').value.trim();

    if (!creatorAddr || !creatorAddr.startsWith('0x')) { alert('Enter a valid creator address'); return; }
    if (!totalAmount || totalAmount <= 0) { alert('Enter a valid amount'); return; }

    const splits = [{ address: creatorAddr, bps: creatorPct * 100, label: 'Creator' }];
    if (collabAddr && collabAddr.startsWith('0x')) {
      splits.push({ address: collabAddr, bps: (100 - creatorPct) * 100, label: 'Collaborator' });
    } else {
      splits[0].bps = 10000; // 100% to creator if no collaborator
    }

    const result = await sendMessage('SPLIT_TIP', { splits, totalAmount });
    if (result?.success) {
      alert(`Split tip sent! ${splits.map(s => `${s.label}: ${(totalAmount * s.bps / 10000).toFixed(2)}`).join(', ')}`);
      loadHistory();
      loadDashboard();
    } else {
      alert(result?.error || 'Split tip failed');
    }
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', async () => {
    const data = {
      maxDailySpend: parseFloat(document.getElementById('maxDailySpend').value),
      maxTipPerSession: parseFloat(document.getElementById('maxTipPerSession').value),
      isEnabled: document.getElementById('isEnabled').checked,
      showBadge: document.getElementById('showBadge').checked,
      showNotifications: document.getElementById('showNotifications').checked,
      openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
      aiAgentEnabled: document.getElementById('aiAgentEnabled').checked,
    };

    const result = await sendMessage('UPDATE_SETTINGS', data);

    if (result) {
      updateStatusIndicator(data.isEnabled);
      alert('Settings saved!');
    }
  });
}

// ─── AI CHAT ────────────────────────────────────
function setupChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSend');

  if (!input || !sendBtn) return;

  sendBtn.addEventListener('click', () => sendChatMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  // Clear input and disable send
  input.value = '';
  const sendBtn = document.getElementById('chatSend');
  sendBtn.disabled = true;

  // Add user message to UI
  appendChatMessage('user', message);
  chatHistory.push({ role: 'user', content: message });

  // Show typing indicator
  const typingEl = showTyping();

  try {
    // Send to background with timeout
    const response = await Promise.race([
      sendMessage('AGENT_CHAT', {
        message,
        history: chatHistory.slice(-16),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
    ]);

    // Remove typing
    if (typingEl.parentNode) typingEl.remove();

    // Parse response
    let displayMsg = 'Sorry, I could not process that. Try "help" for available commands.';
    let actionHtml = '';

    if (response && typeof response === 'object') {
      displayMsg = response.message || response.error || displayMsg;

      if (response.actionResult) {
        actionHtml = `<span class="action-result">${response.actionResult}</span>`;
      }

      // Add to chat history
      chatHistory.push({ role: 'assistant', content: displayMsg });

      // Keep history manageable
      while (chatHistory.length > 20) chatHistory.shift();

      // Refresh UI if action was taken
      if (response.action) {
        setTimeout(() => {
          loadRules();
          loadDashboard();
        }, 300);
      }
    }

    appendChatMessage('bot', displayMsg, actionHtml);

  } catch (err) {
    if (typingEl.parentNode) typingEl.remove();

    const errorMsg = err.message === 'timeout'
      ? 'Request timed out. Make sure the extension is loaded correctly and try again.'
      : 'Something went wrong. Try a simpler command like "help".';
    appendChatMessage('bot', errorMsg);
  }

  sendBtn.disabled = false;
  input.focus();
}

function appendChatMessage(type, text, extraHtml = '') {
  const container = document.getElementById('chatMessages');
  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${type === 'user' ? 'user' : 'bot'}`;

  const avatar = type === 'user' ? '👤' : '🤖';

  // Convert newlines to <br> for display
  const formattedText = text.replace(/\n/g, '<br>');

  msgEl.innerHTML = `
    <div class="chat-avatar">${avatar}</div>
    <div class="chat-bubble">${formattedText}${extraHtml}</div>
  `;

  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg bot';
  typingEl.innerHTML = `
    <div class="chat-avatar">🤖</div>
    <div class="chat-typing">
      <span></span><span></span><span></span>
    </div>
  `;
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;
  return typingEl;
}

// ─── HELPERS ───────────────────────────────────────
function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, data }, (response) => {
      resolve(response);
    });
  });
}

function truncateAddress(addr) {
  if (!addr) return '';
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    // Show feedback
    const textEl = button.querySelector('.btn-copy-text');
    if (textEl) {
      const originalText = textEl.textContent;
      textEl.textContent = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        textEl.textContent = originalText;
        button.classList.remove('copied');
      }, 1500);
    }
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    
    const textEl = button.querySelector('.btn-copy-text');
    if (textEl) {
      textEl.textContent = 'Copied!';
      setTimeout(() => { textEl.textContent = 'Copy'; }, 1500);
    }
  }
}

