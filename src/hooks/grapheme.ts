/**
 * Grapheme cluster segmentation utilities using Intl.Segmenter.
 *
 * Cursor positions are measured in grapheme clusters, not code points or bytes.
 * This correctly handles:
 *   - Multi-byte CJK characters (e.g., 你好 → 2 grapheme clusters)
 *   - Emoji with ZWJ sequences (e.g., 👨‍👩‍👧‍👦 → 1 grapheme cluster)
 *   - Combining characters (e.g., é as e + combining accent → 1 cluster)
 */

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

/** Return the total number of grapheme clusters in the given text. */
export function graphemeCount(text: string): number {
  if (!text) return 0;
  let count = 0;
  for (const _ of segmenter.segment(text)) {
    count++;
  }
  return count;
}

/** Return the grapheme cluster at the given zero-based cluster index, or undefined if out of bounds. */
export function graphemeAt(text: string, clusterIndex: number): string | undefined {
  if (!text || clusterIndex < 0) return undefined;
  let i = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (i === clusterIndex) return segment;
    i++;
  }
  return undefined;
}

/**
 * Convert a grapheme-cluster index to a string (code-unit) offset.
 *
 * For example, "你好" has grapheme index 1 → string offset 1 (not 2 or 3),
 * because each CJK character is one JS code point in UTF-16.
 * For emoji ZWJ sequences the offset may jump by more than one code unit.
 */
export function stringOffset(text: string, clusterIndex: number): number {
  if (!text || clusterIndex <= 0) return 0;
  let i = 0;
  let offset = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (i === clusterIndex) return offset;
    offset += segment.length;
    i++;
  }
  return text.length;
}

/**
 * Split text into an array of grapheme clusters.
 * Useful for iteration and debugging.
 */
export function graphemeClusters(text: string): string[] {
  const clusters: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    clusters.push(segment);
  }
  return clusters;
}
