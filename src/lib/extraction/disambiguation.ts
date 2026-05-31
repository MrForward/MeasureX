/**
 * Context disambiguation for multi-entity matches.
 *
 * Sometimes a single matched span of text could refer to more than one
 * configured entity. Two situations cause this:
 *
 *   1. Two entities share a common word — e.g. the brand "Salesforce" and a
 *      competitor "Force" both match the token "Force" at the same position.
 *   2. A generic-word brand name ("Monday", "Notion") legitimately collides
 *      with everyday English, so the matcher can't be sure which entity (if
 *      any of the configured ones) the text refers to.
 *
 * When the same matched text + position is claimed by 2+ entities, we have an
 * AMBIGUOUS MENTION. We resolve it with the platform's "algorithmic first,
 * LLM second" approach: a focused, context-window prompt is sent to a cheap
 * LLM (Haiku) asking which entity the mention refers to.
 *
 * CRITICAL — TOKEN BURN PROTECTION:
 * The number of LLM calls per response is strictly capped by
 * `extraction.max_llm_calls_per_response` (CONFIG_DEFAULTS = 1). Once that
 * budget is spent, every remaining ambiguous mention is flagged for human
 * review WITHOUT another LLM call. This is the loop guard that prevents a
 * pathological response (dozens of ambiguous mentions) from spiralling cost.
 *
 * Safety: disambiguation NEVER throws. An LLM error, an unparseable reply, or
 * an answer naming an entity that isn't a candidate all resolve to
 * "flag for review" rather than crashing extraction.
 *
 * Validates: Requirement 17.2 (when a mention matches multiple configured
 *   entities, use context analysis to assign the mention to the most likely
 *   entity AND flag it for review).
 */

import { CONFIG_DEFAULTS } from '@/lib/config/defaults';
import type { EntityMatch, MatchableEntity } from './types';
import type { LLMClassifier } from './recommendation-strength';

/**
 * Default number of disambiguation LLM calls allowed per response, sourced
 * from the config registry (token burn protection loop guard). Falls back to 1
 * if the key is somehow absent.
 */
export const DEFAULT_MAX_LLM_CALLS: number =
    typeof CONFIG_DEFAULTS['extraction.max_llm_calls_per_response']?.value === 'number'
        ? (CONFIG_DEFAULTS['extraction.max_llm_calls_per_response'].value as number)
        : 1;

/**
 * Half-width (in characters) of the context window passed to the LLM around an
 * ambiguous mention (~150 chars total span). Enough surrounding text to reason
 * about which entity is meant, without sending the whole response.
 */
export const CONTEXT_WINDOW_CHARS = 75;

/**
 * A mention whose matched text + position was claimed by two or more candidate
 * entities. `candidateEntityIds` always holds 2+ distinct ids.
 */
export interface AmbiguousMention {
    /** The exact substring found in the response text. */
    matchedText: string;
    /** Zero-based character index where the matched text starts. */
    position: number;
    /** The distinct entity ids (2+) this mention could refer to. */
    candidateEntityIds: string[];
}

/** Result of disambiguating a single ambiguous mention. */
export interface DisambiguationDecision {
    /** The chosen entity id, or null when still ambiguous. */
    entityId: string | null;
    /** True when the mention could not be confidently resolved. */
    flagForReview: boolean;
}

/** Result of disambiguating every ambiguous mention in a response. */
export interface DisambiguationResult {
    /**
     * The matches after disambiguation. For each resolved ambiguous mention,
     * only the chosen entity's match is kept (the losing candidates at that
     * text+position are dropped). Non-ambiguous matches pass through untouched.
     */
    resolved: EntityMatch[];
    /** Ambiguous mentions that could not be resolved (need human review). */
    flaggedForReview: AmbiguousMention[];
    /** How many LLM calls were actually made (≤ the budget). */
    llmCallsMade: number;
}

/** Group key for a mention: matched text (lower-cased) + position. */
function mentionKey(matchedText: string, position: number): string {
    return `${matchedText.toLowerCase()}@${position}`;
}

