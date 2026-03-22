// ═══════════════════════════════════════════════════════════
// storage.js — Chrome Storage API Wrapper
// ═══════════════════════════════════════════════════════════
// Menyimpan semua data extension:
//   - Settings (spending limits, preferences)
//   - Tip history
//   - Watch sessions
//   - Daily spending tracker
//   - Creator info cache

export class StorageHelper {

  // ─── SETTINGS ───────────────────────────────────
  async getSettings() {
    const data = await chrome.storage.local.get('settings');
    return data.settings || {
      maxDailySpend: 50.00,
      maxTipPerSession: 5.00,
      defaultToken: 'USDT',
      defaultNetwork: 'polygon',
      isEnabled: true,
      showBadge: true,
      showNotifications: true,
    };
  }

  async updateSettings(updates) {
    const current = await this.getSettings();
    const newSettings = { ...current, ...updates };
    await chrome.storage.local.set({ settings: newSettings });
    return newSettings;
  }

  // ─── WATCH SESSIONS ─────────────────────────────
  async getWatchSession(videoId) {
    const data = await chrome.storage.local.get('watchSessions');
    const sessions = data.watchSessions || {};
    return sessions[videoId] || null;
  }

  async updateWatchSession(sessionData) {
    const data = await chrome.storage.local.get('watchSessions');
    const sessions = data.watchSessions || {};
    sessions[sessionData.videoId] = {
      ...sessions[sessionData.videoId],
      ...sessionData,
    };
    await chrome.storage.local.set({ watchSessions: sessions });
  }

  async markSessionTipped(videoId) {
    const data = await chrome.storage.local.get('watchSessions');
    const sessions = data.watchSessions || {};
    if (sessions[videoId]) {
      sessions[videoId].tipped = true;
      sessions[videoId].tippedAt = Date.now();
      await chrome.storage.local.set({ watchSessions: sessions });
    }
  }

  async finalizeWatchSession(videoId, totalWatchSeconds) {
    const data = await chrome.storage.local.get('watchSessions');
    const sessions = data.watchSessions || {};
    if (sessions[videoId]) {
      sessions[videoId].totalWatchSeconds = totalWatchSeconds;
      sessions[videoId].endedAt = Date.now();
      await chrome.storage.local.set({ watchSessions: sessions });
    }
  }

  // ─── TIP HISTORY ────────────────────────────────
  async addTipRecord(record) {
    const data = await chrome.storage.local.get('tipHistory');
    const history = data.tipHistory || [];
    history.unshift(record);  // Terbaru di depan

    // Batasi 500 records
    if (history.length > 500) {
      history.splice(500);
    }

    await chrome.storage.local.set({ tipHistory: history });
  }

  async getTipHistory(limit = 50) {
    const data = await chrome.storage.local.get('tipHistory');
    const history = data.tipHistory || [];
    return history.slice(0, limit);
  }

  // ─── DAILY SPENDING ─────────────────────────────
  async getTodaySpending() {
    const data = await chrome.storage.local.get('dailySpending');
    const spending = data.dailySpending || {};
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return spending[today] || 0;
  }

  async addDailySpending(amount) {
    const data = await chrome.storage.local.get('dailySpending');
    const spending = data.dailySpending || {};
    const today = new Date().toISOString().split('T')[0];
    spending[today] = (spending[today] || 0) + amount;
    await chrome.storage.local.set({ dailySpending: spending });
  }

  async resetDailySpending() {
    // Keep only today's spending, remove old days
    const today = new Date().toISOString().split('T')[0];
    await chrome.storage.local.set({ dailySpending: { [today]: 0 } });
  }

  // ─── STATS ──────────────────────────────────────
  async getStats() {
    const history = await this.getTipHistory(500);
    const confirmed = history.filter(t => t.status === 'confirmed');

    return {
      totalTips: confirmed.length,
      totalAmount: confirmed.reduce((sum, t) => sum + t.amount, 0),
      avgTip: confirmed.length > 0
        ? confirmed.reduce((sum, t) => sum + t.amount, 0) / confirmed.length
        : 0,
      totalWatchMinutes: confirmed.reduce((sum, t) => sum + (t.watchMinutes || 0), 0),
      uniqueCreators: [...new Set(confirmed.map(t => t.creatorAddress))].length,
      todaySpent: await this.getTodaySpending(),
    };
  }

