/**
 * Initials helpers — shared between WorkspaceSwitcher and UserMenu so we
 * don't repeat the small "first 1-2 letters" logic.
 */

/**
 * Returns up to two uppercase initials for a display name.
 * - Two-or-more words: first letter of first two words ("Acme Corp" -> "AC")
 * - One word ≥ 2 chars: first two letters ("Solo" -> "SO")
 * - One word, one char: that character uppercased ("X" -> "X")
 * - Empty / whitespace-only: '?'
 */
export function initialsFromName(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return '?';

    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
        return (words[0]![0]! + words[1]![0]!).toUpperCase();
    }
    return words[0]!.slice(0, 2).toUpperCase();
}

/**
 * Returns up to two uppercase initials for a user.
 * Prefers the user's name; falls back to the local-part of the email; final
 * fallback is '?'.
 */
export function initialsFromUser(
    name: string | null | undefined,
    email: string | null | undefined,
): string {
    const fromName = initialsFromName(name);
    if (fromName !== '?') return fromName;

    const local = (email ?? '').split('@')[0] ?? '';
    return initialsFromName(local);
}
