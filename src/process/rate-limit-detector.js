// Detects Anthropic usage/rate-limit messages in Claude process output and
// extracts the reset timestamp so Cockpit can pause and resume automatically.

// Indicator phrases (case-insensitive) that signal a rate-limit condition.
const RATE_LIMIT_PHRASES = [
  'claude ai usage limit reached',
  'usage limit reached',
  'rate limit exceeded',
  'api usage limit',
];

// Timestamp extraction patterns tried in priority order.
const ISO_RE = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/;
const EPOCH_RE = /reset[^\d]*(\d{10,13})/i;

/**
 * Scan Claude process stdout/stderr output for a rate-limit message.
 * Returns { isRateLimit: boolean, resetAt: Date|null }.
 * resetAt is null when the message is detected but no timestamp can be parsed —
 * callers should apply the fallback wait period in that case.
 */
export function detectRateLimit(output) {
  if (!output) return { isRateLimit: false, resetAt: null };

  const lower = output.toLowerCase();
  const isRateLimit = RATE_LIMIT_PHRASES.some(p => lower.includes(p));
  if (!isRateLimit) return { isRateLimit: false, resetAt: null };

  // 1. Try ISO 8601 (highest precision, most reliable)
  const isoMatch = output.match(ISO_RE);
  if (isoMatch) {
    const d = new Date(isoMatch[1]);
    if (!isNaN(d.getTime())) return { isRateLimit: true, resetAt: d };
  }

  // 2. Try Unix epoch after "reset" keyword (10-digit seconds or 13-digit ms)
  const epochMatch = output.match(EPOCH_RE);
  if (epochMatch) {
    const raw = epochMatch[1];
    const epoch = parseInt(raw, 10);
    const d = new Date(raw.length >= 13 ? epoch : epoch * 1000);
    if (!isNaN(d.getTime())) return { isRateLimit: true, resetAt: d };
  }

  // Rate limit confirmed but reset time not parseable — fallback applies.
  return { isRateLimit: true, resetAt: null };
}

/**
 * Format a human-readable message for the GitHub issue comment.
 * @param {Date|null} resetAt  - parsed reset timestamp, or null if unknown
 * @param {number}    fallbackMinutes - fallback wait in minutes (default 60)
 */
export function formatResetMessage(resetAt, fallbackMinutes = 60) {
  if (!resetAt) {
    return `Rate limit hit — reset time unknown. Waiting ${fallbackMinutes} minutes (fallback). Pipeline will resume automatically.`;
  }

  const now = new Date();
  const diffMs = Math.max(0, resetAt.getTime() - now.getTime());
  const diffMins = Math.round(diffMs / 60000);

  const h = resetAt.getUTCHours();
  const m = resetAt.getUTCMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const timeStr = `${h12}:${m} ${ampm} UTC`;

  return `Rate limit hit — resets at ${timeStr} (in approximately ${diffMins} minutes). Pipeline will resume automatically.`;
}
