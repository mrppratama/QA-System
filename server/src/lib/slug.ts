// Combining diacritical marks block (U+0300–U+036F), built from code points
// rather than a literal regex range to avoid any source-encoding ambiguity.
const DIACRITICS_REGEX = new RegExp(`[\\u0300-\\u036f]`, 'g');

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
}
