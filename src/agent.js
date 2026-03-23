// ═══════════════════════════════════════════════════════════
// agent.js — AI-Powered Auto-Tip Agent
// ═══════════════════════════════════════════════════════════
// Autonomous agent that combines rule-based logic with LLM
// intelligence to make smart tipping decisions.
//
// Agent Architecture:
//   1. Rule Engine — User-defined rules (rate, min time, limits)
//   2. AI Reasoning — LLM analyzes context for intelligent decisions
//   3. Spending Guardian — Enforces budgets and prevents overspend
//   4. Decision Logger — Full audit trail of agent reasoning
//
// The agent operates autonomously: once rules are set, it
// monitors watch sessions and triggers payments without
// human intervention.

import { StorageHelper } from './storage.js';

const storage = new StorageHelper();

// ─── AI AGENT CONFIGURATION ─────────────────────────
const AI_CONFIG = {
  // OpenAI-compatible endpoint (user configurable)
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  // System prompt that defines agent personality and behavior
  systemPrompt: `You are RumbleTipAI, an autonomous tipping agent for Rumble.com video creators.
Your job is to analyze viewing sessions and make intelligent tipping decisions.

You receive context about:
- Creator name and content
- Watch duration and engagement
- User's tipping rules and budget
- Historical tipping patterns

You must respond with a JSON object:
{
  "shouldTip": true/false,
  "confidence": 0.0-1.0,
  "adjustedAmount": number or null,
  "reasoning": "brief explanation",
  "sentiment": "positive/neutral/negative"
}

Decision guidelines:
- Respect user's rules as the baseline
- Consider engagement quality (longer watch = more engaged)
- Be conservative with spending (protect user's budget)
- Suggest amount adjustments if context warrants (e.g., bonus for loyal creators)
- Never exceed maxTipAmount or daily limits
- If watch time barely meets minimum, suggest lower confidence

Budget conservation rules:
- When budget remaining < 20%: raise confidence threshold to 0.6 and prefer smaller tips
- When budget remaining < 10%: only tip for exceptional engagement (>10 min watch time)
- When a creator has been tipped recently (last 24h): reduce amount by 25% to spread across more creators
- Prioritize creators the user has watched longest overall`,
};

export class AgentEngine {

  constructor() {
    this.apiKey = null;       // Set via settings
    this.aiEnabled = false;   // AI features toggle
    this.decisionLog = [];    // Audit trail
  }

  // ─── INITIALIZE AI ────────────────────────────────
  async initAI() {
    const settings = await storage.getSettings();
    this.apiKey = settings.openaiApiKey || null;
    this.aiEnabled = !!this.apiKey && settings.aiAgentEnabled !== false;
    
    if (this.aiEnabled) {
      console.log('[Agent] AI reasoning enabled (model:', AI_CONFIG.model, ')');
    } else {
      console.log('[Agent] Running in rule-based mode (no API key)');
    }
  }

