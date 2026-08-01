/**
 * Property Test: Basic Economy Exclusion Filter (Property 6)
 *
 * For any list of FlightResult objects with isBasicEconomy flags,
 * filter SHALL return only non-basic-economy flights.
 *
 * **Validates: Requirements 9.1**
 */

import * as fc from 'fast-check';
import { filterByBasicEconomy } from '../../src/services/search.js';
import type { FlightResult } from '../../src/types.js';

/**
 * Generator for a random FlightResult with a specified isBasicEconomy value.
 */
function flightResultArb(isBasicEconomy: fc.Arbitrary<boolean | undefined>): fc.Arbitrary<FlightResult> {
  return fc.record({
    id: fc.uuid(),
    price: fc.integer({ min: 30, max: 2000 }),
    origin: fc.constantFrom('ORD' as const, 'MDW' as const),
    destination: fc.stringMatching(/^[A-Z]{3}$/),
    destinationCity: fc.string({ minLength: 1, maxLength: 20 }),
    departureDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }),
    departureTime: fc.tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 })
    ).map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`),
    arrivalTime: fc.tuple(
      fc.integer({ min: 0, max: 23 }),
      fc.integer({ min: 0, max: 59 })
    ).map(([h, m]) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`),
    durationMinutes: fc.integer({ min: 30, max: 1200 }),
    stops: fc.integer({ min: 0, max: 3 }),
    airlines: fc.array(fc.stringMatching(/^[A-Z0-9]{2}$/), { minLength: 1, maxLength: 3 }),
    bookingUrl: fc.webUrl(),
    isBasicEconomy: isBasicEconomy,
  });
}

/**
 * Generator for a list of FlightResult objects with random isBasicEconomy flags.
 */
const flightListArb = fc.array(
  flightResultArb(fc.oneof(fc.constant(true), fc.constant(false), fc.constant(undefined))),
  { minLength: 0, maxLength: 30 }
);

describe('Property 6: Basic Economy Exclusion Filter', () => {
  it('all returned flights have isBasicEconomy !== true', () => {
    fc.assert(
      fc.property(flightListArb, (flights) => {
        const result = filterByBasicEconomy(flights);

        for (const flight of result) {
          expect(flight.isBasicEconomy).not.toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('count of returned flights equals count of non-basic-economy flights in input', () => {
    fc.assert(
      fc.property(flightListArb, (flights) => {
        const result = filterByBasicEconomy(flights);

        const expectedCount = flights.filter((f) => !f.isBasicEconomy).length;
        expect(result.length).toBe(expectedCount);
      }),
      { numRuns: 200 }
    );
  });

  it('all non-basic-economy flights from input are preserved in output', () => {
    fc.assert(
      fc.property(flightListArb, (flights) => {
        const result = filterByBasicEconomy(flights);
        const resultIds = new Set(result.map((f) => f.id));

        for (const flight of flights) {
          if (!flight.isBasicEconomy) {
            expect(resultIds.has(flight.id)).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
