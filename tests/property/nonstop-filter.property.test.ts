/**
 * Property Test: Nonstop Filter Completeness (Property 6)
 *
 * Verifies that:
 * 1. transformToKiwiRequest sets max_stopovers=0 when nonstopOnly is true
 * 2. When nonstopOnly is true, all flights returned by the SearchService have stops === 0
 *
 * **Validates: Requirements 5.1**
 */

import * as fc from 'fast-check';
import { transformToKiwiRequest, SearchService } from '../../src/services/search.js';
import type { SearchParams, OriginAirport } from '../../src/types.js';
import type { IFlightAdapter, SkyscannerSearchRequest, SkyscannerFlight, SkyscannerRouteSegment } from '../../src/adapters/skyscanner.js';

/**
 * Helper: build a valid SearchParams object with nonstopOnly set.
 */
function buildSearchParams(overrides: Partial<SearchParams> = {}): SearchParams {
  const now = new Date();
  const dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);

  return {
    origins: ['ORD'],
    destination: 'US',
    dateFrom,
    dateTo,
    tripType: 'oneway',
    maxPrice: 100,
    nonstopOnly: true,
    limit: 20,
    ...overrides,
  };
}

/**
 * Helper: create a mock flight with a specific number of route segments (stops = segments - 1).
 */
function createMockFlight(origin: string, id: string, numSegments: number): SkyscannerFlight {
  const segments: SkyscannerRouteSegment[] = [];
  const airports = ['ORD', 'DFW', 'DEN', 'LAX', 'SFO', 'SEA', 'PHX'];

  for (let i = 0; i < numSegments; i++) {
    const from = i === 0 ? origin : airports[i % airports.length]!;
    const to = i === numSegments - 1 ? 'LAX' : airports[(i + 1) % airports.length]!;
    segments.push({
      flyFrom: from,
      flyTo: to,
      local_departure: '2025-04-01T08:00:00.000Z',
      local_arrival: '2025-04-01T11:00:00.000Z',
      airline: 'UA',
      flight_no: 100 + i,
      operating_carrier: 'UA',
    });
  }

  return {
    id,
    price: 50,
    deep_link: `https://example.com/book/${id}`,
    flyFrom: origin,
    flyTo: 'LAX',
    cityFrom: 'Chicago',
    cityTo: 'Los Angeles',
    local_departure: '2025-04-01T08:00:00.000Z',
    local_arrival: '2025-04-01T11:00:00.000Z',
    duration: { departure: 10800, return: 0, total: 10800 },
    airlines: ['UA'],
    route: segments,
    availability: { seats: null },
  };
}

describe('Feature: cheap-flight-finder, Property 6: Nonstop Filter Completeness', () => {
  it('transformToKiwiRequest sets max_stopovers=0 when nonstopOnly is true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        fc.constantFrom('oneway', 'round') as fc.Arbitrary<'oneway' | 'round'>,
        fc.integer({ min: 50, max: 300 }),
        (origin, tripType, maxPrice) => {
          const params = buildSearchParams({
            origins: [origin],
            nonstopOnly: true,
            tripType,
            maxPrice,
          });

          const request = transformToKiwiRequest(params, origin);

          // max_stopovers must be 0 when nonstopOnly is true
          expect(request.max_stopovers).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('transformToKiwiRequest does NOT set max_stopovers when nonstopOnly is false', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        fc.constantFrom('oneway', 'round') as fc.Arbitrary<'oneway' | 'round'>,
        fc.integer({ min: 50, max: 300 }),
        (origin, tripType, maxPrice) => {
          const params = buildSearchParams({
            origins: [origin],
            nonstopOnly: false,
            tripType,
            maxPrice,
          });

          const request = transformToKiwiRequest(params, origin);

          // max_stopovers should be undefined when nonstopOnly is false
          expect(request.max_stopovers).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('all flights returned by SearchService have stops === 0 when nonstopOnly is true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        // Generate a mix of nonstop (1 segment) and multi-stop (2-4 segments) flights
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 10 }),
        async (origin, segmentCounts) => {
          // Create mock adapter that returns flights with varying stop counts
          const mockAdapter: IFlightAdapter = {
            searchFlights: async (request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> => {
              // Only return nonstop flights when max_stopovers === 0
              // This mimics the real API behavior
              return segmentCounts
                .map((numSegments, idx) => createMockFlight(request.fly_from, `flight-${idx}`, numSegments))
                .filter((flight) => {
                  if (request.max_stopovers === 0) {
                    // API filters to only nonstop flights (1 segment = 0 stops)
                    return flight.route.length === 1;
                  }
                  return true;
                });
            },
          };

          const service = new SearchService(mockAdapter);
          const params = buildSearchParams({
            origins: [origin],
            nonstopOnly: true,
            maxPrice: 200, // High enough to include all mock flights
          });

          const result = await service.search(params);

          // ALL returned flights must have stops === 0
          for (const flight of result.flights) {
            expect(flight.stops).toBe(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('nonstop filter is applied regardless of origin, destination, or trip type', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<OriginAirport>('ORD', 'MDW'),
        fc.constantFrom('US', 'LAX', 'JFK', 'MIA'),
        fc.constantFrom('oneway', 'round') as fc.Arbitrary<'oneway' | 'round'>,
        async (origin, destination, tripType) => {
          // Track whether max_stopovers=0 was in the request
          let requestedMaxStopovers: number | undefined;

          const mockAdapter: IFlightAdapter = {
            searchFlights: async (request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> => {
              requestedMaxStopovers = request.max_stopovers;
              // Return a nonstop flight
              return [createMockFlight(request.fly_from, 'flight-1', 1)];
            },
          };

          const service = new SearchService(mockAdapter);
          const params = buildSearchParams({
            origins: [origin],
            destination,
            tripType,
            nonstopOnly: true,
            maxPrice: 200,
          });

          const result = await service.search(params);

          // The request must include max_stopovers=0
          expect(requestedMaxStopovers).toBe(0);

          // All returned flights must have stops === 0
          for (const flight of result.flights) {
            expect(flight.stops).toBe(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
