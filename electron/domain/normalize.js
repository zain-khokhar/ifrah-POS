/**
 * electron/domain/normalize.js
 *
 * String normalization used by learning-dropdown dedup checks.
 * Case-, space- and punctuation-insensitive matching so that:
 *   "Lahore", "lahore", "  LAHORE  ", "lah.ore" all deduplicate correctly.
 *
 * Also handles Urdu letter variants:
 *   Arabic Yeh (ي) → Urdu Ye (ی)
 *   Arabic Kaf (ك) → Urdu Kaf (ک)
 */

function normalizeName(value) {
  if (!value) return '';
  return String(value)
    .trim()
    // Urdu/Arabic common variants
    .replace(/\u064a/g, '\u06cc')  // Arabic Yeh → Urdu Ye
    .replace(/\u0643/g, '\u06a9')  // Arabic Kaf → Urdu Kaf
    .replace(/\u0629/g, '\u06c1')  // Ta Marbuta → He
    // Lowercase and strip punctuation + extra spaces
    .toLowerCase()
    .replace(/[\s\-_.,'"`''""،؛]+/g, '');
}

module.exports = { normalizeName };
