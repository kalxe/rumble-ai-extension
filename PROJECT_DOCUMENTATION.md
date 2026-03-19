# RumbleTipAI

## Complete Project Documentation

> **AI-Powered Autonomous Tipping Agent for Rumble Creators — Built with Tether WDK**

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [File Structure](#file-structure)
5. [Core Components](#core-components)
6. [Data Flow](#data-flow)
7. [Auto-Tip Rule Engine](#auto-tip-rule-engine)
8. [Wallet Integration](#wallet-integration)
9. [Supported Networks & Tokens](#supported-networks--tokens)
10. [Installation & Setup](#installation--setup)
11. [Testing Guide](#testing-guide)
12. [API Reference](#api-reference)
13. [OpenClaw AI Integration](#openclaw-ai-integration)

---

## 🎯 Project Overview

**RumbleTipAI** is a Chrome Extension that runs an **AI-powered autonomous agent** to tip Rumble video creators in cryptocurrency based on your watch behavior. It combines an **LLM-powered decision engine** (GPT-4o-mini) with **Tether WDK wallet integration** to execute real blockchain payments — automatically and intelligently.

### Key Features

- ✅ **AI-Powered Agent** — LLM reasoning (GPT-4o-mini) with rule-based fallback
- ✅ **Autonomous Tipping** — Tips sent automatically based on watch time + AI analysis
- ✅ **Multi-Network Support** — Ethereum, Polygon, Arbitrum, Tron, Bitcoin, Liquid
- ✅ **Multi-Token Support** — USD₮, USA₮, XAU₮, BTC (full Tether ecosystem)
- ✅ **Non-Custodial Wallet** — WDK-managed HD wallet from BIP-39 seed
- ✅ **Conditional Payments** — Per-creator rules, daily limits, session caps
- ✅ **Decision Audit Trail** — Full log of agent reasoning with confidence scores
- ✅ **Real-time Badge** — See watch time on video player
- ✅ **Transaction History** — Track all tips with blockchain explorer links
- ✅ **OpenClaw AI Integration** — Voice/AI control for the extension

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHROME EXTENSION                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  Content.js  │───▶│ Background.js│───▶│   Wallet.js  │       │
│  │  (Rumble.com)│    │  (Service    │    │  (Tether WDK)│       │
│  │              │    │   Worker)    │    │              │       │
│  └──────────────┘    └──────┬───────┘    └──────────────┘       │
│         │                   │                   │                │
│         │                   ▼                   │                │
│         │  ┌──────────────────────────────┐     │                │
│         │  │        Agent.js              │     │                │
│         │  │   AI-Powered Decision Engine │     │                │
│         │  │  ┌────────┐  ┌────────────┐ │     │                │
│         │  │  │ Rule   │  │ LLM        │ │     │                │
│         │  │  │ Engine │  │ Reasoning  │ │     │                │
│         │  │  └────────┘  └─────┬──────┘ │     │                │
│         │  │                    │        │     │                │
│         │  └────────────────────┼────────┘     │                │
│         │                       │              │                │
│         │              ┌────────▼────────┐     │                │
│         │              │  OpenAI API     │     │                │
│         │              │  (GPT-4o-mini)  │     │                │
│         │              └─────────────────┘     │                │
│         │                                      │                │
│         ▼                                      ▼                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Storage.js                            │    │
│  │              (Chrome Storage API)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     Popup UI                             │    │
│  │  ┌─────────┬─────────┬─────────┬──────────┐             │    │
│  │  │Dashboard│  Rules  │ History │ Settings │             │    │
│  │  └─────────┴─────────┴─────────┴──────────┘             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │    Blockchain    │
                    │  Ethereum        │
                    │  Polygon         │
                    │  Arbitrum        │
                    │  Bitcoin         │
                    └──────────────────┘
```

---

## 🛠️ Technology Stack

| Component | Technology |
|-----------|------------|
| **Platform** | Chrome Extension (Manifest V3) |
| **Language** | JavaScript (ES6+) |
| **Bundler** | Webpack 5 (with Node.js polyfills) |
| **Wallet SDK** | Tether WDK (EOA Wallet) |
| **Storage** | Chrome Storage API (sync + local) |
| **UI Framework** | Vanilla JS + Custom CSS |
| **Networks** | Ethereum, Polygon, Arbitrum, Bitcoin |
| **Tokens** | USD₮, USA₮, XAU₮, BTC |

---

## 📁 File Structure

```
rumble-autotip-extension/
├── manifest.json           # Extension manifest (MV3)
├── package.json            # NPM dependencies
├── webpack.config.js       # Build configuration
│
├── src/
│   ├── background.js       # Service worker (orchestrator)
│   ├── content.js          # Injected into Rumble pages
│   ├── agent.js            # Auto-tip rule engine
│   ├── wallet.js           # Tether WDK integration
│   └── storage.js          # Chrome Storage wrapper
│
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Popup styles
│   └── popup.js            # Popup logic
│
├── icons/
│   ├── icon16.svg/png
│   ├── icon48.svg/png
│   └── icon128.svg/png
│
├── openclaw-skill/
│   ├── skill.json          # OpenClaw skill metadata
│   └── SKILL.md            # AI agent instructions
│
├── dist/                   # Built files (generated)
│
└── PROJECT_DOCUMENTATION.md  # This file
```

---

## 🔧 Core Components

### 1. Content Script (`content.js`)

**Purpose:** Runs on Rumble.com pages to detect videos and track watch time.

**Key Functions:**
- `detectVideo()` — Finds video player on page
- `extractCreatorInfo()` — Gets creator name and wallet address
- `startWatchTracking()` — Begins tracking watch time
- `injectTipBadge()` — Shows real-time watch timer on video
- `showTipNotification()` — Displays tip confirmation

**Events Sent:**
- `WATCH_UPDATE` — Every 30 seconds with current watch time
- `VIDEO_ENDED` — When video ends (final tip check)

### 2. Background Service Worker (`background.js`)

**Purpose:** Central orchestrator that handles all message routing.

**Message Handlers:**
| Message Type | Description |
|--------------|-------------|
| `WATCH_UPDATE` | Process watch time, check rules, send tip |
| `VIDEO_ENDED` | Final tip check when video ends |
| `GET_SETTINGS` | Return user settings |
| `UPDATE_SETTINGS` | Save user settings |
| `GET_RULES` | Return auto-tip rules |
| `ADD_RULE` | Create new rule |
| `DELETE_RULE` | Remove a rule |
| `GET_TIP_HISTORY` | Return tip history |
| `GET_STATS` | Return dashboard stats |
| `GET_WALLET_INFO` | Return wallet addresses |
| `MANUAL_TIP` | Send manual tip |

### 3. AI-Powered Agent (`agent.js`)

**Purpose:** Autonomous agent that combines rule-based logic with LLM intelligence.

**Agent Architecture:**
- **Rule Engine** — User-defined rules (rate, min time, limits)
- **AI Reasoning** — LLM (GPT-4o-mini) analyzes context for intelligent decisions
- **Spending Guardian** — Enforces budgets and prevents overspend
- **Decision Logger** — Full audit trail of agent reasoning

**Key Functions:**
- `shouldTip(context)` — Main autonomous decision function (7-step pipeline)
- `getAIDecision(context)` — Calls LLM for contextual reasoning
- `findMatchingRule(creatorAddress)` — Find applicable rule
- `logDecision(decision)` — Audit trail with timestamps
- `initAI()` — Initialize AI with user's API key

**Decision Pipeline:**
```
Step 1: Pre-checks       → Already tipped? Session valid?
Step 2: Rule matching     → Specific creator or wildcard rule
Step 3: Watch time check  → Minimum threshold met?
Step 4: Amount calc       → watchMinutes × ratePerMinute (capped)
Step 5: Budget check      → Daily limit, session cap verification
Step 6: AI reasoning      → LLM contextual analysis (optional)
Step 7: Final decision    → Confidence score + execute payment
```

**AI Modes:**
| Mode | Trigger | Behavior |
|------|---------|----------|
| **AI-Enhanced** | OpenAI API key set | LLM reasoning + rule engine |
| **Rule-Based** | No API key | Pure rule evaluation (always works) |

**LLM Response Format:**
```json
{
  "shouldTip": true,
  "confidence": 0.92,
  "adjustedAmount": 0.52,
  "reasoning": "Good engagement. Within budget.",
  "sentiment": "positive"
}
```

### 4. Wallet Integration (`wallet.js`)

**Purpose:** Handles cryptocurrency transactions via Tether WDK.

**Key Functions:**
- `initWallet(mnemonic)` — Initialize wallet from seed
- `getAddresses()` — Get addresses for all networks
- `sendTip(params)` — Execute tip transaction
- `getBalance(network, token)` — Check token balance

**Supported Operations:**
- Generate wallet from mnemonic
- Multi-network address derivation
- Token transfers (USDT, USAT, XAUT)
- Transaction signing and broadcasting

### 5. Storage Layer (`storage.js`)

**Purpose:** Persistent data storage using Chrome Storage API.

**Data Stored:**
| Key | Type | Description |
|-----|------|-------------|
| `settings` | Object | User preferences |
| `rules` | Array | Auto-tip rules |
| `tipHistory` | Array | Transaction history |
| `dailySpending` | Object | Daily spend tracking |
| `watchSessions` | Object | Active watch sessions |
| `creatorCache` | Object | Creator info cache |

---

## 🔄 Data Flow

### Watch → Tip Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. USER WATCHES VIDEO ON RUMBLE.COM                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. CONTENT.JS DETECTS VIDEO                                     │
│    - Extracts creator info (name, wallet address)               │
│    - Starts watch time tracking                                 │
│    - Injects tip badge on video player                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (every 30 seconds)
┌─────────────────────────────────────────────────────────────────┐
│ 3. CONTENT.JS SENDS WATCH_UPDATE                                │
│    {                                                            │
│      videoId: "abc123",                                         │
│      creatorName: "Creator Channel",                            │
│      creatorAddress: "0x...",                                   │
│      watchSeconds: 180,                                         │
│      videoDuration: 600                                         │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. BACKGROUND.JS RECEIVES MESSAGE                               │
│    - Updates watch session in storage                           │
│    - Calls agent.shouldTip()                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. AGENT.JS — AI-POWERED DECISION ENGINE                        │
│    Step A: Find matching rule (specific or wildcard)            │
│    Step B: Check minimum watch time                             │
│    Step C: Calculate base tip amount                            │
│    Step D: Verify daily spending limit                          │
│    Step E: AI Reasoning (if OpenAI key configured)              │
│            → Sends context to GPT-4o-mini                      │
│            → Gets confidence score + adjusted amount            │
│            → Can veto low-confidence decisions                  │
│    Step F: Return decision with reasoning audit trail           │
│    { shouldTip, amount, confidence, aiReasoning, ... }         │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              shouldTip: false    shouldTip: true
                    │                   │
                    ▼                   ▼
┌──────────────────────┐  ┌───────────────────────────────────────┐
│ Return reason to     │  │ 6. WALLET.JS SENDS TIP                │
│ content script       │  │    - Build transaction                │
│ (no action)          │  │    - Sign with private key            │
└──────────────────────┘  │    - Broadcast to blockchain          │
                          │    - Return txHash                    │
                          └───────────────────────────────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────────────────┐
                          │ 7. STORAGE.JS RECORDS TIP             │
                          │    - Add to tipHistory                │
                          │    - Update dailySpending             │
                          │    - Mark video as tipped             │
                          └───────────────────────────────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────────────────┐
                          │ 8. BACKGROUND.JS SENDS TIP_SENT       │
                          │    - Notify content script            │
                          │    - Content shows notification       │
                          └───────────────────────────────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────────────────┐
                          │ 9. USER SEES TIP NOTIFICATION         │
                          │    "₮ Tip Sent! 0.50 USDT → Creator"  │
                          └───────────────────────────────────────┘
```

---

## ⚙️ Auto-Tip Rule Engine

### Rule Structure

```javascript
{
  id: "rule_123456789",
  creatorName: "Favorite Creator",    // Display name
  creatorAddress: "0x...",            // Wallet address (* for all)
  minWatchMinutes: 3,                 // Minimum watch time to trigger
  ratePerMinute: 0.10,                // Tip rate per minute watched
  maxTipAmount: 5.00,                 // Maximum tip per video
  token: "USDT",                      // Token to tip
  network: "polygon",                 // Blockchain network
  isActive: true,                     // Rule enabled/disabled
  createdAt: 1710000000000
}
```

### Tip Calculation Formula

```
tipAmount = min(watchMinutes × ratePerMinute, maxTipAmount)
```

**Example:**
- Watch time: 10 minutes
- Rate: $0.10/min
- Max: $5.00
- **Tip = min(10 × 0.10, 5.00) = $1.00**

### Rule Matching Priority

1. **Specific Creator Rule** — Exact wallet address match
2. **Wildcard Rule** — `creatorAddress: "*"` matches all creators

---

## 💳 Wallet Integration

### Tether WDK (Real SDK Integration)

The extension uses the **official Tether Wallet Development Kit** packages:
- `@tetherto/wdk-wallet-evm` — BIP-44 HD wallet for EVM chains (Ethereum, Polygon, Arbitrum)
- `@tetherto/wdk-wallet-btc` — BIP-84 SegWit wallet for Bitcoin (via ElectrumWs transport)
- Real `WalletManagerEvm` and `WalletManagerBtc` classes — no mocks
- Native `account.transfer()` for ERC-20 transfers (USDT, USAT, XAUT)
- Native `account.sendTransaction()` for BTC transfers
- `account.getBalance()` / `account.getTokenBalance()` for real on-chain balances

### Supported Tokens (Hackathon Requirements)

| Token | Symbol | Description | Networks |
|-------|--------|-------------|----------|
| **USD₮** | USDT | Tether USD | Ethereum, Polygon, Arbitrum |
| **USA₮** | USAT | Alloy Dollar | Ethereum |
| **XAU₮** | XAUT | Tether Gold | Ethereum |
| **BTC** | BTC | Bitcoin | Bitcoin |

### Wallet Initialization

```javascript
// Initialize wallet with multiple networks
await wallet.initialize(
  "word1 word2 ... word12",  // 12-word seed phrase
  ['ethereum', 'polygon', 'arbitrum', 'bitcoin']  // networks
);

// Returns:
// {
//   success: true,
//   addresses: {
//     ethereum: "0x...",
//     polygon: "0x...",
//     arbitrum: "0x...",
//     bitcoin: "bc1q..."
//   }
// }
```

### Sending Tips

```javascript
// Send USDT tip on Polygon
const result = await wallet.sendTip(
  "0xCreatorAddress",  // to
  0.50,                // amount
  "USDT",              // token
  "polygon"            // network
);

// Send BTC tip
const btcResult = await wallet.sendTip(
  "bc1q...",           // Bitcoin address
  0.0001,              // amount in BTC
  "BTC",               // token
  "bitcoin"            // network
);

// Returns:
// {
//   success: true,
//   txHash: "0x...",
//   amount: 0.50,
//   token: "USDT",
//   network: "polygon"
// }
```

### Token Contract Addresses

```javascript
const TOKEN_CONTRACTS = {
  USDT: {
    ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    polygon:  '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  XAUT: {
    ethereum: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
  }
};
```

---

## 🌐 Supported Networks & Tokens

### Networks

| Network | Chain ID | Explorer | Tokens |
|---------|----------|----------|--------|
| **Ethereum** | 1 | etherscan.io | USDT, USAT, XAUT |
| **Polygon** | 137 | polygonscan.com | USDT |
| **Arbitrum** | 42161 | arbiscan.io | USDT |
| **Bitcoin** | - | blockstream.info | BTC |

### Tokens

| Token | Symbol | Decimals | Description |
|-------|--------|----------|-------------|
| **USD₮** | USDT | 6 | Tether USD - Stablecoin pegged to USD |
| **USA₮** | USAT | 6 | Alloy Dollar - Tether's synthetic USD |
| **XAU₮** | XAUT | 6 | Tether Gold - 1 token = 1 troy ounce of gold |
| **BTC** | BTC | 8 | Bitcoin |

> **Note:** Users need native tokens (ETH, MATIC, etc.) for gas fees on EVM networks. For Bitcoin, transaction fees are paid in BTC.

---

## 🚀 Installation & Setup

### Prerequisites

- Node.js 18+
- npm or yarn
- Chrome browser

### Build Steps

```bash
# 1. Clone repository
cd rumble-autotip-extension

# 2. Install dependencies
npm install

# 3. Build extension
npm run build

# 4. Load in Chrome
# - Open chrome://extensions
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the "dist" folder
```

### Initial Configuration

1. **Setup Wallet**
   - Go to Settings tab
   - Enter your 12/24 word mnemonic
   - Click "Initialize Wallet"

2. **Create Rules**
   - Go to Rules tab
   - Click "Add Rule"
   - Set creator address (or * for all)
   - Configure rate, minimum time, max amount

3. **Enable Extension**
   - Toggle "Enable Auto-Tip" in Settings
   - Set daily spending limit

---

## 🧪 Testing Guide

### Testing Tab Features

The extension includes a comprehensive Testing tab:

#### 1. System Status
- Wallet status (Ready/Not Setup)
- Active rules count
- Today's spending
- Daily limit

#### 2. Live Watch Timer
Real-time simulation of watching a video:
- Timer counts up every second
- Sends WATCH_UPDATE every 30 seconds
- Auto-triggers tip when minimum time reached
- Pause/Resume/Stop controls

#### 3. Instant Test
Skip the timer and test with specific watch time immediately.

#### 4. VIDEO_ENDED Test
Simulate video ending to test final tip check.

#### 5. Notification Test
Preview how tip notifications look.

#### 6. Debug Console
Real-time logs of all workflow steps.

### Testing Workflow

```
1. Create a rule (Rules tab)
   - Creator: * (wildcard)
   - Min watch: 1 minute
   - Rate: $0.10/min

2. Go to Testing tab

3. Click "Start Live Watch"

4. Watch the timer count up

5. At 1:00, tip should trigger automatically

6. Check:
   - Notification appears
   - History shows new tip
   - Dashboard stats update
```

---

## 📡 API Reference

### Message Types

#### Content → Background

```javascript
// Watch time update
chrome.runtime.sendMessage({
  type: 'WATCH_UPDATE',
  data: {
    videoId: string,
    creatorName: string,
    creatorAddress: string,
    watchSeconds: number,
    videoDuration: number
  }
});

// Video ended
chrome.runtime.sendMessage({
  type: 'VIDEO_ENDED',
  data: {
    videoId: string,
    creatorName: string,
    creatorAddress: string,
    totalWatchSeconds: number
  }
});
```

#### Popup → Background

```javascript
// Get settings
const settings = await sendMessage('GET_SETTINGS');

// Update settings
await sendMessage('UPDATE_SETTINGS', {
  maxDailySpend: 50,
  isEnabled: true,
  ...
});

// Get rules
const rules = await sendMessage('GET_RULES');

// Add rule
await sendMessage('ADD_RULE', {
  creatorAddress: '*',
  minWatchMinutes: 3,
  ratePerMinute: 0.10,
  ...
});

// Get tip history
const history = await sendMessage('GET_TIP_HISTORY', { limit: 20 });

// Manual tip
const result = await sendMessage('MANUAL_TIP', {
  creatorAddress: '0x...',
  amount: 1.00,
  token: 'USDT',
  network: 'polygon'
});
```

---

## 🤖 OpenClaw AI Integration

The extension includes an OpenClaw skill for AI/voice control.

### Skill Definition (`skill.json`)

```json
{
  "name": "rumble-autotip",
  "version": "1.0.0",
  "description": "Control Rumble Auto-Tip extension",
  "author": "RumbleTip Team",
  "category": "crypto"
}
```

### Available Commands

| Command | Action |
|---------|--------|
| "Enable auto-tip" | Turn on automatic tipping |
| "Disable auto-tip" | Turn off automatic tipping |
| "Set daily limit to $X" | Update spending limit |
| "Show tip history" | Display recent tips |
| "Tip $X to [creator]" | Send manual tip |
| "Create rule for [creator]" | Add new auto-tip rule |

### Integration Example

```javascript
// OpenClaw skill handler
async function handleCommand(intent, params) {
  switch (intent) {
    case 'enable_autotip':
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        data: { isEnabled: true }
      });
      return "Auto-tip enabled!";
      
    case 'send_tip':
      const result = await chrome.runtime.sendMessage({
        type: 'MANUAL_TIP',
        data: {
          creatorAddress: params.address,
          amount: params.amount,
          token: params.token || 'USDT'
        }
      });
      return `Sent ${params.amount} USDT to ${params.creator}`;
  }
}
```

---

## 📊 Dashboard Metrics

The Dashboard tab shows:

| Metric | Description |
|--------|-------------|
| **Total Tips** | Number of tips sent |
| **Total Spent** | Sum of all tip amounts |
| **Today Spent** | Spending today vs daily limit |
| **Creators Supported** | Unique creators tipped |
| **Recent Tips** | Last 5 tips (clickable for TX details) |

---

## 🔒 Security Considerations

1. **Mnemonic Storage** — Stored encrypted in Chrome local storage
2. **Private Keys** — Never exposed, used only for signing
3. **Permissions** — Minimal required permissions
4. **Content Security** — Isolated content script context
5. **Transaction Limits** — Daily spending caps prevent runaway spending

---

## 📝 License

Apache License 2.0 - See [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Submit pull request

---

## 📞 Support

- GitHub Issues: [Report bugs](https://github.com/your-repo/issues)
- Documentation: This file
- OpenClaw Skill: `openclaw-skill/SKILL.md`

---

*Built for the Tether WDK Hackathon 2026*