  // ─── SHOULD TIP? (Main Decision Function) ────────
  // The core autonomous decision function.
  // Combines rule-based checks with optional AI reasoning.
  //
  // Decision Pipeline:
  //   Step 1: Pre-checks (already tipped? rule exists?)
  //   Step 2: Rule evaluation (watch time, amount calc)
  //   Step 3: Budget verification (daily limit, session cap)
  //   Step 4: AI reasoning (optional - adjusts confidence/amount)
  //   Step 5: Final decision with full reasoning
  //
  // @returns {
  //   shouldTip: boolean,
  //   amount: number,
  //   token: string,
  //   network: string,
  //   reason: string,
  //   aiReasoning: object|null,
  //   confidence: number,
  // }
  async shouldTip({ creatorAddress, creatorName, watchMinutes, videoId }) {
    const startTime = Date.now();
    
    // ── Step 1: Pre-checks ──
    const session = await storage.getWatchSession(videoId);
    if (session?.tipped) {
      return this.skipQuiet({ shouldTip: false, reason: 'already_tipped' });
    }

    if (!creatorAddress) {
      return this.skipQuiet({
        shouldTip: false,
        reason: 'no_creator_address',
        note: 'Creator wallet address not detected yet. Open the tip modal on the video page to reveal it.'
      });
    }

    // ── Step 2: Rule matching ──
    const rule = await this.findMatchingRule(creatorAddress);
    if (!rule) {
      return this.logDecision({ shouldTip: false, reason: 'no_matching_rule' });
    }

    // ── Step 3: Minimum watch time ──
    if (watchMinutes < rule.minWatchMinutes) {
      return this.skipQuiet({
        shouldTip: false,
        reason: 'below_minimum_watch_time',
        current: watchMinutes,
        required: rule.minWatchMinutes
      });
    }

    // ── Step 4: Calculate base tip amount ──
    let tipAmount = watchMinutes * rule.ratePerMinute;
    tipAmount = Math.min(tipAmount, rule.maxTipAmount);
    tipAmount = Math.round(tipAmount * 100) / 100;

    if (tipAmount <= 0) {
      return this.logDecision({ shouldTip: false, reason: 'amount_zero' });
    }

    // ── Step 5: Budget verification ──
    const settings = await storage.getSettings();
    const todaySpent = await storage.getTodaySpending();

    if (todaySpent + tipAmount > settings.maxDailySpend) {
      return this.logDecision({
        shouldTip: false,
        reason: 'daily_limit_reached',
        todaySpent,
        dailyLimit: settings.maxDailySpend,
        wouldNeed: todaySpent + tipAmount
      });
    }

    // ── Step 5b: Budget conservation (rule-based, always active) ──
    const budgetRemaining = settings.maxDailySpend - todaySpent;
    const budgetPct = budgetRemaining / settings.maxDailySpend;

    if (budgetPct < 0.1) {
      // <10% budget: only tip for exceptional engagement
      if (watchMinutes < 10) {
        return this.logDecision({
          shouldTip: false,
          reason: 'budget_conservation_critical',
          budgetPct: (budgetPct * 100).toFixed(0) + '%',
          note: 'Budget < 10%, only tipping for >10min engagement',
        });
      }
      tipAmount = Math.min(tipAmount, rule.maxTipAmount * 0.5); // Cap at 50%
    } else if (budgetPct < 0.2) {
      // <20% budget: reduce tip amounts
      tipAmount = Math.min(tipAmount, rule.maxTipAmount * 0.75);
    }

    tipAmount = Math.round(tipAmount * 100) / 100;

    // ── Step 6: AI Reasoning (if enabled) ──
    let aiReasoning = null;
    let confidence = 1.0;

    if (this.aiEnabled) {
      try {
        aiReasoning = await this.getAIDecision({
          creatorName,
          creatorAddress,
          watchMinutes,
          baseAmount: tipAmount,
          rule,
          todaySpent,
          dailyLimit: settings.maxDailySpend,
          tipHistory: await storage.getTipHistory(10),
        });

        confidence = aiReasoning.confidence || 1.0;

        // AI can adjust amount (within rule bounds)
        if (aiReasoning.adjustedAmount !== null && aiReasoning.adjustedAmount !== undefined) {
          const adjusted = Math.min(aiReasoning.adjustedAmount, rule.maxTipAmount);
          if (adjusted > 0 && adjusted <= rule.maxTipAmount) {
            tipAmount = Math.round(adjusted * 100) / 100;
          }
        }

        // AI can veto the tip (low confidence)
        if (!aiReasoning.shouldTip && confidence < 0.3) {
          return this.logDecision({
            shouldTip: false,
            reason: 'ai_low_confidence',
            aiReasoning,
            confidence,
          });
        }

        console.log(`[Agent AI] Reasoning: ${aiReasoning.reasoning}`);
        console.log(`[Agent AI] Confidence: ${confidence}`);
      } catch (err) {
        // AI failure is non-blocking — fallback to rule-based
        console.warn('[Agent AI] AI reasoning failed, using rule-based:', err.message);
        aiReasoning = { error: err.message, fallback: 'rule_based' };
      }
    }

    // ── Step 7: Final decision ──
    const decision = {
      shouldTip: true,
      amount: tipAmount,
      token: rule.token,
      network: rule.network,
      ruleId: rule.id,
      confidence,
      aiReasoning,
      formula: `${watchMinutes.toFixed(1)} min × ${rule.ratePerMinute} ${rule.token}/min = ${tipAmount} ${rule.token}`,
      decisionTimeMs: Date.now() - startTime,
    };

    return this.logDecision(decision);
  }

