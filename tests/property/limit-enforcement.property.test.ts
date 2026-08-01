/**
 * Property Test: Limit Enforcement (Property 10)
 *
 * Verifies that:
 * For any --limit N, the displayed results SHALL contain at most N flights.
 *
 * **Validates: Requirements 5.4**
 */

import * as fc from 'fast-check';
import { applyLimit } from '../../src/services/search.js';
import type { FlightResult, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary: generates a valid FlightResult object for testing.
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
  durationMinutes: fc.integer({ min: 60, max: 600 }),
  stops: fc.integer({ min: 0, max: 3 }),
  airlines: fc.array(fc.stringMatching(/^[A-Z0-9]{2}$/), { minLength: 1, maxLength: 3 }),
  bookingUrl: fc.constant('https://example.com/book'),
});

describe('Feature: cheap-flight-finder, Property 10: Limit Enforcement', () => {
  it('applyLimit returns at most N flights for any limit N and any input array', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (flights, limit) => {
          const result = applyLimit(flights, limit);

          // The result must contain at most N flights
          expect(result.length).toBeLessThanOrEqual(limit);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('applyLimit returns exactly min(flights.length, limit) flights', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (flights, limit) => {
          const result = applyLimit(flights, limit);

          // The result length should be the minimum of the input length and the limit
          const expectedLength = Math.min(flights.length, limit);
          expect(result.length).toBe(expectedLength);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('applyLimit with limit 0 or negative returns an empty array', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        fc.integer({ min: -100, max: 0 }),
        (flights, limit) => {
          const result = applyLimit(flights, limit);

          // Zero or negative limit should always produce empty results
          expect(result.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('applyLimit preserves the order of input flights (first N elements)', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 1, maxLength: 100 }),
        fc.integer({ min: 1, max: 50 }),
        (flights, limit) => {
          const result = applyLimit(flights, limit);

          // Each element in the result should match the corresponding element in the input
          for (let i = 0; i < result.length; i++) {
            expect(result[i]!.id).toBe(flights[i]!.id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
