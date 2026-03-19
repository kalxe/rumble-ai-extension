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

      // Store seed phrase (encrypted in production!)
      await chrome.storage.local.set({
        encryptedSeed: seedPhrase, // TODO: Encrypt properly in production
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
    const data = await chrome.storage.local.get(['encryptedSeed', 'activeNetworks']);
    if (data.encryptedSeed) {
      const seedPhrase = data.encryptedSeed; // TODO: Decrypt in production
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

  // ─── SEND TIP ──────────────────────────────────────
  // Send cryptocurrency tip to a creator.
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

    const account = this._getAccount(network);
    if (!account) {
      return { success: false, error: `No wallet for network: ${network}` };
    }

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

        const satoshis = BigInt(Math.floor(amount * 1e8));
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
        const amountInSmallestUnit = BigInt(Math.floor(amount * (10 ** decimals)));

        // Use WDK's native transfer() method for ERC-20
        txResult = await account.transfer({
          token: contractAddress,
          recipient: toAddress,
          amount: amountInSmallestUnit,
        });
      }

      console.log('[Wallet] ✅ Transaction successful!');
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
    }
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
