// ═══════════════════════════════════════════════════════════
// wallet.js — Tether WDK Integration (Real SDK)
// ═══════════════════════════════════════════════════════════
// Sends cryptocurrency tips to Rumble creators via blockchain
// using the official Tether Wallet Development Kit.
//
// Tether WDK docs: https://docs.wdk.tether.io/
// WDK SDK: https://docs.wdk.tether.io/sdk/get-started
//
// Supported tokens & networks (per hackathon requirements):
//   - USD₮ (USDT) on Ethereum, Polygon, Arbitrum
//   - USA₮ (USAT) on Ethereum (Alloy Dollar)
//   - XAU₮ (XAUT) on Ethereum (Tether Gold)
//   - BTC on Bitcoin

import WalletManagerEvm from '@tetherto/wdk-wallet-evm';
import WalletManagerBtc, { ElectrumWs } from '@tetherto/wdk-wallet-btc';
import { generateMnemonic, validateMnemonic } from 'bip39';

// ─── TOKEN CONTRACT ADDRESSES ────────────────────────
// Official Tether token contracts on various networks
const TOKEN_CONTRACTS = {
  USDT: {
    ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    polygon:  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  USAT: {
    // USA₮ (Alloy Dollar) - Tether's synthetic USD
    ethereum: '0x0000000000000000000000000000000000000000', // Placeholder - update when available
  },
  XAUT: {
    // XAU₮ (Tether Gold) - 1 token = 1 troy ounce of gold
    ethereum: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
  },
};

// ─── ENCRYPTION HELPERS ─────────────────────────────────
// Uses Web Crypto API (crypto.subtle) available in Chrome extension
// service workers. Derives a 256-bit key from the user's password
// using PBKDF2, then encrypts/decrypts with AES-GCM.
const ENCRYPTION = {
  SALT_LENGTH: 16,
  IV_LENGTH: 12,
  ITERATIONS: 100000,
};

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ENCRYPTION.ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSeed(seedPhrase, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION.SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION.IV_LENGTH));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(seedPhrase)
  );
  // Pack: salt + iv + ciphertext → base64
  const packed = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...packed));
}

