// ═══════════════════════════════════════════════════════════
// background.js — Service Worker / Agent Orchestrator
// ═══════════════════════════════════════════════════════════
// Tanggung jawab:
//   1. Menerima watch time updates dari content script
//   2. Menjalankan rule engine (agent.js) untuk decide kapan tip
//   3. Memicu wallet.js untuk kirim tip
//   4. Menyimpan semua data ke chrome.storage
//   5. Mengelola spending limits

import { AgentEngine } from './agent.js';
import { WalletService } from './wallet.js';
import { StorageHelper } from './storage.js';

// Inisialisasi komponen
const agent = new AgentEngine();
const wallet = new WalletService();
const storage = new StorageHelper();

// Initialize AI agent on startup
agent.initAI().catch(err => console.warn('[Agent] AI init skipped:', err.message));

// ─── LISTEN FOR MESSAGES ────────────────────────────
// Content script dan popup mengirim pesan ke sini
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Harus return true untuk async response
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  const { type, data } = message;

  switch (type) {

    // ─── WATCH TIME UPDATE ────────────────────────
    // Dikirim oleh content.js setiap 30 detik
    case 'WATCH_UPDATE': {
      console.log('[Agent] Watch update:', data);
      return await handleWatchUpdate(data);
    }

    // ─── VIDEO ENDED ──────────────────────────────
    // Dikirim ketika video selesai atau user pindah halaman
    case 'VIDEO_ENDED': {
      console.log('[Agent] Video ended:', data);
      return await handleVideoEnded(data);
    }

    // ─── CREATOR INFO DETECTED ────────────────────
    // Content script menemukan info kreator dari DOM
    case 'CREATOR_DETECTED': {
      console.log('[Agent] Creator detected:', data);
      await storage.setCreatorInfo(data.videoId, {
        name: data.creatorName,
        address: data.creatorAddress,
        channel: data.channelUrl
      });
      return { success: true };
    }

    // ─── RULE MANAGEMENT ──────────────────────────
    case 'CREATE_RULE': {
      return await agent.createRule(data);
    }

    case 'GET_RULES': {
      return await agent.getRules();
    }

    case 'DELETE_RULE': {
      return await agent.deleteRule(data.ruleId);
    }

    case 'UPDATE_RULE': {
      return await agent.updateRule(data.ruleId, data.updates);
    }

    // ─── WALLET MANAGEMENT ────────────────────────
    case 'GENERATE_SEED': {
      return { seedPhrase: WalletService.generateSeedPhrase() };
    }

    case 'VALIDATE_SEED': {
      return { valid: WalletService.validateSeedPhrase(data.seedPhrase) };
    }

    case 'INIT_WALLET': {
      // data.seedPhrase — seed phrase dari user
      // data.networks — array of networks to initialize
      const networks = data.networks || ['ethereum', 'polygon', 'arbitrum', 'bitcoin'];
      return await wallet.initialize(data.seedPhrase, networks);
    }

    case 'GET_WALLET_INFO': {
      return await wallet.getInfo();
    }

    case 'GET_BALANCE': {
      return await wallet.getBalance(data.network);
    }

    // ─── STATS & HISTORY ──────────────────────────
    case 'GET_STATS': {
      return await storage.getStats();
    }

    case 'GET_TIP_HISTORY': {
      return await storage.getTipHistory(data?.limit || 50);
    }

    // ─── SETTINGS ─────────────────────────────────
    case 'GET_SETTINGS': {
      return await storage.getSettings();
    }

    case 'UPDATE_SETTINGS': {
      const result = await storage.updateSettings(data);
      // Re-initialize AI when settings change (API key may have been updated)
      await agent.initAI();
      return result;
    }

    // ─── AI AGENT ────────────────────────────────
    case 'GET_AGENT_LOG': {
      return agent.getDecisionLog(data?.limit || 20);
    }

    // ─── RESET ALL DATA ─────────────────────────────
    case 'RESET_DATA': {
      const resetResult = await storage.resetAllData();
      // Also reset wallet state in memory
      wallet.dispose();
      chrome.action.setBadgeText({ text: '' });
      return resetResult;
    }

    // ─── MANUAL TIP (untuk testing) ───────────────
    case 'MANUAL_TIP': {
      return await executeTip({
        creatorAddress: data.creatorAddress,
        creatorName: data.creatorName,
        amount: data.amount,
        token: data.token,
        network: data.network,
        reason: 'manual'
      });
    }

    // ─── CONTENT SCRIPT LOG RELAY ──────────────
    case 'CONTENT_LOG': {
      console.log(data.message);
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${type}` };
  }
}

// ─── HANDLE WATCH UPDATE ──────────────────────────────
// Dipanggil setiap 30 detik saat user menonton video.
// Ini adalah fungsi KUNCI yang menghubungkan watch time → auto-tip.
async function handleWatchUpdate(data) {
  const { videoId, creatorName, creatorAddress, watchSeconds, videoDuration } = data;

  // Simpan/update session
  await storage.updateWatchSession({
    videoId,
    creatorName,
    creatorAddress,
    watchSeconds,
    videoDuration,
    lastUpdate: Date.now()
  });

  // Cek apakah perlu tip sekarang
  const watchMinutes = watchSeconds / 60;
  const tipDecision = await agent.shouldTip({
    creatorAddress,
    creatorName,
    watchMinutes,
    videoId
  });

  if (tipDecision.shouldTip) {
    console.log(`[Agent] Tipping ${tipDecision.amount} ${tipDecision.token} to ${creatorName}`);

    const result = await executeTip({
      creatorAddress,
      creatorName,
      amount: tipDecision.amount,
      token: tipDecision.token,
      network: tipDecision.network,
      videoId,
      watchMinutes,
      reason: 'auto_watchtime'
    });

    // Tandai session ini sudah di-tip supaya tidak double-tip
    if (result.success) {
      await storage.markSessionTipped(videoId);
    }

    return { tipped: true, ...result };
  }

  return { tipped: false, reason: tipDecision.reason, watchMinutes };
}

// ─── HANDLE VIDEO ENDED ───────────────────────────────
async function handleVideoEnded(data) {
  const { videoId, creatorName, creatorAddress, totalWatchSeconds } = data;

  // Final check — mungkin watch time baru cukup saat video selesai
  const watchMinutes = totalWatchSeconds / 60;
  const session = await storage.getWatchSession(videoId);

  // Jika belum di-tip, cek lagi
  if (!session?.tipped) {
    const tipDecision = await agent.shouldTip({
      creatorAddress,
      creatorName,
      watchMinutes,
      videoId
    });

    if (tipDecision.shouldTip) {
      return await executeTip({
        creatorAddress,
        creatorName,
        amount: tipDecision.amount,
        token: tipDecision.token,
        network: tipDecision.network,
        videoId,
        watchMinutes,
        reason: 'auto_video_ended'
      });
    }
  }

  // Simpan session akhir
  await storage.finalizeWatchSession(videoId, totalWatchSeconds);
  return { tipped: false, reason: 'already_tipped_or_below_threshold' };
}

// ─── EXECUTE TIP ──────────────────────────────────────
// Fungsi yang benar-benar mengirim tip via blockchain
async function executeTip({ creatorAddress, creatorName, amount, token, network, videoId, watchMinutes, reason }) {
  try {
    // 1. Double-check spending limit
    const settings = await storage.getSettings();
    const todaySpent = await storage.getTodaySpending();

    if (todaySpent + amount > settings.maxDailySpend) {
      return {
        success: false,
        error: 'Daily spending limit reached',
        todaySpent,
        limit: settings.maxDailySpend
      };
    }

    // 2. Kirim via WDK (supports USDT, USAT, XAUT, BTC)
    const txResult = await wallet.sendTip(creatorAddress, amount, token, network);

    // 3. Record ke history
    const tipRecord = {
      id: `tip_${Date.now()}`,
      creatorAddress,
      creatorName,
      amount,
      token,
      network: txResult.network || network,
      txHash: txResult.txHash || null,
      videoId,
      watchMinutes,
      reason,
      status: txResult.success ? 'confirmed' : 'failed',
      error: txResult.error || null,
      timestamp: Date.now()
    };

    await storage.addTipRecord(tipRecord);

    // 4. Update daily spending
    if (txResult.success) {
      await storage.addDailySpending(amount);
    }

    // 5. Kirim notifikasi ke content script untuk show badge
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'TIP_SENT',
          data: tipRecord
        });
      }
    } catch (e) {
      // Tab mungkin sudah ditutup, tidak masalah
    }

    // 6. Update badge
    const stats = await storage.getStats();
    chrome.action.setBadgeText({ text: `${stats.totalTips}` });
    chrome.action.setBadgeBackgroundColor({ color: '#00d4aa' });

    return { success: txResult.success, ...tipRecord };

  } catch (error) {
    console.error('[Agent] Tip failed:', error);
    return { success: false, error: error.message };
  }
}

// ─── STARTUP ──────────────────────────────────────────
// Initialize wallet jika seed phrase sudah tersimpan
async function startup() {
  console.log('[Agent] Rumble Auto-Tip Agent starting...');

  const settings = await storage.getSettings();
  const data = await chrome.storage.local.get('encryptedSeed');
  
  if (data.encryptedSeed) {
    try {
      await wallet.initializeFromStorage();
      console.log('[Agent] Wallet restored from storage');
    } catch (e) {
      console.warn('[Agent] Could not restore wallet:', e.message);
    }
  }

  // Set daily spending alarm — reset setiap tengah malam
  chrome.alarms.create('resetDailySpending', {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'resetDailySpending') {
    storage.resetDailySpending();
    console.log('[Agent] Daily spending reset');
  }
});

function getNextMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime();
}

// Run startup
startup();
