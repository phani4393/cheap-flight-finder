/**
 * Property 1: Price Filter Accuracy
 *
 * For any price threshold value P and for any set of flights returned by the search,
 * all flights in the result SHALL have price < P, and the result SHALL include all
 * flights from the API response that satisfy price < P.
 *
 * **Validates: Requirements 1.2, 2.2, 5.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { filterByPrice } from '../../src/services/search.js';
import type { FlightResult, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary generator for a FlightResult with a configurable price range.
 * Generates realistic flight data with prices between 1 and 500.
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

/**
 * Arbitrary generator for a price threshold.
 * Covers the typical range of price filters users would set.
 */
const priceThresholdArb = fc.integer({ min: 10, max: 300 });

describe('Feature: cheap-flight-finder, Property 1: Price Filter Accuracy', () => {
  it('all filtered results have price strictly less than the threshold', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        priceThresholdArb,
        (flights, threshold) => {
          const filtered = filterByPrice(flights, threshold);

          // Every flight in the result must have price < threshold
          for (const flight of filtered) {
            expect(flight.price).toBeLessThan(threshold);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('all flights below threshold are included in the result (no false negatives)', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        priceThresholdArb,
        (flights, threshold) => {
          const filtered = filterByPrice(flights, threshold);

          // Count how many flights should pass the filter
          const expectedCount = flights.filter((f) => f.price < threshold).length;

          // The filtered set must contain exactly that many flights
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
        priceThresholdArb,
        (flights, threshold) => {
          const filtered = filterByPrice(flights, threshold);

          // Every flight in the result must exist in the original array (by id)
          const originalIds = new Set(flights.map((f) => f.id));
          for (const flight of filtered) {
            expect(originalIds.has(flight.id)).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('threshold of 0 or negative returns empty result', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: -100, max: 0 }),
        (flights, threshold) => {
          const filtered = filterByPrice(flights, threshold);

          // No flight can have a price less than 0 (prices are positive integers)
          // so result must be empty
          expect(filtered).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