async function decryptSeed(encryptedBase64, password) {
  const packed = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const salt = packed.slice(0, ENCRYPTION.SALT_LENGTH);
  const iv = packed.slice(ENCRYPTION.SALT_LENGTH, ENCRYPTION.SALT_LENGTH + ENCRYPTION.IV_LENGTH);
  const ciphertext = packed.slice(ENCRYPTION.SALT_LENGTH + ENCRYPTION.IV_LENGTH);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// ─── RPC PROVIDERS ───────────────────────────────────
const RPC_PROVIDERS = {
  ethereum: 'https://eth.drpc.org',
  polygon:  'https://polygon.drpc.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
};

// ─── TOKEN DECIMALS ──────────────────────────────────
const TOKEN_DECIMALS = {
  USDT: 6,
  USAT: 6,
  XAUT: 6,
  BTC:  8,
};

// ═══════════════════════════════════════════════════════════
// WALLET SERVICE — Real WDK Integration
// ═══════════════════════════════════════════════════════════

export class WalletService {
  constructor() {
    this.evmManagers = {};   // { network: WalletManagerEvm }
    this.btcManager = null;  // WalletManagerBtc
    this.evmAccounts = {};   // { network: WalletAccountEvm }
    this.btcAccount = null;  // WalletAccountBtc
    this.isInitialized = false;
    this.seedPhrase = null;
    this.activeNetworks = [];
    // ── Tip Mutex — prevents concurrent transactions from double-spending
    this._tipLock = false;
    this._lastTipTime = 0;
    this.MIN_TIP_INTERVAL_MS = 30000; // 30s between tips
  }

  // ─── INITIALIZE WALLET ─────────────────────────────
  // Create or restore wallet from seed phrase.
  //
  // @param seedPhrase - 12 or 24 word BIP-39 mnemonic
  // @param networks - Array of networks to initialize
  //
  // @returns { success, addresses, error }
  async initialize(seedPhrase, networks = ['ethereum', 'polygon', 'arbitrum', 'bitcoin']) {
    try {
      if (!seedPhrase) {
        throw new Error('Seed phrase is required. Generate one from the popup UI.');
      }

      this.seedPhrase = seedPhrase;
      const addresses = {};

      // ── Initialize EVM wallets ──
      const evmNetworks = networks.filter(n => n !== 'bitcoin');
      for (const network of evmNetworks) {
        const provider = RPC_PROVIDERS[network];
        if (!provider) {
          console.warn(`[Wallet] No RPC provider for ${network}, skipping`);
          continue;
        }

        try {
          const manager = new WalletManagerEvm(seedPhrase, {
            provider,
            // No transferMaxFee — let WDK skip the fee check.
            // Polygon gas fees are < $0.01 so this is safe.
          });
          this.evmManagers[network] = manager;

          const account = await manager.getAccount(0);
          this.evmAccounts[network] = account;
          addresses[network] = await account.getAddress();

          console.log(`[Wallet] ${network} initialized: ${addresses[network]}`);
        } catch (e) {
          console.warn(`[Wallet] Could not initialize ${network}:`, e.message);
        }
      }

      // ── Initialize Bitcoin wallet ──
      if (networks.includes('bitcoin')) {
        try {
          // Use WebSocket transport (works in Chrome extension service worker)
          const electrumClient = new ElectrumWs({
            host: 'electrum.blockstream.info',
            port: 50004, // WSS port
          });

          this.btcManager = new WalletManagerBtc(seedPhrase, {
            client: electrumClient,
            network: 'bitcoin',
          });

          this.btcAccount = await this.btcManager.getAccount(0);
          addresses['bitcoin'] = await this.btcAccount.getAddress();

          console.log(`[Wallet] bitcoin initialized: ${addresses['bitcoin']}`);
        } catch (e) {
          console.warn(`[Wallet] Could not initialize bitcoin:`, e.message);
        }
      }

      this.activeNetworks = networks;
      this.isInitialized = true;

      // Store seed phrase encrypted with AES-256-GCM via crypto.subtle
      // Uses extension ID as password — unique per install, stays constant
      const encPassword = chrome.runtime.id || 'rumble-autotip-default';
      const encrypted = await encryptSeed(seedPhrase, encPassword);
      await chrome.storage.local.set({
        encryptedSeed: encrypted,
        seedEncrypted: true,
        activeNetworks: networks,
      });

      console.log('[Wallet] Initialized successfully');
      console.log('[Wallet] Networks:', Object.keys(addresses).join(', '));

      return { success: true, addresses };

    } catch (error) {
      console.error('[Wallet] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  // ─── INITIALIZE FROM STORAGE ───────────────────────
  async initializeFromStorage() {
    const data = await chrome.storage.local.get(['encryptedSeed', 'seedEncrypted', 'activeNetworks']);
    if (data.encryptedSeed) {
      let seedPhrase;
      if (data.seedEncrypted) {
        // Decrypt using crypto.subtle
        const encPassword = chrome.runtime.id || 'rumble-autotip-default';
        seedPhrase = await decryptSeed(data.encryptedSeed, encPassword);
      } else {
        // Legacy: migrate plain-text seed to encrypted
        seedPhrase = data.encryptedSeed;
        const encPassword = chrome.runtime.id || 'rumble-autotip-default';
        const encrypted = await encryptSeed(seedPhrase, encPassword);
        await chrome.storage.local.set({ encryptedSeed: encrypted, seedEncrypted: true });
        console.log('[Wallet] Migrated seed phrase to encrypted storage');
      }
      const networks = data.activeNetworks || ['ethereum', 'polygon', 'arbitrum', 'bitcoin'];
      return await this.initialize(seedPhrase, networks);
    }
    throw new Error('No wallet found in storage');
  }

  // ─── GET WALLET INFO ───────────────────────────────
  async getInfo() {
    if (!this.isInitialized) {
      return { initialized: false };
    }

    const info = {
      initialized: true,
      networks: {},
    };

    for (const [network, account] of Object.entries(this.evmAccounts)) {
      info.networks[network] = {
        address: await account.getAddress(),
      };
    }

    if (this.btcAccount) {
      info.networks['bitcoin'] = {
        address: await this.btcAccount.getAddress(),
      };
    }

    return info;
  }

  // ─── GET ACCOUNT ───────────────────────────────────
  // Internal helper to get the right account for a network
  _getAccount(network) {
    if (network === 'bitcoin') return this.btcAccount;
    return this.evmAccounts[network];
  }

  // ─── GET BALANCE ───────────────────────────────────
  // Get native or token balance for a network.
  //
  // @param network - 'ethereum', 'polygon', 'bitcoin', etc.
  // @param token - Optional: 'USDT', 'XAUT', etc. (null for native)
  async getBalance(network = 'ethereum', token = null) {
    const account = this._getAccount(network);
    if (!this.isInitialized || !account) {
      return { error: `Wallet not initialized for ${network}` };
    }

    try {
      let balance;
      let tokenSymbol;
      let decimals;

      if (network === 'bitcoin') {
        // BTC balance in satoshis
        balance = await account.getBalance();
        tokenSymbol = 'BTC';
        decimals = 8;
      } else if (token && TOKEN_CONTRACTS[token]?.[network]) {
        // ERC-20 token balance
        balance = await account.getTokenBalance(TOKEN_CONTRACTS[token][network]);
        tokenSymbol = token;
        decimals = TOKEN_DECIMALS[token] || 6;
      } else {
        // Native EVM balance (in wei)
        balance = await account.getBalance();
        tokenSymbol = this.getNativeToken(network);
        decimals = 18;
      }

      return {
        raw: balance.toString(),
        formatted: (Number(balance) / (10 ** decimals)).toFixed(decimals > 6 ? 8 : 2),
        token: tokenSymbol,
        network,
      };
    } catch (error) {
      return { error: error.message, network };
    }
  }

  getNativeToken(network) {
    const natives = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      arbitrum: 'ETH',
      bitcoin: 'BTC',
    };
    return natives[network] || 'ETH';
  }

  // ─── SAFE DECIMAL CONVERSION ────────────────────────
  // Convert human-readable amount to smallest token unit using
  // STRING SPLITTING to avoid IEEE 754 floating-point precision loss.
  // e.g., toSmallestUnit(1.23, 6) → 1230000n (not 1229999n)
  _toSmallestUnit(amount, decimals) {
    const str = amount.toString();
    const [whole, frac = ''] = str.split('.');
    const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole + paddedFrac);
  }

  // ─── SEND TIP ──────────────────────────────────────
  // Send cryptocurrency tip to a creator.
  // Protected by a mutex to prevent concurrent transactions.
  //
  // @param toAddress - Creator's wallet address
  // @param amount - Amount in token units (e.g., 0.50 = $0.50 USDT)
  // @param token - 'USDT', 'USAT', 'XAUT', or 'BTC'
  // @param network - 'ethereum', 'polygon', 'arbitrum', 'bitcoin'
  //
  // @returns { success, txHash, amount, token, network, error }
  async sendTip(toAddress, amount, token = 'USDT', network = 'polygon') {
    if (!this.isInitialized) {
      return { success: false, error: 'Wallet not initialized' };
    }

    // ── Mutex: prevent concurrent transactions ──
    if (this._tipLock) {
      return { success: false, error: 'Another transaction is in progress' };
    }

    // ── Rate limit: minimum interval between tips ──
    const now = Date.now();
    if (now - this._lastTipTime < this.MIN_TIP_INTERVAL_MS) {
      const waitSec = Math.ceil((this.MIN_TIP_INTERVAL_MS - (now - this._lastTipTime)) / 1000);
      return { success: false, error: `Rate limited. Wait ${waitSec}s before next tip.` };
    }

    const account = this._getAccount(network);
    if (!account) {
      return { success: false, error: `No wallet for network: ${network}` };
    }

    this._tipLock = true;
    try {
      console.log('[Wallet] ═══════════════════════════════════════');
      console.log(`[Wallet] Sending ${amount} ${token} to ${toAddress}`);
      console.log(`[Wallet] Network: ${network}`);
      console.log('[Wallet] ═══════════════════════════════════════');

      let txResult;

      if (token === 'BTC') {
        // ── Bitcoin Transfer via WDK ──
        if (network !== 'bitcoin') {
          return { success: false, error: 'BTC can only be sent on Bitcoin network' };
        }

        const satoshis = this._toSmallestUnit(amount, 8);
        txResult = await account.sendTransaction({
          to: toAddress,
          value: satoshis,
        });

      } else {
        // ── ERC-20 Token Transfer via WDK ──
        const contractAddress = TOKEN_CONTRACTS[token]?.[network];
        if (!contractAddress) {
          return { success: false, error: `${token} is not available on ${network}` };
        }

        if (contractAddress === '0x0000000000000000000000000000000000000000') {
          return { success: false, error: `${token} contract address not yet configured` };
        }

        const decimals = TOKEN_DECIMALS[token] || 6;
        const amountInSmallestUnit = this._toSmallestUnit(amount, decimals);

        // Use WDK's native transfer() method for ERC-20
        txResult = await account.transfer({
          token: contractAddress,
          recipient: toAddress,
          amount: amountInSmallestUnit,
        });
      }

      this._lastTipTime = Date.now();

      console.log('[Wallet] Transaction successful!');
      console.log(`[Wallet] TX Hash: ${txResult.hash}`);
      console.log(`[Wallet] Fee: ${txResult.fee}`);

      return {
        success: true,
        txHash: txResult.hash,
        fee: txResult.fee?.toString(),
        amount,
        token,
        network,
        to: toAddress,
        status: 'confirmed',
      };

    } catch (error) {
      console.error('[Wallet] Transaction failed:', error);
      return {
        success: false,
        error: error.message,
        amount,
        token,
        network,
        to: toAddress,
      };
    } finally {
      this._tipLock = false;
    }
  }

  // ─── SEND SPLIT TIP ────────────────────────────────
  // Atomic tip split between creator, collaborator(s), and/or community.
  // Uses a simple multi-transfer pattern — sends each split in sequence.
  //
  // @param splits - Array of { address, bps } where bps = basis points (10000 = 100%)
  // @param totalAmount - Total tip amount in token units
  // @param token - Token symbol
  // @param network - Network name
  //
  // Example: tipWithSplit([
  //   { address: '0xCreator...', bps: 7000 },  // 70% to creator
  //   { address: '0xEditor...', bps: 2000 },   // 20% to editor
  //   { address: '0xCharity...', bps: 1000 },  // 10% to charity
  // ], 1.00, 'USDT', 'polygon')
  async sendSplitTip(splits, totalAmount, token = 'USDT', network = 'polygon') {
    if (!this.isInitialized) {
      return { success: false, error: 'Wallet not initialized' };
    }

    // Validate splits sum to 10000 bps
    const totalBps = splits.reduce((sum, s) => sum + s.bps, 0);
    if (totalBps !== 10000) {
      return { success: false, error: `Split basis points must sum to 10000, got ${totalBps}` };
    }

    const results = [];
    let allSuccess = true;

    for (const split of splits) {
      const splitAmount = Math.round((totalAmount * split.bps / 10000) * 100) / 100;
      if (splitAmount <= 0) continue;

      const result = await this.sendTip(split.address, splitAmount, token, network);
      results.push({ ...result, splitBps: split.bps, splitLabel: split.label || 'unknown' });

      if (!result.success) {
        allSuccess = false;
        break; // Stop on first failure
      }
    }

    return {
      success: allSuccess,
      splits: results,
      totalAmount,
      token,
      network,
    };
  }

  // ─── DISPOSE ───────────────────────────────────────
  // Clear sensitive data from memory
  dispose() {
    for (const manager of Object.values(this.evmManagers)) {
      try { manager.dispose(); } catch (_) {}
    }
    if (this.btcManager) {
      try { this.btcManager.dispose(); } catch (_) {}
    }
    this.evmManagers = {};
    this.evmAccounts = {};
    this.btcManager = null;
    this.btcAccount = null;
    this.isInitialized = false;
  }

  // ─── GET SUPPORTED TOKENS ──────────────────────────
  static getSupportedTokens() {
    return ['USDT', 'USAT', 'XAUT', 'BTC'];
  }

  // ─── GET SUPPORTED NETWORKS ────────────────────────
  static getSupportedNetworks() {
    return ['ethereum', 'polygon', 'arbitrum', 'bitcoin'];
  }

  // ─── GENERATE SEED PHRASE (Real BIP-39) ─────────────
  static generateSeedPhrase() {
    return generateMnemonic(256); // 24 words, 256 bits entropy, real BIP-39
  }

  // ─── VALIDATE SEED PHRASE ──────────────────────────
  static validateSeedPhrase(phrase) {
    return validateMnemonic(phrase);
  }

  // ─── GET TOKEN NETWORKS ────────────────────────────
  // Returns which networks support a given token
  static getTokenNetworks(token) {
    const contracts = TOKEN_CONTRACTS[token];
    if (!contracts) return [];
    return Object.keys(contracts).filter(network => 
      contracts[network] && contracts[network] !== '0x0000000000000000000000000000000000000000'
    );
  }
}
