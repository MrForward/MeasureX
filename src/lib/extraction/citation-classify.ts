/**
 * Citation classification.
 *
 * Classifies each extracted citation by the nature of its source domain so the
 * downstream UI (citation sources panel) can group citations as owned, owned by
 * a competitor, or one of several third-party categories.
 *
 * Classification is resolved in a fixed priority order:
 *   1. brand        — the citation's registrable domain matches the brand domain
 *   2. competitor   — it matches a configured competitor's domain
 *   3. review_site  — a known software-review / analyst site (G2, Capterra, ...)
 *   4. publication  — a known tech / business publication (TechCrunch, Forbes, ...)
 *   5. forum        — a known community / forum (Reddit, Quora, ...)
 *   6. other        — anything else (generic third-party)
 *
 * All domain comparisons run through `normalizeDomain` so that subdomains
 * (e.g. `blog.hubspot.com`) collapse to their registrable domain and match
 * case-insensitively. Every function here is pure and deterministic.
 *
 * NOTE: the review-site / publication / forum domain lists are currently
 * module-level constants for easy review and extension. They are good
 * candidates to move into the `platform_config` table later so they can be
 * tuned without a code change.
 *
 * Validates: Requirement 5.4 (classify each citation as brand, competitor, or third-party)
 * Validates: Requirement 6.7 design note (owned domain, competitor, review site, publication, forum, other)
 */

import type { Citation, CitationClass } from '@/types';
import { normalizeDomain } from './url-extract';

/**
 * A competitor's registrable domain paired with the competitor entity id it
 * belongs to. Mirrors the `{ entityId, domain }` shape produced from the
 * configured `MatchableEntity` competitors.
 */
export interface CompetitorDomain {
    entityId: string;
    domain: string;
}

/**
 * Known software-review and analyst sites. A citation whose registrable domain
 * matches one of these is classified as `'review_site'`.
 */
export const REVIEW_SITE_DOMAINS: ReadonlySet<string> = new Set([
    'g2.com',
    'capterra.com',
    'trustpilot.com',
    'trustradius.com',
    'getapp.com',
    'softwareadvice.com',
    'gartner.com',
    'forrester.com',
]);

/**
 * Known tech / business publications. A citation whose registrable domain
 * matches one of these is classified as `'publication'`.
 */
export const PUBLICATION_DOMAINS: ReadonlySet<string> = new Set([
    'techcrunch.com',
    'forbes.com',
    'businessinsider.com',
    'theverge.com',
    'wired.com',
    'cnet.com',
    'zdnet.com',
    'venturebeat.com',
]);

/**
 * Known community / forum sites. A citation whose registrable domain matches
 * one of these is classified as `'forum'`.
 */
export const FORUM_DOMAINS: ReadonlySet<string> = new Set([
    'reddit.com',
    'quora.com',
    'stackoverflow.com',
    'news.ycombinator.com',
    'ycombinator.com',
]);

/**
 * Classify a single citation domain against the brand and competitor domains.
 *
 * `domain` may be any URL or bare host — it is normalized to its registrable
 * domain before comparison, so subdomains and casing differences are handled.
 * Returns `'other'` for empty / malformed input that normalizes to nothing.
 */
export function classifyCitation(
    domain: string,
    brandDomain: string,
    competitorDomains: CompetitorDomain[],
): CitationClass {
    const normalized = normalizeDomain(domain);

    // Malformed / empty input — treat as a generic third-party source.
    if (normalized.length === 0) {
        return 'other';
    }

    // 1. Brand (owned) domain takes priority over every other category.
    const normalizedBrand = normalizeDomain(brandDomain);
    if (normalizedBrand.length > 0 && normalized === normalizedBrand) {
        return 'brand';
    }

    // 2. Competitor domains.
    for (const competitor of competitorDomains) {
        const normalizedCompetitor = normalizeDomain(competitor.domain);
        if (normalizedCompetitor.length > 0 && normalized === normalizedCompetitor) {
            return 'competitor';
        }
    }

    // 3-5. Known third-party categories.
    if (REVIEW_SITE_DOMAINS.has(normalized)) {
        return 'review_site';
    }
    if (PUBLICATION_DOMAINS.has(normalized)) {
        return 'publication';
    }
    if (FORUM_DOMAINS.has(normalized)) {
        return 'forum';
    }

    // 6. Anything else.
    return 'other';
}

/**
 * Classify every citation in `citations`, setting each citation's
 * `classification` field according to {@link classifyCitation}.
 *
 * Mutates the citations in place (their `classification` field) and returns the
 * same array for convenience. Each citation is classified by its `domain`,
 * which is normalized internally so pre-normalized domains are handled too.
 */
export function classifyCitations(
    citations: Citation[],
    brandDomain: string,
    competitorDomains: CompetitorDomain[],
): Citation[] {
    for (const citation of citations) {
        citation.classification = classifyCitation(
            citation.domain,
            brandDomain,
            competitorDomains,
        );
    }
    return citations;
}
