import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectRateLimit, formatResetMessage } from '../../src/process/rate-limit-detector.js';

// ── detectRateLimit ────────────────────────────────────────────────────────

describe('detectRateLimit — not a rate limit', () => {
  test('returns isRateLimit:false for normal error output', () => {
    const result = detectRateLimit('Error: command not found');
    assert.equal(result.isRateLimit, false);
    assert.equal(result.resetAt, null);
  });

  test('returns isRateLimit:false for empty string', () => {
    const result = detectRateLimit('');
    assert.equal(result.isRateLimit, false);
  });

  test('returns isRateLimit:false for null/undefined', () => {
    assert.equal(detectRateLimit(null).isRateLimit, false);
    assert.equal(detectRateLimit(undefined).isRateLimit, false);
  });
});

describe('detectRateLimit — detection without timestamp', () => {
  test('detects "Claude AI usage limit reached" (no timestamp)', () => {
    const result = detectRateLimit('Claude AI usage limit reached');
    assert.equal(result.isRateLimit, true);
    assert.equal(result.resetAt, null);
  });

  test('detects "usage limit reached" phrase', () => {
    const result = detectRateLimit('Your usage limit reached for this billing period');
    assert.equal(result.isRateLimit, true);
  });

  test('detects "rate limit exceeded" phrase', () => {
    const result = detectRateLimit('Error: rate limit exceeded');
    assert.equal(result.isRateLimit, true);
  });

  test('detects "api usage limit" phrase', () => {
    const result = detectRateLimit('API usage limit hit');
    assert.equal(result.isRateLimit, true);
  });

  test('detection is case-insensitive', () => {
    const result = detectRateLimit('RATE LIMIT EXCEEDED - try again later');
    assert.equal(result.isRateLimit, true);
  });
});

describe('detectRateLimit — ISO 8601 timestamp extraction', () => {
  test('extracts ISO timestamp from rate-limit message', () => {
    const resetIso = '2026-03-24T14:30:00.000Z';
    const result = detectRateLimit(`Claude AI usage limit reached. Resets at ${resetIso}`);
    assert.equal(result.isRateLimit, true);
    assert.ok(result.resetAt instanceof Date);
    assert.equal(result.resetAt.toISOString(), new Date(resetIso).toISOString());
  });

  test('extracts ISO timestamp without milliseconds', () => {
    const result = detectRateLimit('usage limit reached... 2026-03-24T15:00:00Z');
    assert.equal(result.isRateLimit, true);
    assert.ok(result.resetAt instanceof Date);
    assert.equal(result.resetAt.getUTCHours(), 15);
  });
});

describe('detectRateLimit — Unix epoch timestamp extraction', () => {
  test('extracts 10-digit Unix epoch (seconds)', () => {
    const resetDate = new Date('2026-03-24T14:30:00Z');
    const epoch = Math.floor(resetDate.getTime() / 1000); // 10 digits
    const result = detectRateLimit(`rate limit exceeded, reset: ${epoch}`);
    assert.equal(result.isRateLimit, true);
    assert.ok(result.resetAt instanceof Date);
    assert.equal(result.resetAt.getTime(), resetDate.getTime());
  });

  test('extracts 13-digit Unix epoch (milliseconds)', () => {
    const resetDate = new Date('2026-03-24T14:30:00Z');
    const epochMs = resetDate.getTime(); // 13 digits
    const result = detectRateLimit(`usage limit reached reset${epochMs}end`);
    assert.equal(result.isRateLimit, true);
    assert.ok(result.resetAt instanceof Date);
    assert.equal(result.resetAt.getTime(), epochMs);
  });
});

describe('detectRateLimit — time-string fallback (no timestamp extracted)', () => {
  test('returns isRateLimit:true, resetAt:null when only phrase matches (no parseable timestamp)', () => {
    const result = detectRateLimit('usage limit reached, resets at 3:00 PM UTC');
    assert.equal(result.isRateLimit, true);
    // Time-only strings without date fall back to null (caller uses fallback wait)
    // resetAt may be null (acceptable) — we don't require successful time parse
    assert.ok(result.resetAt === null || result.resetAt instanceof Date);
  });
});

// ── formatResetMessage ─────────────────────────────────────────────────────

describe('formatResetMessage — with known resetAt', () => {
  test('includes human-readable time and approximate minutes', () => {
    const future = new Date(Date.now() + 47 * 60 * 1000); // 47 minutes from now
    const msg = formatResetMessage(future);
    assert.ok(msg.includes('UTC'), `Expected UTC in: ${msg}`);
    assert.ok(msg.includes('approximately'), `Expected "approximately" in: ${msg}`);
    assert.ok(msg.includes('Pipeline will resume automatically'), `Missing resume text in: ${msg}`);
  });

  test('shows 0 minutes when reset is in the past', () => {
    const past = new Date(Date.now() - 5000);
    const msg = formatResetMessage(past);
    assert.ok(msg.includes('0 minutes'), `Expected 0 minutes in: ${msg}`);
  });
});

describe('formatResetMessage — with null resetAt (fallback)', () => {
  test('mentions fallback wait period (default 60 minutes)', () => {
    const msg = formatResetMessage(null);
    assert.ok(msg.includes('60 minutes'), `Expected 60 minutes in: ${msg}`);
    assert.ok(msg.includes('fallback'), `Expected "fallback" in: ${msg}`);
    assert.ok(msg.includes('Pipeline will resume automatically'), `Missing resume text in: ${msg}`);
  });

  test('respects custom fallbackMinutes', () => {
    const msg = formatResetMessage(null, 30);
    assert.ok(msg.includes('30 minutes'), `Expected 30 minutes in: ${msg}`);
  });
});
