/**
 * Property 12: Retry Backoff Timing
 *
 * For any retryable failure, the delay before retry attempt K (1-indexed)
 * SHALL be baseDelay * 2^(K-1) milliseconds (exponential backoff).
 *
 * **Validates: Requirements 7.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateBackoffDelay } from '../../src/utils/retry.js';

describe('Feature: cheap-flight-finder, Property 12: Retry Backoff Timing', () => {
  it('calculateBackoffDelay returns baseDelay * 2^(K-1) for any baseDelay and attempt K', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),  // baseDelayMs
        fc.integer({ min: 1, max: 5 }),        // attempt number (K)
        (baseDelayMs, attempt) => {
          const expectedDelay = baseDelayMs * Math.pow(2, attempt - 1);
          const actualDelay = calculateBackoffDelay(attempt, baseDelayMs, 2);

          expect(actualDelay).toBe(expectedDelay);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('backoff delays grow exponentially: delay(K+1) = 2 * delay(K)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),  // baseDelayMs
        fc.integer({ min: 1, max: 4 }),        // attempt K (up to 4 so K+1 <= 5)
        (baseDelayMs, attempt) => {
          const delayK = calculateBackoffDelay(attempt, baseDelayMs, 2);
          const delayKPlus1 = calculateBackoffDelay(attempt + 1, baseDelayMs, 2);

          // The next delay should always be exactly double the current delay
          expect(delayKPlus1).toBe(delayK * 2);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('first attempt delay always equals baseDelayMs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),  // baseDelayMs
        (baseDelayMs) => {
          const delay = calculateBackoffDelay(1, baseDelayMs, 2);
          expect(delay).toBe(baseDelayMs);
        }
      ),
      { numRuns: 200 }
    );
  });
});
