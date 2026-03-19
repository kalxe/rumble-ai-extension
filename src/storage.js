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

  // ─── RESET ALL DATA ───────────────────────────────
  async resetAllData() {
    await chrome.storage.local.remove([
      'tipHistory',
      'watchSessions',
      'dailySpending',
      'creatorCache',
      'encryptedSeed',
      'activeNetworks',
    ]);
    return { success: true };
  }
}
