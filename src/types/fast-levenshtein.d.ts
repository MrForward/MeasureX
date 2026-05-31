/**
 * Ambient type declarations for `fast-levenshtein` (v3.0.0).
 *
 * The package ships as CommonJS (`module.exports = Levenshtein`) with no
 * bundled `.d.ts` and there is no `@types/fast-levenshtein` installed. This
 * minimal declaration describes the single `get` method we rely on so the
 * library can be consumed from TypeScript under strict mode.
 */
declare module 'fast-levenshtein' {
    interface LevenshteinOptions {
        /** Use `Intl.Collator` for locale-sensitive comparison. */
        useCollator?: boolean;
    }

    interface Levenshtein {
        /**
         * Compute the Levenshtein (edit) distance between two strings.
         * Returns an integer >= 0.
         */
        get(str1: string, str2: string, options?: LevenshteinOptions): number;
    }

    const levenshtein: Levenshtein;
    export default levenshtein;
}
