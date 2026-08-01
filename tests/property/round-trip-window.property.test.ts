/**
 * Property Test: Round-Trip Return Window (Property 8)
 *
 * Verifies that:
 * 1. transformToKiwiRequest correctly sets nights_in_dst_from and nights_in_dst_to
 *    from the SearchParams return window [min, max].
 * 2. For any round-trip search through SearchService, all results have
 *    (returnDepartureDate - departureDate) within [min, max] days inclusive.
 *
 * **Validates: Requirements 2.3, 2.4**
 */

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { transformToKiwiRequest, SearchService } from '../../src/services/search.js';
import type { SearchParams, OriginAirport } from '../../src/types.js';
import type { IFlightAdapter, SkyscannerSearchRequest, SkyscannerFlight, SkyscannerRouteSegment } from '../../src/adapters/skyscanner.js';

/**
 * Helper: compute the number of days between two dates (date-only, ignoring time).
 */
function daysBetween(start: Date, end: Date): number {
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Helper: create a mock round-trip flight with a specific number of nights at destination.
 */
function createMockRoundTripFlight(
  origin: string,
  destination: string,
  departureDate: Date,
  nightsAtDestination: number,
  id: string
): SkyscannerFlight {
  const returnDate = new Date(departureDate);
  returnDate.setDate(returnDate.getDate() + nightsAtDestination);

  const depIso = departureDate.toISOString();
  const depArrival = new Date(departureDate.getTime() + 3 * 60 * 60 * 1000).toISOString(); // 3h flight
  const retIso = returnDate.toISOString();
  const retArrival = new Date(returnDate.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const outboundSegment: SkyscannerRouteSegment = {
    flyFrom: origin,
    flyTo: destination,
    local_departure: depIso,
    local_arrival: depArrival,
    airline: 'UA',
    flight_no: 100,
    operating_carrier: 'UA',
  };

  const returnSegment: SkyscannerRouteSegment = {
    flyFrom: destination,
    flyTo: origin,
    local_departure: retIso,
    local_arrival: retArrival,
    airline: 'UA',
    flight_no: 200,
    operating_carrier: 'UA',
  };

  return {
    id,
    price: 10, // Low price to pass any price filter
    deep_link: `https://example.com/book/${id}`,
    flyFrom: origin,
    flyTo: destination,
    cityFrom: 'Chicago',
    cityTo: 'Los Angeles',
    local_departure: depIso,
    local_arrival: depArrival,
    duration: {
      departure: 3 * 60 * 60, // 3 hours outbound
      return: 3 * 60 * 60,    // 3 hours return
      total: 6 * 60 * 60,
    },
    airlines: ['UA'],
    route: [outboundSegment, returnSegment],
    availability: { seats: null },
  };
}

describe('Feature: cheap-flight-finder, Property 8: Round-Trip Return Window', () => {
  it('transformToKiwiRequest sets nights_in_dst_from and nights_in_dst_to from return window [min, max]', () => {
    fc.assert(
      fc.property(
        // Generate return window [min, max] where 1 <= min <= max <= 30
        fc.integer({ min: 1, max: 30 }).chain((min) =>
          fc.integer({ min, max: 30 }).map((max) => ({ min, max }))
        ),
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        (returnWindow, origin) => {
          const params: SearchParams = {
            origins: [origin],
            destination: 'US',
            dateFrom: new Date(2025, 5, 1),
            dateTo: new Date(2025, 5, 8),
            tripType: 'round',
            returnDaysMin: returnWindow.min,
            returnDaysMax: returnWindow.max,
            maxPrice: 200,
            nonstopOnly: false,
            limit: 20,
          };

          const request = transformToKiwiRequest(params, origin);

          // nights_in_dst_from must equal the specified minimum
          expect(request.nights_in_dst_from).toBe(returnWindow.min);
          // nights_in_dst_to must equal the specified maximum
          expect(request.nights_in_dst_to).toBe(returnWindow.max);
          // flight_type must be 'round'
          expect(request.flight_type).toBe('round');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('defaults to 2-7 days when no return window is specified', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        (origin) => {
          const params: SearchParams = {
            origins: [origin],
            destination: 'US',
            dateFrom: new Date(2025, 5, 1),
            dateTo: new Date(2025, 5, 8),
            tripType: 'round',
            // No returnDaysMin or returnDaysMax specified
            maxPrice: 200,
            nonstopOnly: false,
            limit: 20,
          };

          const request = transformToKiwiRequest(params, origin);

          // Should default to 2-7 days per Requirement 2.4
          expect(request.nights_in_dst_from).toBe(2);
          expect(request.nights_in_dst_to).toBe(7);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('all round-trip results have (returnDate - departureDate) within [min, max] days', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate return window [min, max] where 1 <= min <= max <= 14
        fc.integer({ min: 1, max: 14 }).chain((min) =>
          fc.integer({ min, max: 14 }).map((max) => ({ min, max }))
        ),
        // Generate number of flights to return (1-5)
        fc.integer({ min: 1, max: 5 }),
        async (returnWindow, numFlights) => {
          const departureDate = new Date(2025, 5, 15); // Fixed departure for predictability

          // Create a mock adapter that returns round-trip flights
          // with nights within the requested [min, max] window
          const mockAdapter: IFlightAdapter = {
            searchFlights: async (request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> => {
              const min = request.nights_in_dst_from ?? 2;
              const max = request.nights_in_dst_to ?? 7;
              const flights: SkyscannerFlight[] = [];

              for (let i = 0; i < numFlights; i++) {
                // Generate a random nights value within [min, max]
                const nights = min + (i % (max - min + 1));
                flights.push(
                  createMockRoundTripFlight(
                    request.fly_from,
                    'LAX',
                    departureDate,
                    nights,
                    `rt-flight-${i}`
                  )
                );
              }
              return flights;
            },
          };

          const service = new SearchService(mockAdapter);

          const params: SearchParams = {
            origins: ['ORD'],
            destination: 'US',
            dateFrom: departureDate,
            dateTo: new Date(2025, 5, 22),
            tripType: 'round',
            returnDaysMin: returnWindow.min,
            returnDaysMax: returnWindow.max,
            maxPrice: 200,
            nonstopOnly: false,
            limit: 20,
          };

          const result = await service.search(params);

          // All round-trip results must have returnDepartureDate set
          // and the difference must be within [min, max] days
          for (const flight of result.flights) {
            expect(flight.returnDepartureDate).toBeDefined();

            if (flight.returnDepartureDate) {
              const nights = daysBetween(flight.departureDate, flight.returnDepartureDate);
              expect(nights).toBeGreaterThanOrEqual(returnWindow.min);
              expect(nights).toBeLessThanOrEqual(returnWindow.max);
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('does not set nights_in_dst fields for one-way searches', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        (origin) => {
          const params: SearchParams = {
            origins: [origin],
            destination: 'US',
            dateFrom: new Date(2025, 5, 1),
            dateTo: new Date(2025, 5, 8),
            tripType: 'oneway',
            returnDaysMin: 3, // These should be ignored for oneway
            returnDaysMax: 7,
            maxPrice: 100,
            nonstopOnly: false,
            limit: 20,
          };

          const request = transformToKiwiRequest(params, origin);

          // One-way searches should NOT have nights_in_dst fields set
          expect(request.nights_in_dst_from).toBeUndefined();
          expect(request.nights_in_dst_to).toBeUndefined();
          expect(request.flight_type).toBe('oneway');
        }
      ),
      { numRuns: 50 }
    );
  });
});