  // ─── AI DECISION ENGINE ───────────────────────────
  // Calls LLM to get intelligent reasoning about the tip.
  // This adds a layer of AI intelligence on top of rules.
  async getAIDecision(context) {
    if (!this.apiKey) {
      return { shouldTip: true, confidence: 1.0, reasoning: 'No API key — rule-based mode' };
    }

    const budgetRemaining = context.dailyLimit - context.todaySpent;
    const budgetPct = ((budgetRemaining / context.dailyLimit) * 100).toFixed(0);
    const recentToCreator = context.tipHistory.filter(
      t => t.creatorName === context.creatorName
    ).length;

    const userMessage = `Analyze this tipping decision:

Creator: ${context.creatorName}
Watch Time: ${context.watchMinutes.toFixed(1)} minutes
Base Tip Amount: $${context.baseAmount} ${context.rule.token}
Rule: $${context.rule.ratePerMinute}/min, min ${context.rule.minWatchMinutes} min, max $${context.rule.maxTipAmount}
Today's Spending: $${context.todaySpent} / $${context.dailyLimit} daily limit
Budget Remaining: ${budgetPct}% ($${budgetRemaining.toFixed(2)})
Recent Tips to This Creator: ${recentToCreator} in last ${context.tipHistory.length} tips
Network: ${context.rule.network} (${context.rule.network === 'polygon' ? '~$0.001 gas' : context.rule.network === 'arbitrum' ? '~$0.01 gas' : '$1-5 gas'})

Should I send this tip? Respond with JSON only.`;

    try {
      const response = await fetch(AI_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: 'system', content: AI_CONFIG.systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 200,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return { shouldTip: true, confidence: 0.8, reasoning: content };
    } catch (error) {
      console.warn('[Agent AI] LLM call failed:', error.message);
      // Graceful fallback — never block tipping due to AI failure
      return {
        shouldTip: true,
        confidence: 1.0,
        adjustedAmount: null,
        reasoning: `AI unavailable (${error.message}), using rule-based decision`,
        sentiment: 'neutral',
      };
    }
  }

  // ─── DECISION LOGGER ──────────────────────────────
  // Maintains audit trail of all agent decisions
  logDecision(decision) {
    const entry = {
      ...decision,
      timestamp: Date.now(),
    };
    
    this.decisionLog.push(entry);
    
    // Keep last 100 decisions in memory
    if (this.decisionLog.length > 100) {
      this.decisionLog = this.decisionLog.slice(-100);
    }

    const action = decision.shouldTip ? '✅ TIP' : '⏭ SKIP';
    console.log(`[Agent] ${action}: ${decision.reason || decision.formula || 'approved'}`);

    return decision;
  }

  // ─── SKIP QUIET (reduce log spam) ──────────────────
  // For repeated skip reasons (no address, below time), only log once per reason
  skipQuiet(decision) {
    const key = decision.reason;
    if (this._lastSkipReason !== key) {
      this._lastSkipReason = key;
      console.log(`[Agent] ⏭ SKIP: ${key}${decision.note ? ' — ' + decision.note : ''}`);
    }
    return decision;
  }

  // ─── GET DECISION LOG ─────────────────────────────
  getDecisionLog(limit = 20) {
    return this.decisionLog.slice(-limit);
  }

  // ─── FIND MATCHING RULE ─────────────────────────
  // Cari aturan yang cocok untuk kreator ini.
  // Prioritas: aturan spesifik > wildcard (*)
  async findMatchingRule(creatorAddress) {
    const rules = await this.getRules();

    if (!rules || rules.length === 0) return null;

    // Cari aturan spesifik untuk kreator ini
    const specificRule = rules.find(
      r => r.isActive && r.creatorAddress?.toLowerCase() === creatorAddress?.toLowerCase()
    );
    if (specificRule) return specificRule;

    // Cari wildcard rule (berlaku untuk semua kreator)
    const wildcardRule = rules.find(
      r => r.isActive && r.creatorAddress === '*'
    );
    return wildcardRule || null;
  }

  // ─── CREATE RULE ────────────────────────────────
  async createRule(data) {
    const rules = await this.getRules();

    // Validasi
    if (!data.ratePerMinute || data.ratePerMinute <= 0 || data.ratePerMinute > 10) {
      return { error: 'ratePerMinute must be between 0.001 and 10' };
    }
    if (!data.maxTipAmount || data.maxTipAmount <= 0 || data.maxTipAmount > 1000) {
      return { error: 'maxTipAmount must be between 0.01 and 1000' };
    }
    // Validate token (per hackathon requirements: USDT, USAT, XAUT, BTC)
    if (!['USDT', 'USAT', 'XAUT', 'BTC'].includes(data.token || 'USDT')) {
      return { error: 'Invalid token. Use: USDT, USAT, XAUT, or BTC' };
    }
    if (!['ethereum', 'polygon', 'arbitrum', 'bitcoin'].includes(data.network || 'polygon')) {
      return { error: 'Invalid network. Use: ethereum, polygon, arbitrum, or bitcoin' };
    }

    // Deactivate existing rule for the same creator
    const existingIdx = rules.findIndex(
      r => r.isActive && r.creatorAddress?.toLowerCase() === (data.creatorAddress || '*').toLowerCase()
    );
    if (existingIdx >= 0) {
      rules[existingIdx].isActive = false;
    }

    const newRule = {
      id: `rule_${Date.now()}`,
      creatorAddress: data.creatorAddress || '*',
      creatorName: data.creatorName || (data.creatorAddress === '*' ? 'All Creators' : 'Unknown'),
      token: data.token || 'USDT',
      network: data.network || 'polygon',
      ratePerMinute: data.ratePerMinute || 0.02,
      minWatchMinutes: data.minWatchMinutes || 3,
      maxTipAmount: data.maxTipAmount || 5.00,
      isActive: true,
      createdAt: Date.now()
    };

    rules.push(newRule);
    await chrome.storage.local.set({ tipRules: rules });

    console.log('[Agent] Rule created:', newRule);
    return { success: true, rule: newRule };
  }

  // ─── GET RULES ──────────────────────────────────
  async getRules() {
    const data = await chrome.storage.local.get('tipRules');
    return data.tipRules || [];
  }

  // ─── DELETE RULE ────────────────────────────────
  async deleteRule(ruleId) {
    const rules = await this.getRules();
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx >= 0) {
      rules[idx].isActive = false;
      await chrome.storage.local.set({ tipRules: rules });
      return { success: true };
    }
    return { error: 'Rule not found' };
  }

