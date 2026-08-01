/**
 * Property 4: Departure Time Window Filter
 *
 * For any departure time window and any list of FlightResult objects,
 * filter SHALL return only flights within the window (inclusive).
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

import * as fc from 'fast-check';
import { filterByDepartureTime } from '../../src/services/search.js';
import type { FlightResult, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary generator for a valid HH:mm time string.
 * Hours: 00–23, Minutes: 00–59.
 */
const timeArb: fc.Arbitrary<string> = fc
  .record({
    hour: fc.integer({ min: 0, max: 23 }),
    minute: fc.integer({ min: 0, max: 59 }),
  })
  .map(({ hour, minute }) => {
    const hh = hour.toString().padStart(2, '0');
    const mm = minute.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  });

/**
 * Arbitrary generator for a FlightResult with random departureTime.
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
  departureTime: timeArb,
  arrivalTime: timeArb,
  durationMinutes: fc.integer({ min: 60, max: 600 }),
  stops: fc.integer({ min: 0, max: 3 }),
  airlines: fc.array(fc.stringMatching(/^[A-Z0-9]{2}$/), { minLength: 1, maxLength: 3 }),
  bookingUrl: fc.constant('https://example.com/book'),
});

describe('Feature: google-flights-scraper, Property 4: Departure Time Window Filter', () => {
  it('all returned flights have departureTime >= departureAfter (if set)', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        timeArb,
        (flights, departureAfter) => {
          const filtered = filterByDepartureTime(flights, departureAfter, undefined);

          for (const flight of filtered) {
            expect(flight.departureTime >= departureAfter).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('all returned flights have departureTime <= departureBefore (if set)', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        timeArb,
        (flights, departureBefore) => {
          const filtered = filterByDepartureTime(flights, undefined, departureBefore);

          for (const flight of filtered) {
            expect(flight.departureTime <= departureBefore).toBe(true);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('no flights outside the window are included when both bounds are set', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        timeArb,
        timeArb,
        (flights, time1, time2) => {
          // Ensure departureAfter <= departureBefore for a valid window
          const departureAfter = time1 <= time2 ? time1 : time2;
          const departureBefore = time1 <= time2 ? time2 : time1;

          const filtered = filterByDepartureTime(flights, departureAfter, departureBefore);

          // All returned flights must be within the window
          for (const flight of filtered) {
            expect(flight.departureTime >= departureAfter).toBe(true);
            expect(flight.departureTime <= departureBefore).toBe(true);
          }

          // No flights within the window are excluded (completeness)
          const expectedInWindow = flights.filter(
            (f) => f.departureTime >= departureAfter && f.departureTime <= departureBefore
          );
          expect(filtered).toHaveLength(expectedInWindow.length);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns all flights when neither bound is specified', () => {
    fc.assert(
      fc.property(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        (flights) => {
          const filtered = filterByDepartureTime(flights, undefined, undefined);

          expect(filtered).toHaveLength(flights.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
