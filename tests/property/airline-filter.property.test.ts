/**
 * Property Test: Airline Filter Correctness (Property 7)
 *
 * For any set of airline codes A and for any flight in filtered results,
 * at least one airline in flight.airlines SHALL be in A.
 *
 * **Validates: Requirements 5.2**
 */

import * as fc from 'fast-check';
import { filterByAirlines } from '../../src/services/search.js';
import type { FlightResult, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary for generating a valid airline IATA code (2 uppercase alphanumeric chars).
 */
const airlineCodeArb = fc.stringMatching(/^[A-Z0-9]{2}$/);

/**
 * Arbitrary for generating a FlightResult with a random set of airlines.
 */
function flightResultArb(airlinesArb: fc.Arbitrary<string[]>): fc.Arbitrary<FlightResult> {
  return fc.record({
    id: fc.uuid(),
    price: fc.integer({ min: 1, max: 500 }),
    origin: fc.constantFrom<OriginAirport>('ORD', 'MDW'),
    destination: fc.stringMatching(/^[A-Z]{3}$/),
    destinationCity: fc.string({ minLength: 2, maxLength: 30 }),
    departureDate: fc.date({ min: new Date(2025, 0, 1), max: new Date(2026, 0, 1) }),
    departureTime: fc.constantFrom('08:00', '12:30', '18:45', '06:15'),
    arrivalTime: fc.constantFrom('11:00', '15:30', '21:45', '09:15'),
    durationMinutes: fc.integer({ min: 60, max: 600 }),
    stops: fc.integer({ min: 0, max: 3 }),
    airlines: airlinesArb,
    bookingUrl: fc.constant('https://example.com/book'),
  });
}

describe('Feature: cheap-flight-finder, Property 7: Airline Filter Correctness', () => {
  it('every filtered flight has at least one airline from the filter set', () => {
    fc.assert(
      fc.property(
        // Generate a non-empty list of flights with random airlines
        fc.array(
          flightResultArb(fc.array(airlineCodeArb, { minLength: 1, maxLength: 3 })),
          { minLength: 1, maxLength: 50 }
        ),
        // Generate a non-empty filter set of airline codes
        fc.array(airlineCodeArb, { minLength: 1, maxLength: 5 }),
        (flights, airlineFilter) => {
          const filtered = filterByAirlines(flights, airlineFilter);

          // Normalize filter codes to uppercase (same as the function does)
          const normalizedFilter = new Set(airlineFilter.map((c) => c.toUpperCase()));

          // Property: every flight in the filtered results must have at least one airline in the filter set
          for (const flight of filtered) {
            const hasMatchingAirline = flight.airlines.some(
              (airline) => normalizedFilter.has(airline.toUpperCase())
            );
            expect(hasMatchingAirline).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('no flight with a matching airline is excluded from results', () => {
    fc.assert(
      fc.property(
        fc.array(
          flightResultArb(fc.array(airlineCodeArb, { minLength: 1, maxLength: 3 })),
          { minLength: 1, maxLength: 50 }
        ),
        fc.array(airlineCodeArb, { minLength: 1, maxLength: 5 }),
        (flights, airlineFilter) => {
          const filtered = filterByAirlines(flights, airlineFilter);
          const normalizedFilter = new Set(airlineFilter.map((c) => c.toUpperCase()));

          // Count how many flights in the original set should match
          const expectedMatches = flights.filter((flight) =>
            flight.airlines.some((airline) => normalizedFilter.has(airline.toUpperCase()))
          );

          // Property: filtered results should include ALL flights that have a matching airline
          expect(filtered.length).toBe(expectedMatches.length);
        }
      ),
      { numRuns: 200 }
    );
  });
});