  // ─── UPDATE RULE ────────────────────────────────
  async updateRule(ruleId, updates) {
    const rules = await this.getRules();
    const idx = rules.findIndex(r => r.id === ruleId);
    if (idx >= 0) {
      rules[idx] = { ...rules[idx], ...updates };
      await chrome.storage.local.set({ tipRules: rules });
      return { success: true, rule: rules[idx] };
    }
    return { error: 'Rule not found' };
  }

  // ─── AI CHAT ──────────────────────────────────────
  // Conversational AI that can create/modify rules, show stats,
  // and answer questions via natural language.
  async chat(userMessage, context = {}) {
    if (!this.apiKey) {
      return this.chatFallback(userMessage, context);
    }

    const rules = await this.getRules();
    const activeRules = rules.filter(r => r.isActive);
    const stats = context.stats || {};
    const settings = context.settings || {};

    const chatSystemPrompt = `You are RumbleTipAI Assistant, a helpful AI inside a Chrome extension that auto-tips Rumble.com video creators with cryptocurrency.

You can help users:
1. Create tipping rules
2. Delete/modify rules
3. Check stats and spending
4. Update settings (budget, preferences)
5. Answer questions about the extension

Current state:
- Active rules: ${activeRules.length > 0 ? activeRules.map(r => `${r.creatorName || r.creatorAddress} @ ${r.ratePerMinute} ${r.token}/min on ${r.network}, min ${r.minWatchMinutes}m, max ${r.maxTipAmount}`).join('; ') : 'None'}
- Total tips sent: ${stats.totalTips || 0}
- Today spent: $${(stats.todaySpent || 0).toFixed(2)} / $${settings.maxDailySpend || 50} daily limit
- Total amount: $${(stats.totalAmount || 0).toFixed(2)}
- AI enabled: ${this.aiEnabled ? 'Yes' : 'No'}
- Default network: ${settings.defaultNetwork || 'polygon'}

IMPORTANT: Always respond with a JSON object:
{
  "message": "Your friendly response to the user",
  "action": null or one of the action objects below
}

Available actions:
1. Create rule:
   { "type": "create_rule", "params": { "creatorAddress": "*", "ratePerMinute": 0.02, "token": "USDT", "network": "polygon", "minWatchMinutes": 3, "maxTipAmount": 5 } }

2. Delete all rules:
   { "type": "delete_all_rules" }

3. Delete specific rule:
   { "type": "delete_rule", "params": { "ruleId": "rule_xxx" } }

4. Update settings:
   { "type": "update_settings", "params": { "maxDailySpend": 20 } }

5. No action (info only):
   null

Rules for responding:
- Be concise and friendly
- Respond in the same language as the user (if they write in Indonesian, respond in Indonesian)
- When creating rules, confirm the parameters clearly
- If ambiguous, ask for clarification
- Valid tokens: USDT, USAT, XAUT, BTC
- Valid networks: polygon, arbitrum, ethereum, bitcoin
- Default to USDT on polygon if not specified
- Always respond with JSON only`;

    try {
      const response = await fetch(AI_CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: 'system', content: chatSystemPrompt },
            ...(context.history || []),
            { role: 'user', content: userMessage },
          ],
          max_tokens: 400,
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message || content,
          action: parsed.action || null,
        };
      }

      return { message: content, action: null };
    } catch (error) {
      console.warn('[Agent Chat] LLM call failed:', error.message);
      return this.chatFallback(userMessage, context);
    }
  }

  // ─── CHAT FALLBACK (no API key) ─────────────────
  // Simple pattern matching for basic commands when AI is unavailable.
  chatFallback(userMessage, context = {}) {
    const msg = userMessage.toLowerCase().trim();
    const stats = context.stats || {};
    const settings = context.settings || {};

    // Create rule patterns
    const tipMatch = msg.match(/tip\s+\$?([\d.]+)\s*(?:\/|\s*per\s*)(?:min|minute|menit)/i);
    if (tipMatch) {
      const rate = parseFloat(tipMatch[1]);
      const maxMatch = msg.match(/max\s+\$?([\d.]+)/i);
      const maxTip = maxMatch ? parseFloat(maxMatch[1]) : 5;
      const network = msg.includes('arbitrum') ? 'arbitrum' : msg.includes('ethereum') ? 'ethereum' : msg.includes('bitcoin') ? 'bitcoin' : 'polygon';
      const token = msg.includes('xaut') ? 'XAUT' : msg.includes('usat') ? 'USAT' : msg.includes('btc') ? 'BTC' : 'USDT';

      return {
        message: `Creating rule: $${rate} ${token}/min, max $${maxTip}, on ${network}.`,
        action: {
          type: 'create_rule',
          params: {
            creatorAddress: '*',
            ratePerMinute: rate,
            token,
            network,
            minWatchMinutes: 3,
            maxTipAmount: maxTip,
          }
        }
      };
    }

    // Show rules
    if (msg.includes('rule') && (msg.includes('show') || msg.includes('list') || msg.includes('lihat') || msg.includes('tampil'))) {
      const rules = context.rules || [];
      const active = rules.filter(r => r.isActive);
      if (active.length === 0) {
        return { message: 'No active rules. Try: "tip $0.02/min on polygon"', action: null };
      }
      const list = active.map(r => `• ${r.creatorName || 'All'}: $${r.ratePerMinute} ${r.token}/min, max $${r.maxTipAmount} on ${r.network}`).join('\n');
      return { message: `Active rules:\n${list}`, action: null };
    }

    // Delete rules
    if (msg.includes('hapus') || msg.includes('delete') || msg.includes('remove') || msg.includes('clear')) {
      if (msg.includes('semua') || msg.includes('all')) {
        return { message: 'Deleting all rules.', action: { type: 'delete_all_rules' } };
      }
    }

    // Stats
    if (msg.includes('stats') || msg.includes('statistik') || msg.includes('berapa') || msg.includes('total') || msg.includes('spending')) {
      return {
        message: `📊 Stats:\n• Total tips: ${stats.totalTips || 0}\n• Total sent: $${(stats.totalAmount || 0).toFixed(2)}\n• Today: $${(stats.todaySpent || 0).toFixed(2)} / $${settings.maxDailySpend || 50}\n• Creators: ${stats.uniqueCreators || 0}`,
        action: null
      };
    }

    // Budget
    const budgetMatch = msg.match(/budget\s+\$?([\d.]+)/i) || msg.match(/daily\s+\$?([\d.]+)/i);
    if (budgetMatch) {
      const amount = parseFloat(budgetMatch[1]);
      return {
        message: `Setting daily budget to $${amount}.`,
        action: { type: 'update_settings', params: { maxDailySpend: amount } }
      };
    }

    // Help / default
    return {
      message: `I can help you with:\n• "Tip $0.05/min on polygon" — create a rule\n• "Show my rules" — list active rules\n• "Delete all rules" — clear rules\n• "Stats" — check your tipping stats\n• "Budget $30" — set daily limit\n\n💡 For AI-powered chat, add your OpenAI API key in Settings.`,
      action: null
    };
  }
}