  // ─── CREATOR INFO CACHE ─────────────────────────
  async setCreatorInfo(videoId, info) {
    const data = await chrome.storage.local.get('creatorCache');
    const cache = data.creatorCache || {};
    cache[videoId] = { ...info, cachedAt: Date.now() };

    // Alleen de laatste 100 bewaren
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      const oldest = keys.sort((a, b) => cache[a].cachedAt - cache[b].cachedAt);
      oldest.slice(0, keys.length - 100).forEach(k => delete cache[k]);
    }

    await chrome.storage.local.set({ creatorCache: cache });
  }

  async getCreatorInfo(videoId) {
    const data = await chrome.storage.local.get('creatorCache');
    return data.creatorCache?.[videoId] || null;
  }

  // ─── COMMUNITY TIPPING POOL ───────────────────────
  async getPoolInfo() {
    const data = await chrome.storage.local.get('tippingPool');
    return data.tippingPool || { contributions: [], totalAmount: 0 };
  }

  async savePoolInfo(pool) {
    await chrome.storage.local.set({ tippingPool: pool });
  }

  // ─── EVENT TRIGGERS ───────────────────────────────
  async getEventTriggers() {
    const data = await chrome.storage.local.get('eventTriggers');
    return data.eventTriggers || [
      // Default triggers
      {
        eventType: 'viewer_milestone',
        tipAmount: 1.00,
        token: 'USDT',
        network: 'polygon',
        cooldownMs: 300000, // 5 min
        isActive: false,
        description: 'Tip when viewer count hits a milestone (100, 500, 1K, etc.)',
      },
      {
        eventType: 'livestream_start',
        tipAmount: 0.50,
        token: 'USDT',
        network: 'polygon',
        cooldownMs: 3600000, // 1 hour
        isActive: false,
        description: 'Tip when a followed creator goes live',
      },
      {
        eventType: 'chat_spike',
        tipAmount: 0.25,
        token: 'USDT',
        network: 'polygon',
        cooldownMs: 120000, // 2 min
        isActive: false,
        description: 'Tip during high chat activity moments',
      },
      {
        eventType: 'video_completed',
        tipAmount: 0.50,
        token: 'USDT',
        network: 'polygon',
        cooldownMs: 0,
        isActive: false,
        description: 'Bonus tip when you watch a video to the end',
      },
    ];
  }

  async setEventTrigger(triggerUpdate) {
    const triggers = await this.getEventTriggers();
    const idx = triggers.findIndex(t => t.eventType === triggerUpdate.eventType);
    if (idx >= 0) {
      triggers[idx] = { ...triggers[idx], ...triggerUpdate };
    } else {
      triggers.push(triggerUpdate);
    }
    await chrome.storage.local.set({ eventTriggers: triggers });
    return { success: true, triggers };
  }

  async getLastEventTip(eventType, videoId) {
    const data = await chrome.storage.local.get('eventTipLog');
    const log = data.eventTipLog || {};
    return log[`${eventType}_${videoId}`] || null;
  }

  async recordEventTip(eventType, videoId) {
    const data = await chrome.storage.local.get('eventTipLog');
    const log = data.eventTipLog || {};
    log[`${eventType}_${videoId}`] = Date.now();

    // Clean old entries (>24h)
    const cutoff = Date.now() - 86400000;
    for (const key of Object.keys(log)) {
      if (log[key] < cutoff) delete log[key];
    }

    await chrome.storage.local.set({ eventTipLog: log });
  }

  // ─── RESET ALL DATA ───────────────────────────────
  async resetAllData() {
    await chrome.storage.local.remove([
      'tipHistory',
      'watchSessions',
      'dailySpending',
      'creatorCache',
      'encryptedSeed',
      'seedEncrypted',
      'activeNetworks',
      'tippingPool',
      'eventTipLog',
    ]);
    return { success: true };
  }
}
