/**
 * Default platform configuration values.
 *
 * These are the fallback values used when a config key is not found in the
 * database. All tunable parameters live here so behavior can be changed at
 * runtime via the admin panel without redeploying code.
 *
 * Categories: scoring | limits | engines | costs | auth | extraction | notifications | platform
 */

export interface ConfigDefault {
    value: unknown;
    description: string;
    category: string;
}

export const CONFIG_DEFAULTS: Record<string, ConfigDefault> = {
    // ── Scoring ──────────────────────────────────────
    'scoring.mention_weight': { value: 0.25, description: 'Weight for mention presence factor', category: 'scoring' },
    'scoring.position_weight': { value: 0.25, description: 'Weight for mention position factor', category: 'scoring' },
    'scoring.recommendation_weight': { value: 0.25, description: 'Weight for recommendation strength factor', category: 'scoring' },
    'scoring.citation_weight': { value: 0.25, description: 'Weight for citation inclusion factor', category: 'scoring' },
    'scoring.variance_threshold': { value: 10, description: 'Points below which WoW change is "normal variance"', category: 'scoring' },
    'scoring.significant_shift': { value: 30, description: 'Points above which change is "significant shift"', category: 'scoring' },

    // ── Limits ───────────────────────────────────────
    'limits.max_prompts_free': { value: 25, description: 'Max active prompts per free workspace', category: 'limits' },
    'limits.max_competitors': { value: 5, description: 'Max competitors per workspace', category: 'limits' },
    'limits.max_aliases': { value: 3, description: 'Max brand aliases', category: 'limits' },
    'limits.manual_run_cooldown_hours': { value: 24, description: 'Hours between manual runs', category: 'limits' },
    'limits.max_prompt_length': { value: 500, description: 'Max characters in prompt text', category: 'limits' },
    'limits.min_prompt_length': { value: 10, description: 'Min characters in prompt text', category: 'limits' },
    'limits.prompt_similarity_threshold': { value: 0.8, description: 'Cosine similarity threshold for duplicate warning', category: 'limits' },

    // ── Engines ──────────────────────────────────────
    'engines.openai_rpm': { value: 60, description: 'OpenAI requests per minute', category: 'engines' },
    'engines.perplexity_rpm': { value: 50, description: 'Perplexity requests per minute', category: 'engines' },
    'engines.serp_rpm': { value: 30, description: 'SERP provider requests per minute', category: 'engines' },
    'engines.circuit_breaker_failures': { value: 5, description: 'Consecutive failures before circuit opens', category: 'engines' },
    'engines.circuit_breaker_pause_ms': { value: 1_800_000, description: 'Pause duration when circuit opens (30min)', category: 'engines' },
    'engines.retry_max_attempts': { value: 3, description: 'Max retry attempts per execution', category: 'engines' },
    'engines.retry_base_delay_ms': { value: 1000, description: 'Base delay for exponential backoff', category: 'engines' },
    'engines.timeout_ms': { value: 30_000, description: 'Per-call timeout', category: 'engines' },

    // ── Costs (token burn protection) ────────────────
    'costs.run_budget_usd': { value: 5.0, description: 'Max spend per single run before abort', category: 'costs' },
    'costs.workspace_daily_cap_calls': { value: 500, description: 'Max API calls per workspace per day', category: 'costs' },
    'costs.platform_daily_cap_usd': { value: 50.0, description: 'Platform-wide daily spend cap', category: 'costs' },
    'costs.throttle_threshold_pct': { value: 150, description: '% of plan allocation before throttling', category: 'costs' },
    'costs.kill_threshold_pct': { value: 200, description: '% of plan allocation before hard stop', category: 'costs' },

    // ── Extraction ───────────────────────────────────
    'extraction.confidence_threshold': { value: 0.7, description: 'Below this → flag as ambiguous', category: 'extraction' },
    'extraction.fuzzy_min_length_pct': { value: 0.8, description: 'Min % of brand name for fuzzy match', category: 'extraction' },
    'extraction.max_llm_calls_per_response': { value: 1, description: 'Max LLM disambiguation calls per response', category: 'extraction' },

    // ── Auth ─────────────────────────────────────────
    'auth.token_expiry_minutes': { value: 15, description: 'JWT access token lifetime', category: 'auth' },
    'auth.refresh_expiry_days': { value: 7, description: 'Refresh token lifetime', category: 'auth' },
    'auth.dev_bypass_enabled': { value: false, description: 'Enable dev auth bypass (NEVER true in prod)', category: 'auth' },

    // ── Notifications ────────────────────────────────
    'notifications.stale_data_days': { value: 7, description: 'Days before SERP data is flagged stale', category: 'notifications' },
    'notifications.failure_alert_threshold_pct': { value: 50, description: '% failure rate before alerting', category: 'notifications' },

    // ── Platform (kill switch, pause) ────────────────
    'platform.kill_switch': { value: false, description: 'Pause ALL processing platform-wide', category: 'platform' },
    'platform.pause_new_runs': { value: false, description: 'Pause new run creation (auto-set by queue monitor)', category: 'platform' },
};
