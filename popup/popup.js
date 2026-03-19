// ═══════════════════════════════════════════════════════════
// popup.js — Extension Popup Logic
// ═══════════════════════════════════════════════════════════
// Handles all UI interactions and communicates with background.js

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadDashboard();
  loadRules();
  loadHistory();
  loadSettings();
  setupEventListeners();
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

