/**
 * Monospace terminal display-width utilities.
 *
 * In monospace terminals, certain characters occupy 2 display columns
 * instead of 1. This affects cursor positioning during redraw.
 *
 * Width 2: CJK ideographs, Hangul syllables, emoji, fullwidth forms
 * Width 1: Latin, digits, punctuation, symbols (default)
 */

/**
 * Return the terminal display width (1 or 2) of a single grapheme.
 *
 * Uses Unicode character property heuristics:
 * - East Asian Wide / Fullwidth characters → 2 columns
 * - Emoji presentation characters → 2 columns
 * - Everything else → 1 column
 */
export function charWidth(grapheme: string): number {
  if (!grapheme) return 0;

  // Safe default: use the first code point for width determination.
  // ZWJ sequences (e.g. family emoji) still behave as width-2 emoji in most terminals.
  const cp = grapheme.codePointAt(0);
  if (cp === undefined) return 1;

  // CJK Unified Ideographs
  if (cp >= 0x4e00 && cp <= 0x9fff) return 2;
  // CJK Unified Ideographs Extension A
  if (cp >= 0x3400 && cp <= 0x4dbf) return 2;
  // CJK Compatibility Ideographs
  if (cp >= 0xf900 && cp <= 0xfaff) return 2;
  // Hangul Syllables
  if (cp >= 0xac00 && cp <= 0xd7af) return 2;
  // CJK Radicals Supplement / Kangxi Radicals
  if (cp >= 0x2e80 && cp <= 0x2fdf) return 2;
  // CJK Symbols and Punctuation (some are wide)
  if (cp >= 0x3000 && cp <= 0x303f) return 2;
  // Fullwidth Forms
  if (cp >= 0xff01 && cp <= 0xff60) return 2;
  // Fullwidth Latin
  if (cp >= 0xff01 && cp <= 0xff60) return 2;
  // Halfwidth and Fullwidth Forms (continued)
  if (cp >= 0xffe0 && cp <= 0xffee) return 2;

  // Emoji ranges (simplified but covers the vast majority)
  if (cp >= 0x1f300 && cp <= 0x1f9ff) return 2; // Misc Symbols, Emoticons, etc.
  if (cp >= 0x1fa00 && cp <= 0x1fa6f) return 2;
  if (cp >= 0x1fa70 && cp <= 0x1faff) return 2;

  return 1;
}

/**
 * Compute the total display width of a string by summing each
 * grapheme cluster's display width.
 *
 * @param clusters - Array of grapheme cluster strings
 * @param upTo - Optional: only sum widths up to (but not including) this cluster index
 */
export function displayWidth(clusters: string[], upTo?: number): number {
  const end = upTo !== undefined ? Math.min(upTo, clusters.length) : clusters.length;
  let width = 0;
  for (let i = 0; i < end; i++) {
    width += charWidth(clusters[i]);
  }
  return width;
}