/**
 * Identify mentions where the same text + position was matched by 2+ distinct
 * entities. Matches are grouped by (lower-cased matchedText + position); any
 * group whose matches reference two or more distinct entity ids is ambiguous.
 *
 * Order of the returned mentions follows first appearance (by position then
 * first-seen) so disambiguation spends its limited budget deterministically.
 */
export function findAmbiguousMentions(matches: EntityMatch[]): AmbiguousMention[] {
    interface Group {
        matchedText: string;
        position: number;
        entityIds: string[];
    }

    const groups = new Map<string, Group>();

    for (const match of matches) {
        const key = mentionKey(match.matchedText, match.position);
        const existing = groups.get(key);
        if (existing) {
            if (!existing.entityIds.includes(match.entityId)) {
                existing.entityIds.push(match.entityId);
            }
        } else {
            groups.set(key, {
                matchedText: match.matchedText,
                position: match.position,
                entityIds: [match.entityId],
            });
        }
    }

    const ambiguous: AmbiguousMention[] = [];
    for (const group of Array.from(groups.values())) {
        if (group.entityIds.length >= 2) {
            ambiguous.push({
                matchedText: group.matchedText,
                position: group.position,
                candidateEntityIds: group.entityIds,
            });
        }
    }

    // Deterministic ordering by position then matched text.
    ambiguous.sort((a, b) =>
        a.position - b.position || a.matchedText.localeCompare(b.matchedText),
    );

    return ambiguous;
}

/** Extract a context window of text surrounding an ambiguous mention. */
function contextWindow(text: string, position: number, matchedLength: number): string {
    const safePosition = Math.max(0, position);
    const safeLength = Math.max(0, matchedLength);
    const start = Math.max(0, safePosition - CONTEXT_WINDOW_CHARS);
    const end = Math.min(text.length, safePosition + safeLength + CONTEXT_WINDOW_CHARS);
    return text.slice(start, end);
}

/**
 * Build the focused disambiguation prompt. The model is shown the surrounding
 * context and the list of candidate entities (by id + name), and asked to
 * answer with exactly one entity id, or "unknown" when it cannot decide.
 */
export function buildDisambiguationPrompt(
    text: string,
    mention: AmbiguousMention,
    candidates: MatchableEntity[],
): string {
    const window = contextWindow(text, mention.position, mention.matchedText.length);

    const optionLines = candidates.map(
        (c) => `- ${c.id}: ${c.name} (${c.type}${c.domain ? `, ${c.domain}` : ''})`,
    );

    return [
        'You disambiguate which configured entity a mention refers to.',
        `Ambiguous mention: "${mention.matchedText}"`,
        '',
        'Surrounding context:',
        window,
        '',
        'Candidate entities:',
        ...optionLines,
        '',
        'Decide which single candidate the mention refers to based on the context.',
        'Respond with ONLY the entity id from the list above.',
        'If you cannot decide confidently, respond with exactly: unknown',
    ].join('\n');
}

/**
 * Parse a raw LLM reply into a chosen entity id. Returns the matching
 * candidate id when the reply clearly names exactly one candidate; otherwise
 * returns null (→ flag for review). Defensive against ids appearing as
 * substrings of one another by preferring an exact token match.
 */
export function parseDisambiguationResponse(
    raw: string,
    candidateEntityIds: string[],
): string | null {
    const normalized = raw.trim().toLowerCase();
    if (normalized.length === 0 || normalized === 'unknown') {
        return null;
    }

    // Prefer an exact match against a candidate id.
    const exact = candidateEntityIds.find((id) => id.toLowerCase() === normalized);
    if (exact) {
        return exact;
    }

    // Otherwise accept a reply that contains exactly one candidate id; if it
    // mentions multiple (or none), treat it as undecided.
    const contained = candidateEntityIds.filter((id) => normalized.includes(id.toLowerCase()));
    return contained.length === 1 ? contained[0] : null;
}

