/**
 * Citation classification (PRD §F5c).
 *
 * Classifies each extracted citation by comparing its normalized domain against
 * the brand domain, competitor domains, and known third-party domain lists.
 *
 * Classes (PRD §F5c), in priority order:
 *   1. owned        — domain matches the brand domain
 *   2. competitor   — domain matches a competitor domain (records competitorName)
 *   3. review_site  — g2.com, capterra.com, trustpilot.com, gartner.com
 *   4. publication  — techcrunch.com, forbes.com, wired.com, hbr.org
 *   5. forum        — reddit.com, quora.com, stackoverflow.com
 *   6. other        — everything else
 *
 * Pure and deterministic.
 */

import type {
    CitationClassification,
    CitationResult,
    ExtractionEntity,
} from './types';
import { normalizeDomain } from './url-extract';

/** Known software-review / analyst sites (PRD §F5c). */
export const REVIEW_SITE_DOMAINS: ReadonlySet<string> = new Set([
    'g2.com',
    'capterra.com',
    'trustpilot.com',
    'gartner.com',
]);

/** Known tech / business publications (PRD §F5c). */
export const PUBLICATION_DOMAINS: ReadonlySet<string> = new Set([
    'techcrunch.com',
    'forbes.com',
    'wired.com',
    'hbr.org',
]);

/** Known community / forum sites (PRD §F5c). */
export const FORUM_DOMAINS: ReadonlySet<string> = new Set([
    'reddit.com',
    'quora.com',
    'stackoverflow.com',
]);

export interface ClassificationOutcome {
    classification: CitationClassification;
    /** Present only when classification === 'competitor'. */
    competitorName?: string;
}

/**
 * Classify a single citation domain against brand + competitor domains.
 *
 * `domain` may be a full URL or bare host — it is normalized before comparison.
 * When it matches a competitor, the competitor's name is returned alongside.
 */
export function classifyCitation(
    domain: string,
    brandDomain: string,
    competitors: ExtractionEntity[],
): ClassificationOutcome {
    const normalized = normalizeDomain(domain);
    if (normalized.length === 0) {
        return { classification: 'other' };
    }

    // 1. Owned (brand) domain.
    const normalizedBrand = normalizeDomain(brandDomain);
    if (normalizedBrand.length > 0 && normalized === normalizedBrand) {
        return { classification: 'owned' };
    }

    // 2. Competitor domains.
    for (const competitor of competitors) {
        const normalizedCompetitor = normalizeDomain(competitor.domain);
        if (normalizedCompetitor.length > 0 && normalized === normalizedCompetitor) {
            return { classification: 'competitor', competitorName: competitor.name };
        }
    }

    // 3-5. Known third-party categories.
    if (REVIEW_SITE_DOMAINS.has(normalized)) {
        return { classification: 'review_site' };
    }
    if (PUBLICATION_DOMAINS.has(normalized)) {
        return { classification: 'publication' };
    }
    if (FORUM_DOMAINS.has(normalized)) {
        return { classification: 'forum' };
    }

    // 6. Anything else.
    return { classification: 'other' };
}

/**
 * Classify a list of raw URLs into {@link CitationResult}s. URLs that normalize
 * to an empty domain are dropped. De-duplicates by url.
 */
export function classifyCitations(
    urls: string[],
    brandDomain: string,
    competitors: ExtractionEntity[],
): CitationResult[] {
    const seen = new Set<string>();
    const results: CitationResult[] = [];

    for (const url of urls) {
        if (seen.has(url)) {
            continue;
        }
        seen.add(url);

        const domain = normalizeDomain(url);
        if (domain.length === 0) {
            continue;
        }

        const { classification, competitorName } = classifyCitation(
            domain,
            brandDomain,
            competitors,
        );

        const citation: CitationResult = { url, domain, classification };
        if (competitorName !== undefined) {
            citation.competitorName = competitorName;
        }
        results.push(citation);
    }

    return results;
}
