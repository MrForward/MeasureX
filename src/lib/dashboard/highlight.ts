/**
 * Response highlighting for the raw answer viewer (PRD §F8).
 *
 * Splits a raw AI response into typed segments so the UI can render brand
 * mentions (green), competitor mentions (amber), and URLs (clickable links)
 * WITHOUT dangerouslySetInnerHTML — React renders each segment as a span, so
 * untrusted response text can never inject markup.
 *
 * Match rules mirror extraction: names use case-insensitive `\b…\b` word
 * boundaries (so "Arc" doesn't highlight "architecture"); domains and URLs match
 * literally. URLs take priority over a domain match that falls inside them.
 *
 * Pure and deterministic.
 */

export type SegmentKind = 'plain' | 'brand' | 'competitor' | 'url';

export interface Segment {
    text: string;
    kind: SegmentKind;
}

interface Match {
    start: number;
    end: number;
    kind: Exclude<SegmentKind, 'plain'>;
    priority: number;
}

const URL_RE = /https?:\/\/[^\s)\]"'<>]+/gi;
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '"', "'"]);

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Push every match of `term` into `matches` (domain → literal, name → `\b…\b`). */
function collectTermMatches(
    text: string,
    term: string,
    kind: 'brand' | 'competitor',
    matches: Match[],
): void {
    const trimmed = term.trim();
    if (trimmed.length === 0) return;

    const escaped = escapeRegExp(trimmed);
    const source = trimmed.includes('.') ? escaped : `\\b${escaped}\\b`;
    const re = new RegExp(source, 'gi');

    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, kind, priority: 1 });
        if (m.index === re.lastIndex) re.lastIndex += 1;
    }
}

/**
 * Segment `text` for highlighting.
 *
 * @param brandTerms      brand name + domain (highlighted green).
 * @param competitorTerms all competitors' names + domains (highlighted amber).
 */
export function segmentResponse(
    text: string,
    brandTerms: string[],
    competitorTerms: string[],
): Segment[] {
    if (!text) return [];

    const matches: Match[] = [];

    // URLs (priority 0 — beat any domain match that falls inside them).
    for (const m of Array.from(text.matchAll(URL_RE))) {
        const start = m.index ?? 0;
        let end = start + m[0].length;
        while (end > start && TRAILING.has(text[end - 1])) end -= 1;
        matches.push({ start, end, kind: 'url', priority: 0 });
    }

    for (const term of brandTerms) collectTermMatches(text, term, 'brand', matches);
    for (const term of competitorTerms) collectTermMatches(text, term, 'competitor', matches);

    // Earliest start wins; then higher priority (lower number); then longer.
    matches.sort(
        (a, b) =>
            a.start - b.start ||
            a.priority - b.priority ||
            b.end - b.start - (a.end - a.start),
    );

    const accepted: Match[] = [];
    let lastEnd = 0;
    for (const match of matches) {
        if (match.start >= lastEnd) {
            accepted.push(match);
            lastEnd = match.end;
        }
    }

    const segments: Segment[] = [];
    let pos = 0;
    for (const match of accepted) {
        if (match.start > pos) {
            segments.push({ text: text.slice(pos, match.start), kind: 'plain' });
        }
        segments.push({ text: text.slice(match.start, match.end), kind: match.kind });
        pos = match.end;
    }
    if (pos < text.length) {
        segments.push({ text: text.slice(pos), kind: 'plain' });
    }

    return segments;
}
