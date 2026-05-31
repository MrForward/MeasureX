/**
 * URL extraction and domain normalization.
 *
 * A shared, robust module for pulling URLs out of raw AI engine response text
 * and reducing them to their base registrable domain for citation analysis.
 * Unlike Perplexity and Google AI (which return citations natively), ChatGPT
 * embeds links inline in plain text — this module lets the extraction pipeline
 * recover citations from ALL engines uniformly.
 *
 * Every function here is pure, deterministic, and never throws on malformed
 * input (it returns best-effort or empty results instead).
 *
 * Validates: Requirement 5.3 (extract all URLs and normalize to base domain form)
 */

import type { Citation } from '@/types';

/**
 * Known second-level domain labels that combine with a country/region TLD to
 * form a multi-part public suffix (e.g. "co.uk", "com.au", "gov.in").
 *
 * This is a pragmatic heuristic — not the full Public Suffix List — sufficient
 * for the common cases the extraction pipeline encounters.
 */
const SECOND_LEVEL_DOMAINS = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/**
 * Characters that commonly trail a URL in prose but are not part of it.
 * Stripped from the end of a captured URL (e.g. "visit https://x.com." → drop ".").
 *
 * Note: a trailing ")" is only stripped when the URL does not itself contain a
 * balanced "(" — this preserves URLs like Wikipedia article links that legally
 * contain parentheses.
 */
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', '"', "'", ')', ']', '}', '>']);

// Markdown link: [label](url) — capture the url inside the parentheses.
const MARKDOWN_LINK_RE = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;

// Bare URL with an explicit http(s) protocol.
const BARE_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

// www.-prefixed URL with no protocol (must be preceded by a non-URL boundary so
// we do not double-capture the host of a protocol URL).
const WWW_URL_RE = /(?<![\w/@.])(www\.[^\s<>"'`]+)/gi;

/**
 * Remove trailing punctuation that prose tends to append to a URL.
 *
 * Handles the closing-paren case carefully: a ")" is only treated as trailing
 * punctuation when the URL does not contain a matching "(" (so balanced
 * parentheses inside the path are preserved).
 */
function trimTrailingPunctuation(url: string): string {
    let result = url;

    while (result.length > 0) {
        const last = result[result.length - 1];

        if (!TRAILING_PUNCTUATION.has(last)) {
            break;
        }

        // Preserve a closing paren that balances an opening paren in the URL.
        if (last === ')' && result.includes('(')) {
            break;
        }

        result = result.slice(0, -1);
    }

    return result;
}

/**
 * Extract every URL referenced in `text`.
 *
 * Recognises three forms:
 * - Markdown links: `[text](https://example.com)` → the target URL
 * - Bare URLs: `https://example.com/path`
 * - Protocol-less www. links: `www.example.com`
 *
 * Behaviour:
 * - Trailing prose punctuation is stripped (".", ",", ")", etc.).
 * - Results are de-duplicated while preserving first-seen order.
 * - Returns an empty array for empty/whitespace input or when no URLs exist.
 * - Never throws.
 */
export function extractUrls(text: string): string[] {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const seen = new Set<string>();
    const urls: string[] = [];

    const add = (candidate: string): void => {
        const cleaned = trimTrailingPunctuation(candidate.trim());
        if (cleaned.length === 0 || seen.has(cleaned)) {
            return;
        }
        seen.add(cleaned);
        urls.push(cleaned);
    };

    // 1. Markdown links first — capture the inner URL so the bare-URL pass
    //    de-dupes against the same target (handled by the `seen` set).
    for (const match of Array.from(text.matchAll(MARKDOWN_LINK_RE))) {
        add(match[1]);
    }

    // 2. Bare protocol URLs.
    for (const match of Array.from(text.matchAll(BARE_URL_RE))) {
        add(match[0]);
    }

    // 3. www.-prefixed URLs without a protocol.
    for (const match of Array.from(text.matchAll(WWW_URL_RE))) {
        add(match[1]);
    }

    return urls;
}

/**
 * Normalize a URL (or bare host) to its base registrable domain.
 *
 * Steps:
 * - Strip the protocol (`http://`, `https://`).
 * - Strip a leading `www.`.
 * - Strip any path, query string, and fragment.
 * - Lowercase the result.
 * - Collapse to the registrable domain using a simple multi-part-TLD heuristic:
 *   if the second-to-last label is a known second-level domain (co, com, org,
 *   net, gov, ac, edu) and there are at least three labels, keep the last three
 *   labels (e.g. `blog.example.co.uk` → `example.co.uk`); otherwise keep the
 *   last two (e.g. `www.hubspot.com/blog` → `hubspot.com`).
 *
 * Never throws — malformed input yields a best-effort result or an empty string.
 */
export function normalizeDomain(url: string): string {
    if (!url || typeof url !== 'string') {
        return '';
    }

    let host = url.trim();

    // Prefer the URL constructor for well-formed inputs; fall back to manual
    // parsing for bare hosts / malformed strings.
    try {
        const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(host) ? host : `http://${host}`;
        host = new URL(withProtocol).hostname;
    } catch {
        // Manual fallback: strip protocol, then everything from the first
        // path/query/fragment separator onward.
        host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
        host = host.split('/')[0].split('?')[0].split('#')[0];
        // Drop any userinfo (user@host) and port.
        host = host.split('@').pop() ?? host;
        host = host.split(':')[0];
    }

    host = host.replace(/^www\./i, '').toLowerCase();

    // Strip any lingering port (the URL constructor keeps it out of hostname,
    // but the manual path may not have).
    host = host.split(':')[0];

    if (host.length === 0) {
        return '';
    }

    const labels = host.split('.').filter((label) => label.length > 0);

    if (labels.length <= 2) {
        return labels.join('.');
    }

    const secondToLast = labels[labels.length - 2];
    if (SECOND_LEVEL_DOMAINS.has(secondToLast)) {
        // Multi-part TLD (e.g. example.co.uk) — keep the last three labels.
        return labels.slice(-3).join('.');
    }

    // Standard case — keep the registrable domain (last two labels).
    return labels.slice(-2).join('.');
}

/**
 * Extract URLs from `text` and return them as `Citation` objects.
 *
 * Each citation carries the original URL, its normalized base domain, and a
 * neutral `'other'` classification — final classification (brand / competitor /
 * third-party) happens later in the extraction pipeline (task 3.4).
 *
 * De-duplication is performed on the original URL list; URLs that normalize to
 * an empty domain are skipped. Never throws.
 */
export function extractCitationsFromText(text: string): Citation[] {
    return extractUrls(text)
        .map((url) => ({
            url,
            domain: normalizeDomain(url),
            classification: 'other' as const,
        }))
        .filter((citation) => citation.domain.length > 0);
}
