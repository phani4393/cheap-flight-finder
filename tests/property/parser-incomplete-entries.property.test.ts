/**
 * Property Test: Parser Skips Incomplete Entries (Property 3)
 *
 * For any array of flight entries with some missing required fields,
 * parser SHALL return only complete entries.
 *
 * Strategy: The parser's parse() method returns empty array for unrecognizable HTML.
 * We verify the CONTRACT:
 * 1. If parser returns any results, none have missing required fields
 * 2. Calling parse with empty string returns empty array
 * 3. Calling parse with garbage HTML returns empty array (no crash)
 * 4. Calling parse with HTML that has no AF_initDataCallback returns empty array
 *
 * Generate random HTML strings (including some with AF_initDataCallback-like patterns
 * but malformed data). Verify the parser NEVER crashes and always returns either
 * empty array or valid ParsedFlight objects.
 *
 * **Validates: Requirements 3.4**
 */

import * as fc from 'fast-check';
import { FlightResponseParser } from '../../src/adapters/google-flights/response-parser.js';
import type { ParsedFlight } from '../../src/adapters/google-flights/response-parser.js';

const parser = new FlightResponseParser();

/**
 * Validates that a ParsedFlight has all required fields properly populated.
 */
function isCompleteFlight(flight: ParsedFlight): boolean {
  return (
    typeof flight.price === 'number' &&
    flight.price > 0 &&
    typeof flight.origin === 'string' &&
    flight.origin.length > 0 &&
    typeof flight.destination === 'string' &&
    flight.destination.length > 0 &&
    typeof flight.departureTime === 'string' &&
    flight.departureTime.length > 0 &&
    typeof flight.arrivalTime === 'string' &&
    flight.arrivalTime.length > 0 &&
    typeof flight.durationMinutes === 'number' &&
    Array.isArray(flight.airlines) &&
    flight.airlines.length > 0 &&
    Array.isArray(flight.segments)
  );
}

/**
 * Arbitrary for generating random garbage strings of varying lengths.
 */
const garbageStringArb = fc.string({ minLength: 0, maxLength: 500 });

/**
 * Arbitrary for generating random HTML-like content without AF_initDataCallback.
 */
const htmlWithoutCallbackArb = fc
  .record({
    title: fc.string({ minLength: 1, maxLength: 50 }),
    body: fc.string({ minLength: 0, maxLength: 200 }),
    scripts: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 0, maxLength: 5 }),
  })
  .map(({ title, body, scripts }) => {
    const scriptTags = scripts.map((s) => `<script>${s}</script>`).join('\n');
    return `<!DOCTYPE html><html><head><title>${title}</title></head><body><p>${body}</p>${scriptTags}</body></html>`;
  });

/**
 * Arbitrary for generating HTML with AF_initDataCallback patterns containing malformed data.
 * These have the callback signature but invalid/incomplete data inside.
 */
const malformedCallbackArb = fc
  .record({
    key: fc.string({ minLength: 1, maxLength: 20 }),
    malformedData: fc.oneof(
      // Not a valid JSON array
      fc.string({ minLength: 1, maxLength: 100 }),
      // Empty array
      fc.constant('[]'),
      // Array with non-array elements (no flight structures)
      fc.constant('[1, 2, 3, "hello", null]'),
      // Nested arrays but missing required flight fields (no price, no airport codes)
      fc.constant('[[[null, null], [null], "incomplete"]]'),
      // Arrays with numbers but not matching flight structure
      fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 1, maxLength: 10 }).map(
        (arr) => JSON.stringify([arr])
      ),
      // Deeply nested but no valid segments or price
      fc.constant('[[["not_iata", "also_not"], [2020, 13, 32, 25, 61]]]'),
    ),
  })
  .map(({ key, malformedData }) => {
    return `<script>AF_initDataCallback({key: '${key}', data:${malformedData}})</script>`;
  });

/**
 * Arbitrary for generating HTML with multiple AF_initDataCallback blocks,
 * some with malformed data and some with incomplete flight structures.
 */
const htmlWithMalformedCallbacksArb = fc
  .array(malformedCallbackArb, { minLength: 1, maxLength: 5 })
  .map((callbacks) => {
    return `<!DOCTYPE html><html><body>${callbacks.join('\n')}</body></html>`;
  });

describe('Feature: google-flights-scraper, Property 3: Parser Skips Incomplete Entries', () => {
  it('parse with empty string returns empty array', () => {
    const result = parser.parse('');
    expect(result).toEqual([]);
  });

  it('parse with garbage strings never crashes and returns empty array', () => {
    fc.assert(
      fc.property(garbageStringArb, (garbage) => {
        const result = parser.parse(garbage);

        // Must always return an array
        expect(Array.isArray(result)).toBe(true);

        // For garbage input, result should be empty
        expect(result).toHaveLength(0);
      }),
      { numRuns: 200 }
    );
  });

  it('parse with HTML lacking AF_initDataCallback returns empty array', () => {
    fc.assert(
      fc.property(htmlWithoutCallbackArb, (html) => {
        const result = parser.parse(html);

        // Must always return an array
        expect(Array.isArray(result)).toBe(true);

        // No callbacks means no flight data
        expect(result).toHaveLength(0);
      }),
      { numRuns: 200 }
    );
  });

  it('parse with malformed AF_initDataCallback data never crashes and returns only valid flights', () => {
    fc.assert(
      fc.property(htmlWithMalformedCallbacksArb, (html) => {
        const result = parser.parse(html);

        // Must always return an array (never throws)
        expect(Array.isArray(result)).toBe(true);

        // If any results are returned, every one must be complete
        for (const flight of result) {
          expect(isCompleteFlight(flight)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('if parser returns any results, none have undefined price, empty origin, or empty departureTime', () => {
    fc.assert(
      fc.property(
        fc.oneof(garbageStringArb, htmlWithoutCallbackArb, htmlWithMalformedCallbacksArb),
        (input) => {
          const result = parser.parse(input);

          // Must always return an array
          expect(Array.isArray(result)).toBe(true);

          // Every returned flight must have required fields populated
          for (const flight of result) {
            expect(flight.price).toBeDefined();
            expect(flight.price).toBeGreaterThan(0);
            expect(flight.origin).toBeDefined();
            expect(flight.origin.length).toBeGreaterThan(0);
            expect(flight.destination).toBeDefined();
            expect(flight.destination.length).toBeGreaterThan(0);
            expect(flight.departureTime).toBeDefined();
            expect(flight.departureTime.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('parse never throws regardless of input content', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Completely random bytes
          fc.string({ minLength: 0, maxLength: 1000 }),
          // Strings with special characters
          fc.unicodeString({ minLength: 0, maxLength: 500 }),
          // Strings containing partial AF_initDataCallback patterns
          fc.string({ minLength: 0, maxLength: 200 }).map(
            (s) => `AF_initDataCallback(${s})`
          ),
          // Strings with nested brackets and braces
          fc.string({ minLength: 0, maxLength: 300 }).map(
            (s) => `AF_initDataCallback({data:[${s}]})`
          ),
        ),
        (input) => {
          // The parser must NEVER throw — it should always return an array
          let result: ParsedFlight[];
          expect(() => {
            result = parser.parse(input);
          }).not.toThrow();

          result = parser.parse(input);
          expect(Array.isArray(result)).toBe(true);

          // Any returned results must be valid
          for (const flight of result) {
            expect(isCompleteFlight(flight)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