/**
 * Disambiguate a single ambiguous mention using context + the LLM.
 *
 * Builds a context-window prompt, asks the classifier which candidate the
 * mention refers to, and validates the reply against the candidate ids. The
 * chosen entity id is returned when resolved; otherwise `flagForReview` is set.
 *
 * Safety: NEVER throws. A rejected/erroring classifier or an unparseable reply
 * both resolve to `{ entityId: null, flagForReview: true }`.
 */
export async function disambiguateMention(
    text: string,
    mention: AmbiguousMention,
    entities: MatchableEntity[],
    classifier: LLMClassifier,
): Promise<DisambiguationDecision> {
    const candidates = entities.filter((e) => mention.candidateEntityIds.includes(e.id));

    // No usable candidate metadata → cannot reason, flag for review.
    if (candidates.length === 0) {
        return { entityId: null, flagForReview: true };
    }

    try {
        const prompt = buildDisambiguationPrompt(text, mention, candidates);
        const raw = await classifier.classify(prompt);
        const chosen = parseDisambiguationResponse(raw, mention.candidateEntityIds);
        if (chosen === null) {
            return { entityId: null, flagForReview: true };
        }
        return { entityId: chosen, flagForReview: false };
    } catch {
        // A misbehaving classifier must not break extraction.
        return { entityId: null, flagForReview: true };
    }
}

/**
 * Drop the losing candidate matches for a resolved ambiguous mention, keeping
 * only the chosen entity at that text + position. Matches not belonging to the
 * mention's group are left untouched.
 */
function keepChosen(
    matches: EntityMatch[],
    mention: AmbiguousMention,
    chosenEntityId: string,
): EntityMatch[] {
    const key = mentionKey(mention.matchedText, mention.position);
    return matches.filter((m) => {
        if (mentionKey(m.matchedText, m.position) !== key) {
            return true; // different mention — keep
        }
        // Same ambiguous span — keep only the chosen entity.
        return m.entityId === chosenEntityId;
    });
}

/**
 * Disambiguate all ambiguous mentions in a response, respecting the
 * max-LLM-calls budget.
 *
 * Algorithm:
 *   1. Find ambiguous mentions (same text+position claimed by 2+ entities).
 *   2. For each, while the LLM-call budget remains, ask the LLM to choose.
 *      - Resolved → drop the losing candidates, keep the chosen match.
 *      - Undecided / LLM error → flag for review.
 *   3. CRITICAL: once the budget is exhausted, every remaining ambiguous
 *      mention is flagged for review WITHOUT calling the LLM (token burn
 *      protection loop guard).
 *
 * Each disambiguation attempt that reaches the LLM consumes exactly one call,
 * whether or not it resolves. Returns the resolved matches, the mentions
 * flagged for review, and the number of LLM calls actually made.
 *
 * Safety: NEVER throws — individual mention failures flag for review.
 *
 * @param maxLlmCalls optional override; defaults to the config registry value
 *   `extraction.max_llm_calls_per_response`.
 */
export async function disambiguateMatches(
    text: string,
    matches: EntityMatch[],
    entities: MatchableEntity[],
    classifier: LLMClassifier,
    maxLlmCalls: number = DEFAULT_MAX_LLM_CALLS,
): Promise<DisambiguationResult> {
    const ambiguous = findAmbiguousMentions(matches);

    // Clamp the budget to a non-negative integer.
    const budget = Math.max(0, Math.floor(maxLlmCalls));

    let resolved = matches;
    const flaggedForReview: AmbiguousMention[] = [];
    let llmCallsMade = 0;

    for (const mention of ambiguous) {
        if (llmCallsMade >= budget) {
            // Budget exhausted — flag the rest without spending tokens.
            flaggedForReview.push(mention);
            continue;
        }

        // This attempt consumes one LLM call regardless of the outcome.
        llmCallsMade += 1;
        const decision = await disambiguateMention(text, mention, entities, classifier);

        if (decision.flagForReview || decision.entityId === null) {
            flaggedForReview.push(mention);
        } else {
            resolved = keepChosen(resolved, mention, decision.entityId);
        }
    }

    return { resolved, flaggedForReview, llmCallsMade };
}
