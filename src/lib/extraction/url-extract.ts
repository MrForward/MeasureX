/**
 * URL extraction and domain normalization (PRD §F5c).
 *
 * ChatGPT embeds links inline in plain text (unlike Perplexity, which returns a
 * native citations array), so this module recovers URLs from response text via
 * the PRD regex, then normalizes each to a comparable base domain.
 *
 *   Regex (PRD §F5c):  https?://[^\s\)\]\"\'<>]+
 *   Cleanup:           strip trailing punctuation ( . , ) etc. )
 *   Normalize domain:  lowercase, strip protocol, strip `www.`, strip path,
 *                      strip trailing slash.
 *
 * Pure, deterministic, never throws.
 */

/** PRD §F5c URL regex (global). */
const URL_RE = /https?:\/\/[^\s)\]"'<>]+/gi;

/** Trailing prose punctuation to strip from a captured URL. */
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '"', "'"]);

/** Remove trailing punctuation that prose tends to append to a URL. */
function trimTrailingPunctuation(url: string): string {
    let result = url;
    while (result.length > 0 && TRAILING_PUNCTUATION.has(result[result.length - 1])) {
        result = result.slice(0, -1);
    }
    return result;
}

/**
 * Extract every http(s) URL from `text` (PRD regex), cleaned of trailing
 * punctuation and de-duplicated in first-seen order. Returns `[]` for empty
 * input or when no URLs exist.
 */
export function extractUrls(text: string): string[] {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const seen = new Set<string>();
    const urls: string[] = [];

    for (const match of text.matchAll(URL_RE)) {
        const cleaned = trimTrailingPunctuation(match[0].trim());
        if (cleaned.length > 0 && !seen.has(cleaned)) {
            seen.add(cleaned);
            urls.push(cleaned);
        }
    }

    return urls;
}

/**
 * Normalize a URL (or bare host) to a comparable domain (PRD §F5c):
 * lowercase, strip protocol, strip `www.`, strip path / query / fragment, strip
 * trailing slash. Never throws — malformed input yields a best-effort result.
 */
export function normalizeDomain(url: string): string {
    if (!url || typeof url !== 'string') {
        return '';
    }

    let host = url.trim();
    host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); // strip protocol
    host = host.split('/')[0].split('?')[0].split('#')[0]; // strip path/query/fragment
    host = host.split('@').pop() ?? host; // strip userinfo
    host = host.split(':')[0]; // strip port
    host = host.replace(/^www\./i, '').toLowerCase();
    host = host.replace(/\/+$/, ''); // strip trailing slash (defensive)

    return host;
}
