/**
 * Exact-match brand / competitor detection (PRD §F5a).
 *
 * For a given entity (name + domain), scans the raw response for:
 *   - the NAME via a case-insensitive `\b…\b` word-boundary regex, so "Arc"
 *     does not match "architecture" or "search";
 *   - the full DOMAIN as a literal, case-insensitive substring (e.g.
 *     "measurex.io");
 *   - for names of 3+ characters, the domain's first label via the same word
 *     boundaries (e.g. "measurex" from "measurex.io").
 *
 * Short-name rule (PRD §F5a): if the name is fewer than 3 characters, name
 * matching is skipped entirely and only the domain match counts. This prevents
 * 1-2 character names from generating false positives.
 *
 * Pure and deterministic — no I/O, no side effects.
 */

import type { EntityMatchResult } from './types';

interface MatchSpan {
    start: number;
    end: number;
}

/** Escape regex metacharacters so a name/domain is matched literally. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collect the spans of every whole-term match (case-insensitive). */
function wordBoundaryMatchSpans(text: string, term: string): MatchSpan[] {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    const spans: MatchSpan[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        spans.push({ start: match.index, end: match.index + match[0].length });
        if (match.index === pattern.lastIndex) {
            pattern.lastIndex += 1; // guard against zero-length matches
        }
    }
    return spans;
}

/** Collect the spans of every literal domain occurrence (case-insensitive). */
function domainMatchSpans(text: string, domain: string): MatchSpan[] {
    const trimmed = domain.trim();
    if (trimmed.length === 0) {
        return [];
    }
    const pattern = new RegExp(escapeRegExp(trimmed), 'gi');
    const spans: MatchSpan[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        spans.push({ start: match.index, end: match.index + match[0].length });
        if (match.index === pattern.lastIndex) {
            pattern.lastIndex += 1;
        }
    }
    return spans;
}

/** Collapse rules that matched the same overlapping textual occurrence. */
function distinctMentionStarts(spans: MatchSpan[]): number[] {
    const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
    const mentions: MatchSpan[] = [];

    for (const span of sorted) {
        const previous = mentions.at(-1);
        if (!previous || span.start >= previous.end) {
            mentions.push({ ...span });
        } else {
            previous.end = Math.max(previous.end, span.end);
        }
    }

    return mentions.map((span) => span.start);
}

/**
 * Detect an entity (brand or competitor) within `text`.
 *
 * Returns `mentioned`, `mentionCount` (distinct non-overlapping textual
 * occurrences), and `firstMentionPosition` (earliest offset, or null).
 *
 * @param text   the raw AI response text.
 * @param name   the entity's display name (e.g. "MeasureX").
 * @param domain the entity's domain (e.g. "measurex.io").
 */
export function exactMatch(
    text: string,
    name: string,
    domain: string,
): EntityMatchResult {
    const absent: EntityMatchResult = {
        mentioned: false,
        mentionCount: 0,
        firstMentionPosition: null,
    };

    if (!text) {
        return absent;
    }

    const trimmedName = (name ?? '').trim();

    // Short-name rule: names under 3 chars are matched by domain only.
    const spans: MatchSpan[] = [];
    if (trimmedName.length >= 3) {
        spans.push(...wordBoundaryMatchSpans(text, trimmedName));
    }
    const trimmedDomain = (domain ?? '').trim();
    spans.push(...domainMatchSpans(text, trimmedDomain));
    if (trimmedName.length >= 3) {
        const domainStem = trimmedDomain.split('.')[0];
        if (domainStem.length >= 3) {
            spans.push(...wordBoundaryMatchSpans(text, domainStem));
        }
    }

    const offsets = distinctMentionStarts(spans);

    if (offsets.length === 0) {
        return absent;
    }

    return {
        mentioned: true,
        mentionCount: offsets.length,
        firstMentionPosition: Math.min(...offsets),
    };
}
