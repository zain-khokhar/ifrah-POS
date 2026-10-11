/**
 * src/lib/dateUtils.js
 *
 * Standard human-readable date & time formatting for Ifrah Collection POS.
 * Formats numeric dates like "2026-01-07" into "07 Jan 2026" for effortless readability.
 */

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Format date string into "07 Jan 2026".
 * Handles "YYYY-MM-DD", "YYYY-MM-DDTHH:MM:SSZ", or Date instances.
 *
 * @param {string|Date} val
 * @param {string} [fallback='—']
 * @returns {string} Formatted date e.g. "07 Jan 2026"
 */
export function formatDate(val, fallback = '—') {
  if (!val) return fallback;

  try {
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return fallback;
      const d = String(val.getDate()).padStart(2, '0');
      const m = MONTHS_SHORT[val.getMonth()];
      const y = val.getFullYear();
      return `${d} ${m} ${y}`;
    }

    const s = String(val).trim();
    if (!s) return fallback;

    // Handle YYYY-MM-DD or strings starting with YYYY-MM-DD
    const datePart = s.split('T')[0].split(' ')[0];
    const parts = datePart.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      if (monthIdx >= 0 && monthIdx < 12 && day > 0 && day <= 31) {
        const dStr = String(day).padStart(2, '0');
        const mStr = MONTHS_SHORT[monthIdx];
        return `${dStr} ${mStr} ${year}`;
      }
    }

    // Fallback: parse via Date constructor
    const dObj = new Date(s);
    if (!isNaN(dObj.getTime())) {
      const d = String(dObj.getDate()).padStart(2, '0');
      const m = MONTHS_SHORT[dObj.getMonth()];
      const y = dObj.getFullYear();
      return `${d} ${m} ${y}`;
    }

    return s;
  } catch {
    return fallback;
  }
}

/**
 * Format datetime string into "07 Jan 2026, 04:30 PM".
 *
 * @param {string|Date} val
 * @param {string} [fallback='—']
 * @returns {string} Formatted date time e.g. "07 Jan 2026, 04:30 PM"
 */
export function formatDateTime(val, fallback = '—') {
  if (!val) return fallback;

  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return fallback;

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTHS_SHORT[d.getMonth()];
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day} ${month} ${year}, ${hoursStr}:${minutes} ${ampm}`;
  } catch {
    return fallback;
  }
}

/**
 * Format date for short view e.g. "07 Jan".
 */
export function formatDateShort(val, fallback = '—') {
  if (!val) return fallback;
  const full = formatDate(val, fallback);
  if (full === fallback) return fallback;
  const parts = full.split(' ');
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  return full;
}
