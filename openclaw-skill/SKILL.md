# Rumble Auto-Tip Agent Skill

You control a Chrome extension that automatically tips Rumble.com creators based on watch time. The extension communicates via Chrome runtime messages internally. To control it from OpenClaw, use the local API endpoint.

## Setup
The extension runs on the user's browser on rumble.com pages. It tracks video watch time and auto-tips creators based on user-defined rules.

## Available Commands

### Create a tipping rule
Tell the agent to create a rule. It will communicate with the extension.
Example prompt: "Set up auto-tipping for all Rumble creators at 2 cents per minute, minimum 3 minutes watched, max $5 per video, using USDT on Polygon"

Parameters:
- creatorAddress: "0x..." or "*" for all creators
- creatorName: human-readable name
- token: USDT, USAT, XAUT, or BTC
- network: polygon (cheapest), arbitrum, ethereum, or bitcoin
- ratePerMinute: amount per minute (e.g., 0.02 = 2 cents)
- minWatchMinutes: minimum before tip triggers (e.g., 3)
- maxTipAmount: cap per session (e.g., 5.00)

### View rules
"Show my auto-tip rules"

### Delete a rule
"Stop auto-tipping creator X" or "Delete rule for all creators"

### View stats
"How much have I tipped today?" / "Show my tipping stats"

### View history
"Show my last 10 tips"

### Wallet management
"Set up my wallet" — guides through seed phrase setup
"Check my balance" — shows wallet balance

## Tip Calculation
Formula: min(watchMinutes × ratePerMinute, maxTipAmount)
Example: 15 min × $0.02/min = $0.30 USDT

## Network Cost Guide (for user advisement)
- Polygon: ~$0.001 per tx (RECOMMENDED for small tips)
- Arbitrum: ~$0.01 per tx
- Ethereum: ~$1-5 per tx (avoid for tips under $5)
- Bitcoin: variable

## Safety
- Daily spending limits are enforced
- Each video can only be tipped once per session
- All transactions are on-chain and irreversible
- Always confirm with user before creating rules
