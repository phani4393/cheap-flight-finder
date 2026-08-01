/**
 * Property 5: Max Duration Filter
 *
 * For any positive integer maxDuration and any list of FlightResult objects,
 * filter SHALL return only flights with duration <= maxDuration.
 *
 * **Validates: Requirements 8.1**
 */

import * as fc from 'fast-check';
import { filterByMaxDuration } from '../../src/services/search.js';
import type { FlightResult, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary generator for a FlightResult with random durationMinutes.
 * Duration ranges from 30 to 1500 minutes to cover short hops to ultra-long-hauls.
 */
const flightResultArb: fc.Arbitrary<FlightResult> = fc.record({
  id: fc.uuid(),
  price: fc.integer({ min: 1, max: 500 }),
  origin: fc.constantFrom<OriginAirport>('ORD', 'MDW'),
  destination: fc.stringMatching(/^[A-Z]{3}$/),
  destinationCity: fc.string({ minLength: 2, maxLength: 30 }),
  departureDate: fc.date({
    min: new Date(2025, 0, 1),
    max: new Date(2026, 0, 1),
  }),
  departureTime: fc.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
  arrivalTime: fc.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: fc.integer({ min: 30, max: 1500 }),
  stops: fc.integer({ min: 0, max: 3 }),
  airlines: fc.array(fc.stringMatching(/^[A-Z0-9]{2}$/), { minLength: 1, maxLength: 3 }),
  bookingUrl: fc.constant('https://example.com/book'),
});

/**
 * Arbitrary generator for maxDuration threshold.
 * Covers realistic range of duration limits (30 to 1500 minutes).
 */
const maxDurationArb = fc.integer({ min: 30, max: 1500 });

describe('Feature: google-flights-scraper, Property 5: Max Duration Filter', () => {
  it('all filtered results have durationMinutes <= maxDuration', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        maxDurationArb,
        (flights, maxDuration) => {
          const filtered = filterByMaxDuration(flights, maxDuration);

          // Every flight in the result must have duration <= maxDuration
          for (const flight of filtered) {
            expect(flight.durationMinutes).toBeLessThanOrEqual(maxDuration);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('all excluded flights have durationMinutes > maxDuration', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        maxDurationArb,
        (flights, maxDuration) => {
          const filtered = filterByMaxDuration(flights, maxDuration);
          const filteredIds = new Set(filtered.map((f) => f.id));

          // Every flight NOT in the result must have duration > maxDuration
          const excluded = flights.filter((f) => !filteredIds.has(f.id));
          for (const flight of excluded) {
            expect(flight.durationMinutes).toBeGreaterThan(maxDuration);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('filtered result count equals count of flights with duration <= maxDuration', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        maxDurationArb,
        (flights, maxDuration) => {
          const filtered = filterByMaxDuration(flights, maxDuration);

          const expectedCount = flights.filter((f) => f.durationMinutes <= maxDuration).length;
          expect(filtered).toHaveLength(expectedCount);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('filtered result is a subset of the original flights (no invented results)', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        maxDurationArb,
        (flights, maxDuration) => {
          const filtered = filterByMaxDuration(flights, maxDuration);

          const originalIds = new Set(flights.map((f) => f.id));
          for (const flight of filtered) {
            expect(originalIds.has(flight.id)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
