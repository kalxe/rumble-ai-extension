// ═══════════════════════════════════════════════════════════
// content.js — Content Script untuk Rumble.com
// ═══════════════════════════════════════════════════════════
// Script ini di-inject ke setiap halaman rumble.com.
// Tanggung jawab:
//   1. Mendeteksi apakah halaman ini berisi video
//   2. Mengekstrak info kreator (nama, wallet address)
//   3. Melacak watch time (berapa lama user menonton)
//   4. Mengirim data ke background.js setiap 30 detik
//   5. Menampilkan notifikasi tip di halaman

(function() {
  'use strict';

  // ─── STATE ──────────────────────────────────────
  let currentVideoId = null;
  let currentCreatorName = null;
  let currentCreatorAddress = null;
  let watchStartTime = null;
  let totalWatchSeconds = 0;
  let isWatching = false;
  let watchInterval = null;
  let videoElement = null;
  let lastReportedSeconds = 0;

  // ─── CONSTANTS ──────────────────────────────────
  const WATCH_REPORT_INTERVAL = 30000;  // Kirim update setiap 30 detik
  const DETECTION_RETRY_INTERVAL = 2000; // Retry deteksi setiap 2 detik
  const MAX_DETECTION_RETRIES = 15;      // Maksimal 30 detik mencoba

  // ─── MAIN INIT ──────────────────────────────────
  function init() {
    console.log('[Rumble Auto-Tip] Content script loaded on:', window.location.href);

    // Hanya jalankan di halaman video
    if (!isVideoPage()) {
      console.log('[Rumble Auto-Tip] Not a video page, sleeping...');
      // Tetap observe untuk SPA navigation
      observePageChanges();
      return;
    }

    // Mulai deteksi
    detectVideoAndCreator();
  }

  // ─── CEK APAKAH HALAMAN VIDEO ──────────────────
  function isVideoPage() {
    const url = window.location.href;
    // Rumble video URLs biasanya format: rumble.com/vXXXXX-title.html
    // atau rumble.com/embed/XXXXX
    return (
      /rumble\.com\/v[a-zA-Z0-9]/.test(url) ||
      /rumble\.com\/embed\//.test(url) ||
      document.querySelector('#videoPlayer') !== null ||
      document.querySelector('.video-player') !== null
    );
  }

  // ─── DETEKSI VIDEO & KREATOR ────────────────────
  // Mencoba mendeteksi elemen video dan info kreator dari DOM.
  // Karena Rumble mungkin load content secara dinamis,
  // kita retry beberapa kali jika belum ditemukan.
  function detectVideoAndCreator(retryCount = 0) {
    console.log(`[Rumble Auto-Tip] Detection attempt ${retryCount + 1}...`);

    // 1. Cari video element
    videoElement = findVideoElement();
    if (!videoElement && retryCount < MAX_DETECTION_RETRIES) {
      setTimeout(() => detectVideoAndCreator(retryCount + 1), DETECTION_RETRY_INTERVAL);
      return;
    }

    if (!videoElement) {
      console.warn('[Rumble Auto-Tip] Could not find video element after max retries');
      return;
    }

    // 2. Extract video ID
    currentVideoId = extractVideoId();
    console.log('[Rumble Auto-Tip] Video ID:', currentVideoId);

    // 3. Extract creator info
    extractCreatorInfo();

    // 4. Setup watch time tracking
    setupWatchTracking();

    // 5. Inject auto-tip indicator badge ke halaman
    injectTipBadge();

    // 6. Start livestream event detection (milestones, chat spikes)
    startLivestreamEventDetection();

    console.log('[Rumble Auto-Tip] Ready!', {
      videoId: currentVideoId,
      creator: currentCreatorName,
      address: currentCreatorAddress
    });
  }

  // ─── FIND VIDEO ELEMENT ─────────────────────────
  // Berdasarkan DOM screenshot dari Rumble.com:
  //   <div class="video-player" id="videoPlayer">
  //     <div class="videoPlayer-Rumble-cls" id="vid_v74z2ek">
  //       <div>
  //         <video muted playsinline hidefocus="hidefocus">
  function findVideoElement() {
    // Strategi 1: Cari <video> di dalam #videoPlayer
    const playerContainer = document.querySelector('#videoPlayer, .video-player');
    if (playerContainer) {
      const video = playerContainer.querySelector('video');
      if (video) return video;
    }

    // Strategi 2: Cari <video> di dalam .videoPlayer-Rumble-cls
    const rumblePlayer = document.querySelector('[class*="videoPlayer-Rumble"]');
    if (rumblePlayer) {
      const video = rumblePlayer.querySelector('video');
      if (video) return video;
    }

    // Strategi 3: Cari semua <video> elements, ambil yang visible
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      if (v.offsetParent !== null && v.src) return v;
      // Juga cek blob: source (seperti di screenshot: src="blob:...")
      if (v.offsetParent !== null) return v;
    }

    // Strategi 4: Cari dalam iframe (embedded player)
    // Rumble kadang pakai iframe untuk embed
    const iframe = document.querySelector('iframe[src*="rumble.com/embed"]');
    if (iframe) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        return iframeDoc.querySelector('video');
      } catch (e) {
        // Cross-origin, can't access
      }
    }

    return null;
  }

  // ─── EXTRACT VIDEO ID ───────────────────────────
  // Dari DOM: <div class="videoPlayer-Rumble-cls" id="vid_v74z2ek">
  // Video ID = "v74z2ek"
  function extractVideoId() {
    // Strategi 1: Dari URL
    // Format: rumble.com/vXXXXX-title.html atau rumble.com/v5xyzab-title.html
    const urlMatch = window.location.pathname.match(/\/(v[a-zA-Z0-9]+)-/);
    if (urlMatch) {
      return urlMatch[1];
    }

    // Strategi 2: Dari URL tanpa dash
    const urlMatch2 = window.location.pathname.match(/\/(v[a-zA-Z0-9]+)\.html/);
    if (urlMatch2) {
      return urlMatch2[1];
    }

    // Strategi 3: Dari id="vid_XXXXX" element
    const playerDiv = document.querySelector('[id^="vid_"]');
    if (playerDiv) {
      return playerDiv.id.replace('vid_', '');
    }

    // Strategi 4: Dari embed URL
    const embedMatch = window.location.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) {
      return embedMatch[1];
    }

    // Fallback: Use pathname hash
    return `vid_${window.location.pathname.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`;
  }

  // ─── EXTRACT CREATOR INFO ───────────────────────
  // Mendeteksi nama kreator dan wallet address dari halaman.
  //
  // Nama kreator biasanya ada di:
  //   - Element di bawah video player (channel name)
  //   - Meta tags
  //   - Structured data
  //
  // Wallet address biasanya ada di:
  //   - Tip modal/popup (saat tombol tip diklik)
  //   - Data attribute pada tip button
  //
  // CATATAN: Selector di bawah ini mungkin perlu di-adjust
  // berdasarkan versi terbaru Rumble.com. Kita menggunakan
  // multiple strategies supaya lebih robust.
  function extractCreatorInfo() {
    // ── Nama Kreator ──

    // Strategi 0 (BEST): Dari JSON-LD structured data — paling bersih, tidak ada noise
    if (!currentCreatorName) {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const jsonLd of jsonLdScripts) {
        try {
          const data = JSON.parse(jsonLd.textContent);
          if (data.author?.name) {
            currentCreatorName = data.author.name.trim();
            break;
          }
        } catch (e) {}
      }
    }

    // Strategi 1: Dari meta tags
    if (!currentCreatorName) {
      const metaAuthor = document.querySelector('meta[name="author"]');
      if (metaAuthor) {
        currentCreatorName = metaAuthor.getAttribute('content')?.trim();
      }
    }

    // Strategi 2: span.truncate — use title attribute ONLY (textContent has noise)
    // DOM: <span class="truncate" title="iCheapshot">iCheapshot</span>
    if (!currentCreatorName) {
      const truncateEl = document.querySelector('.relative.channel_avatar span.truncate, [class*="channel_avatar"] span.truncate');
      if (truncateEl) {
        // Prefer title attribute — always clean
        const titleAttr = truncateEl.getAttribute('title');
        if (titleAttr) {
          currentCreatorName = titleAttr.trim();
        } else {
          // Fallback: only first text node (avoid child elements like Verified badge)
          for (const child of truncateEl.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              const text = child.textContent.trim();
              if (text) {
                currentCreatorName = text;
                break;
              }
            }
          }
        }
      }
    }

    // Strategi 3: Dari elemen channel info di bawah video
    if (!currentCreatorName) {
      const channelSelectors = [
        '.media-heading-name',
        '.media-by-channel-container a',
        '.channel-header--title',
        '.media-by a',
      ];
      for (const selector of channelSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          // Only grab the first text node — avoid Verified badge, follower count, etc.
          for (const child of el.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              const text = child.textContent.trim();
              if (text) {
                currentCreatorName = text;
                break;
              }
            }
          }
          if (currentCreatorName) break;
        }
      }
    }

    // Final cleanup: remove any leaked "Verified", "followers", whitespace noise
    if (currentCreatorName) {
      currentCreatorName = currentCreatorName
        .replace(/[\t\n\r]+/g, ' ')
        .replace(/\s*Verified\b/gi, '')
        .replace(/\s*\d+\s*followers?/gi, '')
        .trim();
    }

    if (!currentCreatorName) {
      currentCreatorName = 'Unknown Creator';
    }

    // ── Wallet Address ──
    // Rumble uses HTMX — wallet address only appears after fetching
    // HTMX endpoints. We fetch them directly — no modal, no DOM changes.

    // Kirim info kreator dulu (tanpa address)
    if (currentCreatorName) {
      notifyBackground();
    }

    // Mulai silent wallet extraction via fetch
    bgLog('Starting wallet extraction...');
    extractWalletSilent();
  }

  // ─── LOG TO BACKGROUND (visible in Service Worker console) ─────
  function bgLog(msg) {
    var fullMsg = '[Content] ' + msg;
    console.log('[Rumble Auto-Tip]', msg);
    try {
      chrome.runtime.sendMessage({ type: 'CONTENT_LOG', data: { message: fullMsg } });
    } catch (_) {}
  }

  // ─── HTMX FETCH HELPER ────────────────────────────
  // Fetches an HTMX endpoint with hx-vals as URLSearchParams.
  // Returns Promise<string|null>.
  function htmxFetch(hxGet, hxVals) {
    var params = new URLSearchParams(hxVals || {});
    var url = hxGet + (hxGet.indexOf('?') === -1 ? '?' : '&') + params.toString();
    var fullUrl = url.startsWith('http') ? url : (window.location.origin + url);

    return fetch(fullUrl, {
      credentials: 'include',
      headers: {
        'HX-Request': 'true',
        'HX-Current-URL': window.location.href,
      },
    }).then(function(resp) {
      if (!resp.ok) {
        bgLog('Fetch failed: ' + resp.status + ' for ' + hxGet);
        return null;
      }
      return resp.text();
    }).catch(function(err) {
      bgLog('Fetch error: ' + err.message + ' for ' + hxGet);
      return null;
    });
  }

  // ─── SILENT WALLET EXTRACTION (3-step HTMX fetch) ─────────────
  // Step 1: Find tip button in DOM → fetch modal HTML (with hx-vals as params)
  // Step 2: Parse "Tip with another wallet" button → fetch crypto tabs (with hx-vals)
  // Step 3: Parse network buttons hx-vals → extract address (no extra fetch needed)
  function extractWalletSilent() {
    if (currentCreatorAddress) return;

    // ── Step 1: Find the tip button in page DOM ──
    var tipBtn = document.querySelector('button[hx-get*="qr-modal"]');
    if (!tipBtn) {
      // Broader search
      var allBtns = document.querySelectorAll('button[hx-get]');
      for (var i = 0; i < allBtns.length; i++) {
        var g = allBtns[i].getAttribute('hx-get') || '';
        if (g.indexOf('wallet') !== -1) {
          tipBtn = allBtns[i];
          break;
        }
      }
    }

    if (!tipBtn) {
      bgLog('Step 1: No tip button found in DOM');
      return;
    }

    var step1Get = tipBtn.getAttribute('hx-get');
    var step1Vals = {};
    try { step1Vals = JSON.parse(tipBtn.getAttribute('hx-vals') || '{}'); } catch(_) {}

    bgLog('Step 1: hx-get=' + step1Get + ' hx-vals=' + JSON.stringify(step1Vals));

    // ── Step 1: Fetch modal HTML ──
    htmxFetch(step1Get, step1Vals).then(function(modalHTML) {
      if (!modalHTML) {
        bgLog('Step 1: Failed to fetch modal HTML');
        return;
      }
      bgLog('Step 1: Got modal HTML (' + modalHTML.length + ' chars)');

      // Parse modal HTML
      var parser = new DOMParser();
      var doc = parser.parseFromString(modalHTML, 'text/html');

      // Check if address is already in this response
      var earlyAddr = findAddressInDoc(doc) || findAddressInText(modalHTML);
      if (earlyAddr) {
        currentCreatorAddress = earlyAddr;
        bgLog('Wallet found in Step 1: ' + currentCreatorAddress);
        notifyBackground();
        return;
      }

      // ── Step 2: Find "Tip with another crypto wallet" button ──
      var step2Btn = doc.querySelector('button[hx-get*="qr-address"]');
      if (!step2Btn) {
        // Broader search in parsed HTML
        var allParsedBtns = doc.querySelectorAll('button[hx-get], [hx-get]');
        for (var j = 0; j < allParsedBtns.length; j++) {
          var hg = allParsedBtns[j].getAttribute('hx-get') || '';
          if (hg.indexOf('address') !== -1 || hg.indexOf('wallet') !== -1) {
            step2Btn = allParsedBtns[j];
            break;
          }
        }
      }

      if (!step2Btn) {
        bgLog('Step 2: No "another wallet" button found');
        bgLog('Step 1 HTML preview: ' + modalHTML.substring(0, 800));
        return;
      }

      var step2Get = step2Btn.getAttribute('hx-get');
      var step2Vals = {};
      try { step2Vals = JSON.parse(step2Btn.getAttribute('hx-vals') || '{}'); } catch(_) {}

      bgLog('Step 2: hx-get=' + step2Get + ' hx-vals=' + JSON.stringify(step2Vals));

      // ── Step 2: Fetch crypto network tabs HTML ──
      htmxFetch(step2Get, step2Vals).then(function(tabsHTML) {
        if (!tabsHTML) {
          bgLog('Step 2: Failed to fetch crypto tabs HTML');
          return;
        }
        bgLog('Step 2: Got crypto tabs HTML (' + tabsHTML.length + ' chars)');

        // ── Step 3: Parse network buttons to extract address from hx-vals ──
        // PRIORITIZE: polygon + usdt > polygon + any > any address
        var doc2 = parser.parseFromString(tabsHTML, 'text/html');

        var networkBtns = doc2.querySelectorAll('button[hx-vals*="address"], [hx-vals*="address"]');
        bgLog('Step 3: Found ' + networkBtns.length + ' network buttons with address');

        // Parse all network buttons into a list
        var networks = [];
        for (var k = 0; k < networkBtns.length; k++) {
          try {
            var vals = JSON.parse(networkBtns[k].getAttribute('hx-vals'));
            if (vals.address && vals.address.length > 10) {
              networks.push(vals);
              bgLog('Step 3: Network: ' + (vals.blockchain || '?') + '/' + (vals.currency || '?') + ' → ' + vals.address);
            }
          } catch (_) {}
        }

        // Priority 1: Polygon USDT
        var chosen = null;
        for (var p = 0; p < networks.length; p++) {
          if (networks[p].blockchain === 'polygon' && networks[p].currency === 'usdt') {
            chosen = networks[p]; break;
          }
        }
        // Priority 2: Polygon (any currency)
        if (!chosen) {
          for (var q = 0; q < networks.length; q++) {
            if (networks[q].blockchain === 'polygon') {
              chosen = networks[q]; break;
            }
          }
        }
        // Priority 3: Any address
        if (!chosen && networks.length > 0) {
          chosen = networks[0];
        }

        if (chosen) {
          currentCreatorAddress = chosen.address;
          bgLog('Wallet extracted: ' + currentCreatorAddress +
                ' (blockchain=' + (chosen.blockchain || '?') +
                ', currency=' + (chosen.currency || '?') + ')');
          notifyBackground();
          return;
        }

        // Fallback: try extracting from raw HTML text
        var textAddr = findAddressInText(tabsHTML);
        if (textAddr) {
          currentCreatorAddress = textAddr;
          bgLog('Wallet extracted from HTML text: ' + currentCreatorAddress);
          notifyBackground();
          return;
        }

        // Also check if address is in any hx-vals in doc2
        var addrFromDoc = findAddressInDoc(doc2);
        if (addrFromDoc) {
          currentCreatorAddress = addrFromDoc;
          bgLog('Wallet extracted from doc hx-vals: ' + currentCreatorAddress);
          notifyBackground();
          return;
        }

        bgLog('Step 3: No address found in network buttons');
        bgLog('Step 2 HTML preview: ' + tabsHTML.substring(0, 800));
      });
    });
  }

  // ─── FIND ADDRESS IN PARSED DOCUMENT ──────────────
  function findAddressInDoc(doc) {
    // Check all hx-vals for address field
    var els = doc.querySelectorAll('[hx-vals]');
    for (var i = 0; i < els.length; i++) {
      try {
        var vals = JSON.parse(els[i].getAttribute('hx-vals'));
        if (vals.address && /^0x[a-fA-F0-9]{40}$/.test(vals.address)) return vals.address;
        if (vals.address && /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(vals.address)) return vals.address;
      } catch (_) {}
    }

    // Check #js-wallet-address__value
    var addrEl = doc.querySelector('#js-wallet-address__value, #js-wallet-address_value');
    if (addrEl) {
      var addr = addrEl.textContent.trim();
      if (addr && addr.length > 10) return addr;
    }

    return null;
  }

  // ─── FIND ADDRESS IN RAW HTML TEXT ────────────────
  function findAddressInText(html) {
    var ethMatch = html.match(/0x[a-fA-F0-9]{40}/);
    if (ethMatch) return ethMatch[0];
    var btcMatch = html.match(/\b(bc1[a-zA-HJ-NP-Z0-9]{25,62})\b/);
    if (btcMatch) return btcMatch[1];
    return null;
  }

  // ─── NOTIFY BACKGROUND ────────────────────────────
  function notifyBackground() {
    chrome.runtime.sendMessage({
      type: 'CREATOR_DETECTED',
      data: {
        videoId: currentVideoId,
        creatorName: currentCreatorName,
        creatorAddress: currentCreatorAddress,
        channelUrl: extractChannelUrl()
      }
    });
  }

  // ─── EXTRACT CHANNEL URL ────────────────────────
  function extractChannelUrl() {
    const channelLink = document.querySelector('.media-by-channel-container a, .media-by a, [class*="channel"] a');
    return channelLink?.href || null;
  }

  // ─── SETUP WATCH TIME TRACKING ──────────────────
  // Hook ke video element events untuk melacak berapa lama
  // user benar-benar menonton (bukan hanya membuka halaman).
  function setupWatchTracking() {
    if (!videoElement) return;

    // Event: Video mulai play
    videoElement.addEventListener('play', () => {
      console.log('[Rumble Auto-Tip] Video playing');
      isWatching = true;
      watchStartTime = Date.now();
      startWatchReporting();
    });

    // Event: Video di-pause
    videoElement.addEventListener('pause', () => {
      console.log('[Rumble Auto-Tip] Video paused');
      if (isWatching) {
        totalWatchSeconds += (Date.now() - watchStartTime) / 1000;
        isWatching = false;
      }
    });

    // Event: Video selesai
    videoElement.addEventListener('ended', () => {
      console.log('[Rumble Auto-Tip] Video ended');
      if (isWatching) {
        totalWatchSeconds += (Date.now() - watchStartTime) / 1000;
        isWatching = false;
      }
      stopWatchReporting();
      reportVideoEnded();
    });

    // Event: Seeking (user skip)
    videoElement.addEventListener('seeked', () => {
      // Reset watch start time saat seeking
      if (isWatching) {
        watchStartTime = Date.now();
      }
    });

    // Jika video sudah playing saat script di-load
    if (!videoElement.paused) {
      isWatching = true;
      watchStartTime = Date.now();
      startWatchReporting();
    }

    // Cleanup saat user navigasi ke halaman lain
    window.addEventListener('beforeunload', () => {
      if (isWatching) {
        totalWatchSeconds += (Date.now() - watchStartTime) / 1000;
      }
      if (totalWatchSeconds > 0) {
        reportVideoEnded();
      }
    });
  }

  // ─── WATCH REPORTING ────────────────────────────
  // Kirim update ke background setiap 30 detik
  function startWatchReporting() {
    if (watchInterval) return; // Sudah berjalan

    watchInterval = setInterval(() => {
      if (!isWatching) return;

      const currentSeconds = totalWatchSeconds + (Date.now() - watchStartTime) / 1000;

      // Hanya report jika ada progress baru
      if (currentSeconds > lastReportedSeconds + 5) {
        lastReportedSeconds = currentSeconds;

        chrome.runtime.sendMessage({
          type: 'WATCH_UPDATE',
          data: {
            videoId: currentVideoId,
            creatorName: currentCreatorName,
            creatorAddress: currentCreatorAddress,
            watchSeconds: Math.floor(currentSeconds),
            videoDuration: videoElement?.duration || 0
          }
        });

        // Update badge di halaman
        updateTipBadge(Math.floor(currentSeconds));
      }
    }, WATCH_REPORT_INTERVAL);
  }

  function stopWatchReporting() {
    if (watchInterval) {
      clearInterval(watchInterval);
      watchInterval = null;
    }
  }

  function reportVideoEnded() {
    chrome.runtime.sendMessage({
      type: 'VIDEO_ENDED',
      data: {
        videoId: currentVideoId,
        creatorName: currentCreatorName,
        creatorAddress: currentCreatorAddress,
        totalWatchSeconds: Math.floor(totalWatchSeconds)
      }
    });
  }

  // ─── TIP BADGE (UI overlay) ─────────────────────
  // Menampilkan badge kecil di pojok video yang menunjukkan
  // status auto-tip (aktif, berapa lama sudah nonton, dll)
  function injectTipBadge() {
    // Cari container video player
    const playerContainer = document.querySelector('#videoPlayer, .video-player, .media-container');
    if (!playerContainer) return;

    // Buat badge element
    const badge = document.createElement('div');
    badge.id = 'rumble-autotip-badge';
    badge.innerHTML = `
      <div style="
        position: absolute;
        top: 12px;
        right: 12px;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        color: #00d4aa;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        pointer-events: none;
        opacity: 0.9;
        transition: opacity 0.3s;
        border: 1px solid rgba(0, 212, 170, 0.3);
      ">
        <span style="
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #00d4aa;
          display: inline-block;
          animation: autotip-pulse 2s ease-in-out infinite;
        "></span>
        <span id="autotip-badge-text">Auto-Tip Active</span>
      </div>
    `;

    // Inject CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes autotip-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);

    // Zorg dat de container relative positioned is
    if (playerContainer.style.position === '' || playerContainer.style.position === 'static') {
      playerContainer.style.position = 'relative';
    }

    playerContainer.appendChild(badge);
  }

  function updateTipBadge(watchSeconds) {
    const badgeText = document.getElementById('autotip-badge-text');
    if (badgeText) {
      const minutes = Math.floor(watchSeconds / 60);
      const seconds = watchSeconds % 60;
      badgeText.textContent = `Auto-Tip ⏱ ${minutes}:${String(seconds).padStart(2, '0')}`;
    }
  }

  // ─── SHOW TIP NOTIFICATION ──────────────────────
  // Wanneer een tip is verstuurd, toon een notificatie op de pagina
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TIP_SENT') {
      showTipNotification(message.data);
    }
  });

  function showTipNotification(tipData) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: linear-gradient(135deg, #0f1923, #0d1117);
      border: 1px solid #00d4aa;
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      box-shadow: 0 8px 32px rgba(0, 212, 170, 0.2);
      animation: autotip-slidein 0.4s ease-out;
      max-width: 320px;
    `;

    notification.innerHTML = `
      <div style="font-weight: 700; color: #00d4aa; margin-bottom: 6px;">
        ₮ Tip Sent!
      </div>
      <div style="color: #e0e0e0;">
        <strong>${tipData.amount} ${tipData.token}</strong> → ${tipData.creatorName}
      </div>
      <div style="color: #6a8a7a; font-size: 11px; margin-top: 4px;">
        ${tipData.watchMinutes ? Math.round(tipData.watchMinutes) + ' min watched' : 'Manual tip'}
        ${tipData.txHash ? ' · ' + tipData.txHash.slice(0, 10) + '...' : ''}
      </div>
    `;

    // Animation CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes autotip-slidein {
        from { transform: translateY(100px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Auto-remove na 5 seconden
    setTimeout(() => {
      notification.style.transition = 'opacity 0.3s, transform 0.3s';
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(20px)';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }

  // ─── LIVESTREAM EVENT DETECTION ────────────────────
  // Monitors livestream pages for tippable events:
  //   - Viewer milestones (100, 500, 1K, 5K, 10K, 50K, 100K)
  //   - Video completed (user watched to the end)
  //   - Chat activity spikes
  let lastViewerCount = 0;
  let chatMessageCount = 0;
  let lastChatCheck = Date.now();
  const VIEWER_MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000];

  function startLivestreamEventDetection() {
    // Check viewer count every 15 seconds
    setInterval(() => {
      detectViewerMilestone();
      detectChatSpike();
    }, 15000);
  }

  function detectViewerMilestone() {
    // Rumble shows viewer count in various places
    const viewerEl = document.querySelector(
      '.video-viewer-count, .viewer-count, [class*="watching"], .media-heading-info span'
    );
    if (!viewerEl) return;

    const text = viewerEl.textContent.replace(/[^0-9.kKmM]/g, '');
    let count = 0;
    if (text.match(/[kK]$/)) count = parseFloat(text) * 1000;
    else if (text.match(/[mM]$/)) count = parseFloat(text) * 1000000;
    else count = parseInt(text) || 0;

    if (count <= 0 || count === lastViewerCount) return;

    // Check if we crossed a milestone
    for (const milestone of VIEWER_MILESTONES) {
      if (lastViewerCount < milestone && count >= milestone) {
        bgLog('Viewer milestone reached: ' + count + ' (crossed ' + milestone + ')');
        chrome.runtime.sendMessage({
          type: 'EVENT_TIP',
          data: {
            eventType: 'viewer_milestone',
            creatorAddress: currentCreatorAddress,
            creatorName: currentCreatorName,
            videoId: currentVideoId,
            milestone: milestone,
            viewerCount: count,
          }
        });
        break;
      }
    }

    lastViewerCount = count;
  }

  function detectChatSpike() {
    // Count chat messages since last check
    const chatMessages = document.querySelectorAll(
      '.chat-history--row, .chat-message, [class*="chat-entry"], [class*="chat-line"]'
    );
    const currentCount = chatMessages.length;
    const newMessages = currentCount - chatMessageCount;
    const elapsed = (Date.now() - lastChatCheck) / 1000;

    if (elapsed > 0 && newMessages > 0) {
      const rate = newMessages / elapsed; // messages per second
      // If more than 2 messages/second, it's a spike
      if (rate > 2) {
        bgLog('Chat spike detected: ' + rate.toFixed(1) + ' msg/s');
        chrome.runtime.sendMessage({
          type: 'EVENT_TIP',
          data: {
            eventType: 'chat_spike',
            creatorAddress: currentCreatorAddress,
            creatorName: currentCreatorName,
            videoId: currentVideoId,
            chatRate: rate,
          }
        });
      }
    }

    chatMessageCount = currentCount;
    lastChatCheck = Date.now();
  }

  // ─── OBSERVE SPA PAGE CHANGES ───────────────────
  // Rumble might use client-side navigation (SPA).
  // We need to re-init when URL changes.
  function observePageChanges() {
    let lastUrl = window.location.href;

    const urlObserver = new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log('[Rumble Auto-Tip] Page changed to:', lastUrl);

        // Reset state
        cleanup();

        // Re-detect
        if (isVideoPage()) {
          setTimeout(() => detectVideoAndCreator(), 1000);
        }
      }
    });

    urlObserver.observe(document.body, { childList: true, subtree: true });

    // Also listen for popstate (browser back/forward)
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        if (isVideoPage()) {
          cleanup();
          detectVideoAndCreator();
        }
      }, 500);
    });
  }

  // ─── CLEANUP ────────────────────────────────────
  function cleanup() {
    stopWatchReporting();
    if (isWatching && totalWatchSeconds > 0) {
      reportVideoEnded();
    }
    currentVideoId = null;
    currentCreatorName = null;
    currentCreatorAddress = null;
    totalWatchSeconds = 0;
    isWatching = false;
    watchStartTime = null;
    lastReportedSeconds = 0;
    videoElement = null;

    // Remove badge
    const badge = document.getElementById('rumble-autotip-badge');
    if (badge) badge.remove();
  }

  // ─── START ──────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
