/**
 * Exact-match brand / competitor detection (PRD §F5a).
 *
 * For a given entity (name + domain), scans the raw response for:
 *   - the NAME via a case-insensitive `\b…\b` word-boundary regex, so "Arc"
 *     does not match "architecture" or "search";
 *   - the DOMAIN as a literal, case-insensitive substring (e.g. "measurex.io").
 *
 * Short-name rule (PRD §F5a): if the name is fewer than 3 characters, name
 * matching is skipped entirely and only the domain match counts. This prevents
 * 1-2 character names from generating false positives.
 *
 * Pure and deterministic — no I/O, no side effects.
 */

import type { EntityMatchResult } from './types';

/** Escape regex metacharacters so a name/domain is matched literally. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collect the start offsets of every `\bname\b` match (case-insensitive). */
function nameMatchOffsets(text: string, name: string): number[] {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'gi');
    const offsets: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        offsets.push(match.index);
        if (match.index === pattern.lastIndex) {
            pattern.lastIndex += 1; // guard against zero-length matches
        }
    }
    return offsets;
}

/** Collect the start offsets of every literal domain occurrence (case-insensitive). */
function domainMatchOffsets(text: string, domain: string): number[] {
    const trimmed = domain.trim();
    if (trimmed.length === 0) {
        return [];
    }
    const pattern = new RegExp(escapeRegExp(trimmed), 'gi');
    const offsets: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
        offsets.push(match.index);
        if (match.index === pattern.lastIndex) {
            pattern.lastIndex += 1;
        }
    }
    return offsets;
}

/**
 * Detect an entity (brand or competitor) within `text`.
 *
 * Returns `mentioned`, `mentionCount` (distinct start offsets across name and
 * domain matches), and `firstMentionPosition` (earliest offset, or null).
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
    const offsets = new Set<number>();
    if (trimmedName.length >= 3) {
        for (const offset of nameMatchOffsets(text, trimmedName)) {
            offsets.add(offset);
        }
    }
    for (const offset of domainMatchOffsets(text, domain ?? '')) {
        offsets.add(offset);
    }

    if (offsets.size === 0) {
        return absent;
    }

    return {
        mentioned: true,
        mentionCount: offsets.size,
        firstMentionPosition: Math.min(...offsets),
    };
}
