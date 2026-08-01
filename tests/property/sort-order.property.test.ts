/**
 * Property Test: Results Sorted by Price (Property 5)
 *
 * Verifies that for any non-empty result set, for all consecutive pairs
 * (results[i], results[i+1]), results[i].price ≤ results[i+1].price.
 *
 * **Validates: Requirements 4.8**
 */

import * as fc from 'fast-check';
import { sortByPrice } from '../../src/services/search.js';
import type { FlightResult, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary generator for a FlightResult with a configurable price.
 * Uses a minimal valid FlightResult shape for testing sort behavior.
 */
const flightResultArb: fc.Arbitrary<FlightResult> = fc.record({
  id: fc.uuid(),
  price: fc.integer({ min: 1, max: 1000 }),
  origin: fc.constantFrom<OriginAirport>('ORD', 'MDW'),
  destination: fc.stringMatching(/^[A-Z]{3}$/),
  destinationCity: fc.string({ minLength: 2, maxLength: 30 }),
  departureDate: fc.date({ min: new Date(2025, 0, 1), max: new Date(2026, 0, 1) }),
  departureTime: fc.constantFrom('06:30', '08:00', '12:15', '18:45', '22:00'),
  arrivalTime: fc.constantFrom('09:30', '11:00', '15:15', '21:45', '23:59'),
  durationMinutes: fc.integer({ min: 60, max: 600 }),
  stops: fc.integer({ min: 0, max: 3 }),
  airlines: fc.array(fc.stringMatching(/^[A-Z0-9]{2}$/), { minLength: 1, maxLength: 3 }),
  bookingUrl: fc.constant('https://example.com/book'),
});

describe('Feature: cheap-flight-finder, Property 5: Results Sorted by Price', () => {
  it('consecutive pairs satisfy results[i].price ≤ results[i+1].price', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 1, maxLength: 100 }),
        (flights) => {
          const sorted = sortByPrice(flights);

          // Verify all consecutive pairs are in non-decreasing price order
          for (let i = 0; i < sorted.length - 1; i++) {
            expect(sorted[i]!.price).toBeLessThanOrEqual(sorted[i + 1]!.price);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sorted result preserves the same number of elements', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 100 }),
        (flights) => {
          const sorted = sortByPrice(flights);
          expect(sorted).toHaveLength(flights.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('sorted result does not mutate the original array', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 1, maxLength: 50 }),
        (flights) => {
          const originalPrices = flights.map((f) => f.price);
          sortByPrice(flights);
          const afterPrices = flights.map((f) => f.price);

          // Original array should remain unchanged
          expect(afterPrices).toEqual(originalPrices);
        }
      ),
      { numRuns: 100 }
    );
  });
});
