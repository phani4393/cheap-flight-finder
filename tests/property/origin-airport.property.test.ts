/**
 * Property Test: Origin Airport Correctness (Property 2)
 *
 * Verifies that:
 * 1. transformToKiwiRequest sets fly_from to exactly the specified origin airport
 * 2. When origins is ['ORD', 'MDW'] (BOTH), the SearchService calls the adapter
 *    twice — once for each airport — producing the union of both results.
 *
 * **Validates: Requirements 1.3, 1.4**
 */

import * as fc from 'fast-check';
import { transformToKiwiRequest, SearchService } from '../../src/services/search.js';
import type { SearchParams, OriginAirport } from '../../src/types.js';
import type { IFlightAdapter, SkyscannerSearchRequest, SkyscannerFlight } from '../../src/adapters/skyscanner.js';

/**
 * Helper: build a minimal valid SearchParams object for testing.
 */
function buildSearchParams(origins: OriginAirport[]): SearchParams {
  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);

  return {
    origins,
    destination: 'US',
    dateFrom,
    dateTo,
    tripType: 'oneway',
    maxPrice: 100,
    nonstopOnly: false,
    limit: 20,
  };
}

/**
 * Helper: create a mock flight result from the adapter.
 * Price is set to 10 to ensure it always passes client-side price filtering.
 */
function createMockFlight(origin: string, id: string): SkyscannerFlight {
  return {
    id,
    price: 10,
    deep_link: `https://example.com/book/${id}`,
    flyFrom: origin,
    flyTo: 'LAX',
    cityFrom: 'Chicago',
    cityTo: 'Los Angeles',
    local_departure: '2025-04-01T08:00:00.000Z',
    local_arrival: '2025-04-01T11:00:00.000Z',
    duration: { departure: 10800, return: 0, total: 10800 },
    airlines: ['UA'],
    route: [
      {
        flyFrom: origin,
        flyTo: 'LAX',
        local_departure: '2025-04-01T08:00:00.000Z',
        local_arrival: '2025-04-01T11:00:00.000Z',
        airline: 'UA',
        flight_no: 123,
        operating_carrier: 'UA',
      },
    ],
    availability: { seats: null },
  };
}

describe('Feature: cheap-flight-finder, Property 2: Origin Airport Correctness', () => {
  it('transformToKiwiRequest sets fly_from to exactly the specified origin', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        (origin) => {
          const params = buildSearchParams([origin]);
          const request = transformToKiwiRequest(params, origin);

          // fly_from must equal the origin string exactly
          expect(request.fly_from).toBe(origin);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('BOTH selection causes the search service to call the adapter for each airport', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random maxPrice that always exceeds our mock price (10)
        fc.integer({ min: 50, max: 300 }),
        async (maxPrice) => {
          const calledOrigins: string[] = [];

          // Create a mock adapter that records which origins it's called with
          const mockAdapter: IFlightAdapter = {
            searchFlights: async (request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> => {
              calledOrigins.push(request.fly_from);
              return [createMockFlight(request.fly_from, `flight-${request.fly_from}-1`)];
            },
          };

          const service = new SearchService(mockAdapter);

          const params: SearchParams = {
            origins: ['ORD', 'MDW'],
            destination: 'US',
            dateFrom: new Date(2025, 3, 1),
            dateTo: new Date(2025, 3, 8),
            tripType: 'oneway',
            maxPrice,
            nonstopOnly: false,
            limit: 20, // Use a limit high enough to include both results
          };

          const result = await service.search(params);

          // The adapter must have been called exactly twice
          expect(calledOrigins).toHaveLength(2);
          // Both ORD and MDW must be present (order may vary due to parallelism)
          expect(calledOrigins.sort()).toEqual(['MDW', 'ORD']);
          // Results should contain flights from both origins (union)
          const resultOrigins = result.flights.map((f) => f.origin);
          expect(resultOrigins).toContain('ORD');
          expect(resultOrigins).toContain('MDW');
        }
      ),
      { numRuns: 50 }
    );
  });

  it('single origin selection only calls the adapter once for that airport', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        async (origin) => {
          const calledOrigins: string[] = [];

          const mockAdapter: IFlightAdapter = {
            searchFlights: async (request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> => {
              calledOrigins.push(request.fly_from);
              return [createMockFlight(request.fly_from, `flight-${request.fly_from}-1`)];
            },
          };

          const service = new SearchService(mockAdapter);
          const params = buildSearchParams([origin]);

          await service.search(params);

          // Only one call should be made
          expect(calledOrigins).toHaveLength(1);
          // And it should be for the specified origin
          expect(calledOrigins[0]).toBe(origin);
        }
      ),
      { numRuns: 50 }
    );
  });
});
