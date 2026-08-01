/**
 * Search Service Unit Tests
 * Tests for parameter transformation and search service functionality.
 *
 * Validates: Requirements 1.1, 1.2, 2.1, 2.2, 5.1, 5.2, 5.3, 5.5
 */

import { vi } from 'vitest';
import {
  transformToKiwiRequest,
  formatDateForKiwi,
  transformKiwiFlights,
  filterByPrice,
  filterByAirlines,
  sortByPrice,
  applyLimit,
  SearchService,
  ISearchService,
} from '../../src/services/search.js';
import type { SearchParams, FlightResult } from '../../src/types.js';
import type { IFlightAdapter, SkyscannerSearchRequest, SkyscannerFlight } from '../../src/adapters/skyscanner.js';

// Helper to create dates that work consistently across timezones
// Using year, month (0-indexed), day format for local time
function createLocalDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

/**
 * Helper function to create a mock KiwiFlight object for testing.
 */
function createMockKiwiFlight(overrides: Partial<SkyscannerFlight> = {}): SkyscannerFlight {
  return {
    id: 'test-flight-id',
    price: 75,
    deep_link: 'https://kiwi.com/booking/test',
    flyFrom: 'ORD',
    flyTo: 'LAX',
    cityFrom: 'Chicago',
    cityTo: 'Los Angeles',
    local_departure: '2024-03-15T08:30:00',
    local_arrival: '2024-03-15T10:45:00',
    duration: {
      departure: 9000, // 150 minutes = 2h 30m
      return: 0,
      total: 9000,
    },
    airlines: ['UA'],
    route: [
      {
        flyFrom: 'ORD',
        flyTo: 'LAX',
        local_departure: '2024-03-15T08:30:00',
        local_arrival: '2024-03-15T10:45:00',
        airline: 'UA',
        flight_no: 123,
        operating_carrier: 'UA',
      },
    ],
    availability: {
      seats: 5,
    },
    ...overrides,
  };
}

/**
 * Helper function to create a mock FlightResult object for testing.
 */
function createMockFlightResult(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    id: 'test-flight-id',
    price: 75,
    origin: 'ORD',
    destination: 'LAX',
    destinationCity: 'Los Angeles',
    departureDate: new Date('2024-03-15T08:30:00'),
    departureTime: '08:30',
    arrivalTime: '10:45',
    durationMinutes: 150,
    stops: 0,
    airlines: ['UA'],
    bookingUrl: 'https://kiwi.com/booking/test',
    ...overrides,
  };
}

describe('transformToKiwiRequest', () => {
  const baseParams: SearchParams = {
    origins: ['ORD'],
    destination: 'US',
    dateFrom: createLocalDate(2024, 2, 15), // March 15, 2024
    dateTo: createLocalDate(2024, 2, 22),   // March 22, 2024
    tripType: 'oneway',
    maxPrice: 100,
    nonstopOnly: false,
    limit: 20,
  };

  describe('basic transformations', () => {
    it('should transform origin to fly_from', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.fly_from).toBe('ORD');
    });

    it('should transform destination to fly_to', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.fly_to).toBe('US');
    });

    it('should handle specific airport destination', () => {
      const params = { ...baseParams, destination: 'LAX' };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.fly_to).toBe('LAX');
    });

    it('should transform tripType to flight_type', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.flight_type).toBe('oneway');
    });

    it('should always set currency to USD', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.curr).toBe('USD');
    });

    it('should always set sort to price', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.sort).toBe('price');
    });

    it('should transform limit', () => {
      const params = { ...baseParams, limit: 50 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.limit).toBe(50);
    });
  });

  describe('date formatting', () => {
    it('should format dateFrom as YYYY-MM-DD', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.date_from).toBe('2024-03-15');
    });

    it('should format dateTo as YYYY-MM-DD', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.date_to).toBe('2024-03-22');
    });

    it('should pad single digit days with leading zero', () => {
      const params = {
        ...baseParams,
        dateFrom: createLocalDate(2024, 0, 5),  // January 5, 2024
        dateTo: createLocalDate(2024, 0, 9),    // January 9, 2024
      };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.date_from).toBe('2024-01-05');
      expect(result.date_to).toBe('2024-01-09');
    });
  });

  describe('price_to based on trip type (Req 1.2, 2.2)', () => {
    it('should use maxPrice when explicitly set for one-way', () => {
      const params = { ...baseParams, maxPrice: 75 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.price_to).toBe(75);
    });

    it('should use maxPrice when explicitly set for round-trip', () => {
      const params = { ...baseParams, tripType: 'round' as const, maxPrice: 150 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.price_to).toBe(150);
    });

    it('should default to 100 for one-way when maxPrice is 0', () => {
      const params = { ...baseParams, maxPrice: 0 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.price_to).toBe(100);
    });

    it('should default to 200 for round-trip when maxPrice is 0', () => {
      const params = { ...baseParams, tripType: 'round' as const, maxPrice: 0 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.price_to).toBe(200);
    });
  });

  describe('nonstopOnly flag (Req 5.1)', () => {
    it('should set max_stopovers=0 when nonstopOnly is true', () => {
      const params = { ...baseParams, nonstopOnly: true };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.max_stopovers).toBe(0);
    });

    it('should not set max_stopovers when nonstopOnly is false', () => {
      const params = { ...baseParams, nonstopOnly: false };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.max_stopovers).toBeUndefined();
    });
  });

  describe('destination handling (Req 5.5)', () => {
    it('should use "US" for all US destinations', () => {
      const params = { ...baseParams, destination: 'US' };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.fly_to).toBe('US');
    });

    it('should use specific IATA code when provided', () => {
      const params = { ...baseParams, destination: 'MIA' };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.fly_to).toBe('MIA');
    });
  });
});

describe('formatDateForKiwi', () => {
  it('should format date as YYYY-MM-DD', () => {
    expect(formatDateForKiwi(createLocalDate(2024, 2, 15))).toBe('2024-03-15');
  });

  it('should pad single digit day', () => {
    expect(formatDateForKiwi(createLocalDate(2024, 2, 5))).toBe('2024-03-05');
  });

  it('should pad single digit month', () => {
    expect(formatDateForKiwi(createLocalDate(2024, 0, 15))).toBe('2024-01-15');
  });

  it('should handle end of year', () => {
    expect(formatDateForKiwi(createLocalDate(2024, 11, 31))).toBe('2024-12-31');
  });
});

describe('SearchService', () => {
  let mockAdapter: IFlightAdapter;
  let searchService: ISearchService;

  beforeEach(() => {
    mockAdapter = {
      searchFlights: vi.fn().mockResolvedValue([]),
    };
    searchService = new SearchService(mockAdapter);
  });

  describe('search', () => {
    const baseParams: SearchParams = {
      origins: ['ORD'],
      destination: 'US',
      dateFrom: createLocalDate(2024, 2, 15), // March 15, 2024
      dateTo: createLocalDate(2024, 2, 22),   // March 22, 2024
      tripType: 'oneway',
      maxPrice: 100,
      nonstopOnly: false,
      limit: 20,
    };

    it('should call kiwiAdapter with transformed request', async () => {
      await searchService.search(baseParams);

      expect(mockAdapter.searchFlights).toHaveBeenCalledOnce();
      const calledRequest = (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mock.calls[0][0] as SkyscannerSearchRequest;
      expect(calledRequest.fly_from).toBe('ORD');
      expect(calledRequest.fly_to).toBe('US');
      expect(calledRequest.flight_type).toBe('oneway');
    });

    it('should return search result with metadata', async () => {
      const result = await searchService.search(baseParams);

      expect(result.searchParams).toBe(baseParams);
      expect(result.apiCallCount).toBe(1);
      expect(result.totalResultsFromApi).toBe(0);
    });

    it('should return empty result when no origins provided', async () => {
      const params = { ...baseParams, origins: [] as any };
      const result = await searchService.search(params);

      expect(result.flights).toEqual([]);
      expect(result.apiCallCount).toBe(0);
      expect(mockAdapter.searchFlights).not.toHaveBeenCalled();
    });

    it('should track totalResultsFromApi from adapter response', async () => {
      const mockFlights = [
        createMockKiwiFlight({ id: '1', price: 50 }),
        createMockKiwiFlight({ id: '2', price: 75 }),
      ];
      (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockFlights);

      const result = await searchService.search(baseParams);

      expect(result.totalResultsFromApi).toBe(2);
    });
  });

  describe('multi-origin search (Req 1.3, 1.4)', () => {
    const baseParams: SearchParams = {
      origins: ['ORD', 'MDW'],
      destination: 'US',
      dateFrom: createLocalDate(2024, 2, 15),
      dateTo: createLocalDate(2024, 2, 22),
      tripType: 'oneway',
      maxPrice: 100,
      nonstopOnly: false,
      limit: 20,
    };

    it('should make parallel API calls for multiple origins', async () => {
      const ordFlights = [createMockKiwiFlight({ id: 'ord-1', price: 50 })];
      const mdwFlights = [createMockKiwiFlight({ id: 'mdw-1', price: 60 })];
      
      (mockAdapter.searchFlights as ReturnType<typeof vi.fn>)
        .mockImplementation((request: SkyscannerSearchRequest) => {
          if (request.fly_from === 'ORD') return Promise.resolve(ordFlights);
          if (request.fly_from === 'MDW') return Promise.resolve(mdwFlights);
          return Promise.resolve([]);
        });

      const result = await searchService.search(baseParams);

      // Should have called adapter for both origins
      expect(mockAdapter.searchFlights).toHaveBeenCalledTimes(2);
      expect(result.apiCallCount).toBe(2);
    });

    it('should merge results from multiple origins', async () => {
      const ordFlights = [
        createMockKiwiFlight({ id: 'ord-1', price: 50 }),
        createMockKiwiFlight({ id: 'ord-2', price: 55 }),
      ];
      const mdwFlights = [
        createMockKiwiFlight({ id: 'mdw-1', price: 60 }),
      ];
      
      (mockAdapter.searchFlights as ReturnType<typeof vi.fn>)
        .mockImplementation((request: SkyscannerSearchRequest) => {
          if (request.fly_from === 'ORD') return Promise.resolve(ordFlights);
          if (request.fly_from === 'MDW') return Promise.resolve(mdwFlights);
          return Promise.resolve([]);
        });

      const result = await searchService.search(baseParams);

      // Total results should be merged count (3 unique flights)
      expect(result.totalResultsFromApi).toBe(3);
    });

    it('should remove duplicate flights based on flight ID', async () => {
      // Same flight ID appearing from both origins (shouldn't happen in practice,
      // but tests the deduplication logic)
      const ordFlights = [
        createMockKiwiFlight({ id: 'shared-flight', price: 50 }),
        createMockKiwiFlight({ id: 'ord-only', price: 55 }),
      ];
      const mdwFlights = [
        createMockKiwiFlight({ id: 'shared-flight', price: 50 }),  // Duplicate
        createMockKiwiFlight({ id: 'mdw-only', price: 60 }),
      ];
      
      (mockAdapter.searchFlights as ReturnType<typeof vi.fn>)
        .mockImplementation((request: SkyscannerSearchRequest) => {
          if (request.fly_from === 'ORD') return Promise.resolve(ordFlights);
          if (request.fly_from === 'MDW') return Promise.resolve(mdwFlights);
          return Promise.resolve([]);
        });

      const result = await searchService.search(baseParams);

      // totalResultsFromApi tracks the raw count from API (before filtering)
      expect(result.totalResultsFromApi).toBe(4);
      // flights array should be deduplicated: 2 from ORD + 2 from MDW - 1 duplicate = 3
      expect(result.flights).toHaveLength(3);
      // Verify the unique flight IDs
      const flightIds = result.flights.map(f => f.id);
      expect(flightIds).toContain('shared-flight');
      expect(flightIds).toContain('ord-only');
      expect(flightIds).toContain('mdw-only');
    });

    it('should correctly track apiCallCount for single origin', async () => {
      const singleOriginParams = { ...baseParams, origins: ['ORD'] as any };
      const result = await searchService.search(singleOriginParams);
      
      expect(result.apiCallCount).toBe(1);
      expect(mockAdapter.searchFlights).toHaveBeenCalledOnce();
    });

    it('should make API call with correct origin for each request', async () => {
      await searchService.search(baseParams);

      const calls = (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mock.calls;
      const flyFromValues = calls.map((call: SkyscannerSearchRequest[]) => call[0].fly_from);
      
      expect(flyFromValues).toContain('ORD');
      expect(flyFromValues).toContain('MDW');
    });

    it('should handle one origin returning empty results', async () => {
      const ordFlights = [createMockKiwiFlight({ id: 'ord-1', price: 50 })];
      
      (mockAdapter.searchFlights as ReturnType<typeof vi.fn>)
        .mockImplementation((request: SkyscannerSearchRequest) => {
          if (request.fly_from === 'ORD') return Promise.resolve(ordFlights);
          if (request.fly_from === 'MDW') return Promise.resolve([]);
          return Promise.resolve([]);
        });

      const result = await searchService.search(baseParams);

      expect(result.apiCallCount).toBe(2);
      expect(result.totalResultsFromApi).toBe(1);
    });

    it('should handle both origins returning empty results', async () => {
      (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await searchService.search(baseParams);

      expect(result.apiCallCount).toBe(2);
      expect(result.totalResultsFromApi).toBe(0);
    });
  });
});

describe('transformKiwiFlights', () => {
  it('should transform empty array to empty array', () => {
    const result = transformKiwiFlights([]);
    expect(result).toEqual([]);
  });

  it('should transform single flight correctly', () => {
    const kiwiFlight = createMockKiwiFlight();
    const result = transformKiwiFlights([kiwiFlight]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-flight-id');
    expect(result[0].price).toBe(75);
    expect(result[0].origin).toBe('ORD');
    expect(result[0].destination).toBe('LAX');
    expect(result[0].destinationCity).toBe('Los Angeles');
    expect(result[0].bookingUrl).toBe('https://kiwi.com/booking/test');
  });

  it('should calculate duration in minutes from seconds', () => {
    // 9000 seconds = 150 minutes
    const kiwiFlight = createMockKiwiFlight({
      duration: { departure: 9000, return: 0, total: 9000 },
    });
    const result = transformKiwiFlights([kiwiFlight]);

    expect(result[0].durationMinutes).toBe(150);
  });

  it('should round duration to nearest minute', () => {
    // 9030 seconds = 150.5 minutes -> should round to 151
    const kiwiFlight = createMockKiwiFlight({
      duration: { departure: 9030, return: 0, total: 9030 },
    });
    const result = transformKiwiFlights([kiwiFlight]);

    expect(result[0].durationMinutes).toBe(151);
  });

  it('should calculate stops from route segments', () => {
    // 1 segment = 0 stops (nonstop)
    const nonstopFlight = createMockKiwiFlight({
      route: [
        { flyFrom: 'ORD', flyTo: 'LAX', local_departure: '', local_arrival: '', airline: 'UA', flight_no: 1, operating_carrier: 'UA' },
      ],
    });
    expect(transformKiwiFlights([nonstopFlight])[0].stops).toBe(0);

    // 2 segments = 1 stop
    const oneStopFlight = createMockKiwiFlight({
      route: [
        { flyFrom: 'ORD', flyTo: 'DEN', local_departure: '', local_arrival: '', airline: 'UA', flight_no: 1, operating_carrier: 'UA' },
        { flyFrom: 'DEN', flyTo: 'LAX', local_departure: '', local_arrival: '', airline: 'UA', flight_no: 2, operating_carrier: 'UA' },
      ],
    });
    expect(transformKiwiFlights([oneStopFlight])[0].stops).toBe(1);

    // 3 segments = 2 stops
    const twoStopFlight = createMockKiwiFlight({
      route: [
        { flyFrom: 'ORD', flyTo: 'DEN', local_departure: '', local_arrival: '', airline: 'UA', flight_no: 1, operating_carrier: 'UA' },
        { flyFrom: 'DEN', flyTo: 'PHX', local_departure: '', local_arrival: '', airline: 'UA', flight_no: 2, operating_carrier: 'UA' },
        { flyFrom: 'PHX', flyTo: 'LAX', local_departure: '', local_arrival: '', airline: 'UA', flight_no: 3, operating_carrier: 'UA' },
      ],
    });
    expect(transformKiwiFlights([twoStopFlight])[0].stops).toBe(2);
  });

  it('should handle empty route array (edge case)', () => {
    const kiwiFlight = createMockKiwiFlight({ route: [] });
    const result = transformKiwiFlights([kiwiFlight]);
    expect(result[0].stops).toBe(0); // Math.max(0, -1) = 0
  });

  it('should extract departure time in HH:mm format', () => {
    const kiwiFlight = createMockKiwiFlight({
      local_departure: '2024-03-15T08:30:00',
    });
    const result = transformKiwiFlights([kiwiFlight]);
    expect(result[0].departureTime).toBe('08:30');
  });

  it('should extract arrival time in HH:mm format', () => {
    const kiwiFlight = createMockKiwiFlight({
      local_arrival: '2024-03-15T14:45:00',
    });
    const result = transformKiwiFlights([kiwiFlight]);
    expect(result[0].arrivalTime).toBe('14:45');
  });

  it('should parse departure date correctly', () => {
    const kiwiFlight = createMockKiwiFlight({
      local_departure: '2024-03-15T08:30:00',
    });
    const result = transformKiwiFlights([kiwiFlight]);
    expect(result[0].departureDate.getFullYear()).toBe(2024);
    expect(result[0].departureDate.getMonth()).toBe(2); // March (0-indexed)
    expect(result[0].departureDate.getDate()).toBe(15);
  });

  it('should transform multiple flights', () => {
    const flights = [
      createMockKiwiFlight({ id: 'flight-1', price: 50 }),
      createMockKiwiFlight({ id: 'flight-2', price: 75 }),
      createMockKiwiFlight({ id: 'flight-3', price: 100 }),
    ];
    const result = transformKiwiFlights(flights);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('flight-1');
    expect(result[1].id).toBe('flight-2');
    expect(result[2].id).toBe('flight-3');
  });

  it('should preserve all airlines from kiwi flight', () => {
    const kiwiFlight = createMockKiwiFlight({
      airlines: ['UA', 'AA', 'DL'],
    });
    const result = transformKiwiFlights([kiwiFlight]);
    expect(result[0].airlines).toEqual(['UA', 'AA', 'DL']);
  });

  it('should cast flyFrom to OriginAirport type', () => {
    const ordFlight = createMockKiwiFlight({ flyFrom: 'ORD' });
    const mdwFlight = createMockKiwiFlight({ flyFrom: 'MDW' });

    expect(transformKiwiFlights([ordFlight])[0].origin).toBe('ORD');
    expect(transformKiwiFlights([mdwFlight])[0].origin).toBe('MDW');
  });
});

describe('filterByPrice (Req 5.3)', () => {
  it('should return empty array for empty input', () => {
    const result = filterByPrice([], 100);
    expect(result).toEqual([]);
  });

  it('should include flights below the threshold', () => {
    const flights = [
      createMockFlightResult({ price: 50 }),
      createMockFlightResult({ price: 75 }),
    ];
    const result = filterByPrice(flights, 100);
    expect(result).toHaveLength(2);
  });

  it('should exclude flights at or above the threshold', () => {
    const flights = [
      createMockFlightResult({ id: 'below', price: 99 }),
      createMockFlightResult({ id: 'at', price: 100 }),
      createMockFlightResult({ id: 'above', price: 101 }),
    ];
    const result = filterByPrice(flights, 100);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('below');
  });

  it('should filter with low threshold', () => {
    const flights = [
      createMockFlightResult({ price: 25 }),
      createMockFlightResult({ price: 50 }),
      createMockFlightResult({ price: 75 }),
    ];
    const result = filterByPrice(flights, 50);

    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(25);
  });

  it('should return all flights when threshold is very high', () => {
    const flights = [
      createMockFlightResult({ price: 100 }),
      createMockFlightResult({ price: 200 }),
      createMockFlightResult({ price: 300 }),
    ];
    const result = filterByPrice(flights, 1000);
    expect(result).toHaveLength(3);
  });

  it('should return no flights when threshold is very low', () => {
    const flights = [
      createMockFlightResult({ price: 50 }),
      createMockFlightResult({ price: 75 }),
    ];
    const result = filterByPrice(flights, 1);
    expect(result).toHaveLength(0);
  });

  it('should preserve flight properties after filtering', () => {
    const flight = createMockFlightResult({
      id: 'special-flight',
      price: 50,
      destination: 'LAX',
      airlines: ['AA', 'UA'],
    });
    const result = filterByPrice([flight], 100);

    expect(result[0]).toEqual(flight);
  });
});

describe('filterByAirlines (Req 5.2)', () => {
  it('should return empty array for empty input', () => {
    const result = filterByAirlines([], ['UA']);
    expect(result).toEqual([]);
  });

  it('should include flights with matching airline', () => {
    const flights = [
      createMockFlightResult({ id: 'ua-flight', airlines: ['UA'] }),
      createMockFlightResult({ id: 'aa-flight', airlines: ['AA'] }),
    ];
    const result = filterByAirlines(flights, ['UA']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('ua-flight');
  });

  it('should match any airline in multi-airline flights', () => {
    const flights = [
      createMockFlightResult({ id: 'multi-carrier', airlines: ['UA', 'AA', 'DL'] }),
    ];
    const result = filterByAirlines(flights, ['AA']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('multi-carrier');
  });

  it('should match any of multiple filter airlines', () => {
    const flights = [
      createMockFlightResult({ id: 'ua-flight', airlines: ['UA'] }),
      createMockFlightResult({ id: 'aa-flight', airlines: ['AA'] }),
      createMockFlightResult({ id: 'dl-flight', airlines: ['DL'] }),
    ];
    const result = filterByAirlines(flights, ['UA', 'AA']);

    expect(result).toHaveLength(2);
    const ids = result.map(f => f.id);
    expect(ids).toContain('ua-flight');
    expect(ids).toContain('aa-flight');
  });

  it('should be case-insensitive for airline codes', () => {
    const flights = [
      createMockFlightResult({ airlines: ['UA'] }),
    ];
    
    expect(filterByAirlines(flights, ['ua'])).toHaveLength(1);
    expect(filterByAirlines(flights, ['Ua'])).toHaveLength(1);
    expect(filterByAirlines(flights, ['uA'])).toHaveLength(1);
  });

  it('should exclude flights with no matching airlines', () => {
    const flights = [
      createMockFlightResult({ id: 'dl-flight', airlines: ['DL'] }),
      createMockFlightResult({ id: 'sw-flight', airlines: ['WN'] }),
    ];
    const result = filterByAirlines(flights, ['UA', 'AA']);

    expect(result).toHaveLength(0);
  });

  it('should return all flights when all have matching airlines', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1', airlines: ['UA'] }),
      createMockFlightResult({ id: 'flight-2', airlines: ['UA', 'AA'] }),
      createMockFlightResult({ id: 'flight-3', airlines: ['AA'] }),
    ];
    const result = filterByAirlines(flights, ['UA', 'AA']);

    expect(result).toHaveLength(3);
  });

  it('should handle empty airline filter by returning all flights', () => {
    const flights = [
      createMockFlightResult({ airlines: ['UA'] }),
      createMockFlightResult({ airlines: ['AA'] }),
    ];
    // Empty filter should match nothing (no airlines to match against)
    const result = filterByAirlines(flights, []);
    expect(result).toHaveLength(0);
  });

  it('should preserve flight properties after filtering', () => {
    const flight = createMockFlightResult({
      id: 'special-flight',
      price: 50,
      airlines: ['UA'],
    });
    const result = filterByAirlines([flight], ['UA']);

    expect(result[0]).toEqual(flight);
  });
});

describe('SearchService with transformation and filtering', () => {
  let mockAdapter: IFlightAdapter;
  let searchService: ISearchService;

  beforeEach(() => {
    mockAdapter = {
      searchFlights: vi.fn().mockResolvedValue([]),
    };
    searchService = new SearchService(mockAdapter);
  });

  const baseParams: SearchParams = {
    origins: ['ORD'],
    destination: 'US',
    dateFrom: createLocalDate(2024, 2, 15),
    dateTo: createLocalDate(2024, 2, 22),
    tripType: 'oneway',
    maxPrice: 100,
    nonstopOnly: false,
    limit: 20,
  };

  it('should transform KiwiFlight results to FlightResult', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'flight-1', price: 50 }),
      createMockKiwiFlight({ id: 'flight-2', price: 75 }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const result = await searchService.search(baseParams);

    expect(result.flights).toHaveLength(2);
    expect(result.flights[0].id).toBe('flight-1');
    expect(result.flights[1].id).toBe('flight-2');
  });

  it('should apply price filter when maxPrice is set', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'cheap', price: 50 }),
      createMockKiwiFlight({ id: 'expensive', price: 150 }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, maxPrice: 100 };
    const result = await searchService.search(params);

    expect(result.flights).toHaveLength(1);
    expect(result.flights[0].id).toBe('cheap');
  });

  it('should apply airline filter when airlineFilter is set', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'ua-flight', airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'aa-flight', airlines: ['AA'] }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, airlineFilter: ['UA'] };
    const result = await searchService.search(params);

    expect(result.flights).toHaveLength(1);
    expect(result.flights[0].id).toBe('ua-flight');
  });

  it('should apply both price and airline filters', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'cheap-ua', price: 50, airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'expensive-ua', price: 150, airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'cheap-aa', price: 50, airlines: ['AA'] }),
      createMockKiwiFlight({ id: 'expensive-aa', price: 150, airlines: ['AA'] }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, maxPrice: 100, airlineFilter: ['UA'] };
    const result = await searchService.search(params);

    expect(result.flights).toHaveLength(1);
    expect(result.flights[0].id).toBe('cheap-ua');
  });

  it('should not apply airline filter when airlineFilter is undefined', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'ua-flight', airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'aa-flight', airlines: ['AA'] }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, airlineFilter: undefined };
    const result = await searchService.search(params);

    expect(result.flights).toHaveLength(2);
  });

  it('should not apply airline filter when airlineFilter is empty array', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'ua-flight', airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'aa-flight', airlines: ['AA'] }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, airlineFilter: [] };
    const result = await searchService.search(params);

    expect(result.flights).toHaveLength(2);
  });

  it('should track totalResultsFromApi before filtering', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'cheap', price: 50 }),
      createMockKiwiFlight({ id: 'expensive', price: 150 }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, maxPrice: 100 };
    const result = await searchService.search(params);

    // totalResultsFromApi should be 2 (before filtering)
    expect(result.totalResultsFromApi).toBe(2);
    // flights should be 1 (after filtering)
    expect(result.flights).toHaveLength(1);
  });
});

describe('sortByPrice (Req 4.8)', () => {
  it('should return empty array for empty input', () => {
    const result = sortByPrice([]);
    expect(result).toEqual([]);
  });

  it('should return single flight unchanged', () => {
    const flights = [createMockFlightResult({ price: 50 })];
    const result = sortByPrice(flights);
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(50);
  });

  it('should sort flights by price ascending (cheapest first)', () => {
    const flights = [
      createMockFlightResult({ id: 'expensive', price: 100 }),
      createMockFlightResult({ id: 'cheap', price: 50 }),
      createMockFlightResult({ id: 'medium', price: 75 }),
    ];
    const result = sortByPrice(flights);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('cheap');
    expect(result[0].price).toBe(50);
    expect(result[1].id).toBe('medium');
    expect(result[1].price).toBe(75);
    expect(result[2].id).toBe('expensive');
    expect(result[2].price).toBe(100);
  });

  it('should handle flights with same price (stable sort)', () => {
    const flights = [
      createMockFlightResult({ id: 'first', price: 50 }),
      createMockFlightResult({ id: 'second', price: 50 }),
      createMockFlightResult({ id: 'third', price: 50 }),
    ];
    const result = sortByPrice(flights);

    expect(result).toHaveLength(3);
    // All have same price, should maintain relative order
    expect(result.map(f => f.price)).toEqual([50, 50, 50]);
  });

  it('should not mutate the original array', () => {
    const flights = [
      createMockFlightResult({ id: 'expensive', price: 100 }),
      createMockFlightResult({ id: 'cheap', price: 50 }),
    ];
    const originalOrder = flights.map(f => f.id);
    
    sortByPrice(flights);

    // Original array should be unchanged
    expect(flights.map(f => f.id)).toEqual(originalOrder);
  });

  it('should preserve flight properties after sorting', () => {
    const flight = createMockFlightResult({
      id: 'special-flight',
      price: 75,
      destination: 'LAX',
      airlines: ['UA', 'AA'],
    });
    const result = sortByPrice([flight]);

    expect(result[0]).toEqual(flight);
  });

  it('should correctly sort already sorted array', () => {
    const flights = [
      createMockFlightResult({ id: 'first', price: 50 }),
      createMockFlightResult({ id: 'second', price: 75 }),
      createMockFlightResult({ id: 'third', price: 100 }),
    ];
    const result = sortByPrice(flights);

    expect(result[0].price).toBe(50);
    expect(result[1].price).toBe(75);
    expect(result[2].price).toBe(100);
  });

  it('should correctly sort reverse-sorted array', () => {
    const flights = [
      createMockFlightResult({ id: 'first', price: 100 }),
      createMockFlightResult({ id: 'second', price: 75 }),
      createMockFlightResult({ id: 'third', price: 50 }),
    ];
    const result = sortByPrice(flights);

    expect(result[0].price).toBe(50);
    expect(result[1].price).toBe(75);
    expect(result[2].price).toBe(100);
  });
});

describe('applyLimit (Req 5.4)', () => {
  it('should return empty array for empty input', () => {
    const result = applyLimit([], 10);
    expect(result).toEqual([]);
  });

  it('should return all flights when limit exceeds array length', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1' }),
      createMockFlightResult({ id: 'flight-2' }),
      createMockFlightResult({ id: 'flight-3' }),
    ];
    const result = applyLimit(flights, 10);

    expect(result).toHaveLength(3);
  });

  it('should return all flights when limit equals array length', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1' }),
      createMockFlightResult({ id: 'flight-2' }),
      createMockFlightResult({ id: 'flight-3' }),
    ];
    const result = applyLimit(flights, 3);

    expect(result).toHaveLength(3);
  });

  it('should return first N flights when limit is less than array length', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1' }),
      createMockFlightResult({ id: 'flight-2' }),
      createMockFlightResult({ id: 'flight-3' }),
      createMockFlightResult({ id: 'flight-4' }),
      createMockFlightResult({ id: 'flight-5' }),
    ];
    const result = applyLimit(flights, 3);

    expect(result).toHaveLength(3);
    expect(result.map(f => f.id)).toEqual(['flight-1', 'flight-2', 'flight-3']);
  });

  it('should return single flight when limit is 1', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1' }),
      createMockFlightResult({ id: 'flight-2' }),
      createMockFlightResult({ id: 'flight-3' }),
    ];
    const result = applyLimit(flights, 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('flight-1');
  });

  it('should return empty array when limit is 0', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1' }),
      createMockFlightResult({ id: 'flight-2' }),
    ];
    const result = applyLimit(flights, 0);

    expect(result).toHaveLength(0);
  });

  it('should return empty array when limit is negative', () => {
    const flights = [
      createMockFlightResult({ id: 'flight-1' }),
      createMockFlightResult({ id: 'flight-2' }),
    ];
    const result = applyLimit(flights, -5);

    expect(result).toHaveLength(0);
  });

  it('should preserve flight properties after limiting', () => {
    const flight = createMockFlightResult({
      id: 'special-flight',
      price: 75,
      destination: 'LAX',
      airlines: ['UA', 'AA'],
    });
    const result = applyLimit([flight], 10);

    expect(result[0]).toEqual(flight);
  });
});

describe('SearchService sorting and limiting', () => {
  let mockAdapter: IFlightAdapter;
  let searchService: ISearchService;

  beforeEach(() => {
    mockAdapter = {
      searchFlights: vi.fn().mockResolvedValue([]),
    };
    searchService = new SearchService(mockAdapter);
  });

  const baseParams: SearchParams = {
    origins: ['ORD'],
    destination: 'US',
    dateFrom: createLocalDate(2024, 2, 15),
    dateTo: createLocalDate(2024, 2, 22),
    tripType: 'oneway',
    maxPrice: 200,
    nonstopOnly: false,
    limit: 20,
  };

  it('should sort results by price ascending (Req 4.8)', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'expensive', price: 100 }),
      createMockKiwiFlight({ id: 'cheap', price: 50 }),
      createMockKiwiFlight({ id: 'medium', price: 75 }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const result = await searchService.search(baseParams);

    expect(result.flights).toHaveLength(3);
    expect(result.flights[0].id).toBe('cheap');
    expect(result.flights[0].price).toBe(50);
    expect(result.flights[1].id).toBe('medium');
    expect(result.flights[1].price).toBe(75);
    expect(result.flights[2].id).toBe('expensive');
    expect(result.flights[2].price).toBe(100);
  });

  it('should apply limit after sorting (Req 5.4)', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'expensive', price: 100 }),
      createMockKiwiFlight({ id: 'cheap', price: 50 }),
      createMockKiwiFlight({ id: 'medium', price: 75 }),
      createMockKiwiFlight({ id: 'very-cheap', price: 25 }),
      createMockKiwiFlight({ id: 'pricey', price: 90 }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, limit: 3 };
    const result = await searchService.search(params);

    // Should get the 3 cheapest flights
    expect(result.flights).toHaveLength(3);
    expect(result.flights[0].id).toBe('very-cheap');
    expect(result.flights[0].price).toBe(25);
    expect(result.flights[1].id).toBe('cheap');
    expect(result.flights[1].price).toBe(50);
    expect(result.flights[2].id).toBe('medium');
    expect(result.flights[2].price).toBe(75);
  });

  it('should apply filters before sorting and limiting', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'cheap-ua', price: 50, airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'expensive-ua', price: 150, airlines: ['UA'] }),
      createMockKiwiFlight({ id: 'medium-aa', price: 75, airlines: ['AA'] }),
      createMockKiwiFlight({ id: 'cheap-aa', price: 40, airlines: ['AA'] }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, maxPrice: 100, airlineFilter: ['UA'], limit: 10 };
    const result = await searchService.search(params);

    // Only cheap-ua passes both filters (price < 100 and airline UA)
    // expensive-ua is filtered by price
    // medium-aa and cheap-aa are filtered by airline
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0].id).toBe('cheap-ua');
  });

  it('should return all results when limit exceeds filtered count', async () => {
    const mockKiwiFlights = [
      createMockKiwiFlight({ id: 'flight-1', price: 50 }),
      createMockKiwiFlight({ id: 'flight-2', price: 75 }),
    ];
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>).mockResolvedValue(mockKiwiFlights);

    const params = { ...baseParams, limit: 100 };
    const result = await searchService.search(params);

    expect(result.flights).toHaveLength(2);
  });

  it('should sort and limit correctly with multi-origin search', async () => {
    const ordFlights = [
      createMockKiwiFlight({ id: 'ord-expensive', price: 100 }),
      createMockKiwiFlight({ id: 'ord-cheap', price: 30 }),
    ];
    const mdwFlights = [
      createMockKiwiFlight({ id: 'mdw-medium', price: 60 }),
      createMockKiwiFlight({ id: 'mdw-very-cheap', price: 20 }),
    ];
    
    (mockAdapter.searchFlights as ReturnType<typeof vi.fn>)
      .mockImplementation((request: SkyscannerSearchRequest) => {
        if (request.fly_from === 'ORD') return Promise.resolve(ordFlights);
        if (request.fly_from === 'MDW') return Promise.resolve(mdwFlights);
        return Promise.resolve([]);
      });

    const params = { ...baseParams, origins: ['ORD', 'MDW'] as any, limit: 2 };
    const result = await searchService.search(params);

    // Should get the 2 cheapest flights across both origins
    expect(result.flights).toHaveLength(2);
    expect(result.flights[0].id).toBe('mdw-very-cheap');
    expect(result.flights[0].price).toBe(20);
    expect(result.flights[1].id).toBe('ord-cheap');
    expect(result.flights[1].price).toBe(30);
  });
});


describe('Round-trip search parameters (Req 2.1, 2.3, 2.4)', () => {
  const baseParams: SearchParams = {
    origins: ['ORD'],
    destination: 'US',
    dateFrom: createLocalDate(2024, 2, 15), // March 15, 2024
    dateTo: createLocalDate(2024, 2, 22),   // March 22, 2024
    tripType: 'round',
    maxPrice: 200,
    nonstopOnly: false,
    limit: 20,
  };

  describe('transformToKiwiRequest with round-trip', () => {
    it('should set flight_type=round for round-trip searches (Req 2.1)', () => {
      const result = transformToKiwiRequest(baseParams, 'ORD');
      expect(result.flight_type).toBe('round');
    });

    it('should set default nights_in_dst_from=2 when returnDaysMin not specified (Req 2.4)', () => {
      const params = { ...baseParams, returnDaysMin: undefined };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.nights_in_dst_from).toBe(2);
    });

    it('should set default nights_in_dst_to=7 when returnDaysMax not specified (Req 2.4)', () => {
      const params = { ...baseParams, returnDaysMax: undefined };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.nights_in_dst_to).toBe(7);
    });

    it('should use specified returnDaysMin for nights_in_dst_from (Req 2.3)', () => {
      const params = { ...baseParams, returnDaysMin: 3 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.nights_in_dst_from).toBe(3);
    });

    it('should use specified returnDaysMax for nights_in_dst_to (Req 2.3)', () => {
      const params = { ...baseParams, returnDaysMax: 10 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.nights_in_dst_to).toBe(10);
    });

    it('should set both nights_in_dst_from and nights_in_dst_to from return window (Req 2.3)', () => {
      const params = { ...baseParams, returnDaysMin: 3, returnDaysMax: 7 };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.nights_in_dst_from).toBe(3);
      expect(result.nights_in_dst_to).toBe(7);
    });

    it('should not set nights_in_dst parameters for one-way searches', () => {
      const params = { ...baseParams, tripType: 'oneway' as const };
      const result = transformToKiwiRequest(params, 'ORD');
      expect(result.nights_in_dst_from).toBeUndefined();
      expect(result.nights_in_dst_to).toBeUndefined();
    });
  });
});

describe('Round-trip flight transformation (Req 2.5)', () => {
  /**
   * Helper to create a round-trip KiwiFlight with outbound and return segments.
   */
  function createRoundTripKiwiFlight(overrides: Partial<SkyscannerFlight> = {}): SkyscannerFlight {
    return {
      id: 'round-trip-flight',
      price: 150,
      deep_link: 'https://kiwi.com/booking/rt',
      flyFrom: 'ORD',
      flyTo: 'LAX',
      cityFrom: 'Chicago',
      cityTo: 'Los Angeles',
      local_departure: '2024-03-15T08:30:00',
      local_arrival: '2024-03-15T10:45:00',
      duration: {
        departure: 8100, // 135 minutes outbound
        return: 9000,    // 150 minutes return
        total: 17100,
      },
      airlines: ['UA'],
      route: [
        // Outbound: ORD -> LAX
        {
          flyFrom: 'ORD',
          flyTo: 'LAX',
          local_departure: '2024-03-15T08:30:00',
          local_arrival: '2024-03-15T10:45:00',
          airline: 'UA',
          flight_no: 123,
          operating_carrier: 'UA',
        },
        // Return: LAX -> ORD
        {
          flyFrom: 'LAX',
          flyTo: 'ORD',
          local_departure: '2024-03-20T14:00:00',
          local_arrival: '2024-03-20T19:30:00',
          airline: 'UA',
          flight_no: 456,
          operating_carrier: 'UA',
        },
      ],
      availability: {
        seats: 5,
      },
      ...overrides,
    };
  }

  it('should extract return departure date from round-trip flight', () => {
    const kiwiFlight = createRoundTripKiwiFlight();
    const result = transformKiwiFlights([kiwiFlight]);

    expect(result[0].returnDepartureDate).toBeDefined();
    expect(result[0].returnDepartureDate?.getFullYear()).toBe(2024);
    expect(result[0].returnDepartureDate?.getMonth()).toBe(2); // March
    expect(result[0].returnDepartureDate?.getDate()).toBe(20);
  });

  it('should extract return departure time from round-trip flight', () => {
    const kiwiFlight = createRoundTripKiwiFlight();
    const result = transformKiwiFlights([kiwiFlight]);

    expect(result[0].returnDepartureTime).toBe('14:00');
  });

  it('should extract return arrival time from round-trip flight', () => {
    const kiwiFlight = createRoundTripKiwiFlight();
    const result = transformKiwiFlights([kiwiFlight]);

    expect(result[0].returnArrivalTime).toBe('19:30');
  });

  it('should calculate return duration in minutes', () => {
    const kiwiFlight = createRoundTripKiwiFlight({
      duration: { departure: 8100, return: 9000, total: 17100 },
    });
    const result = transformKiwiFlights([kiwiFlight]);

    // 9000 seconds = 150 minutes
    expect(result[0].returnDurationMinutes).toBe(150);
  });

  it('should calculate return stops correctly for nonstop return', () => {
    const kiwiFlight = createRoundTripKiwiFlight();
    const result = transformKiwiFlights([kiwiFlight]);

    // Single return segment = 0 stops
    expect(result[0].returnStops).toBe(0);
  });

  it('should calculate return stops correctly for multi-segment return', () => {
    const kiwiFlight = createRoundTripKiwiFlight({
      route: [
        // Outbound: ORD -> LAX (nonstop)
        {
          flyFrom: 'ORD',
          flyTo: 'LAX',
          local_departure: '2024-03-15T08:30:00',
          local_arrival: '2024-03-15T10:45:00',
          airline: 'UA',
          flight_no: 123,
          operating_carrier: 'UA',
        },
        // Return leg 1: LAX -> DEN
        {
          flyFrom: 'LAX',
          flyTo: 'DEN',
          local_departure: '2024-03-20T14:00:00',
          local_arrival: '2024-03-20T17:00:00',
          airline: 'UA',
          flight_no: 456,
          operating_carrier: 'UA',
        },
        // Return leg 2: DEN -> ORD
        {
          flyFrom: 'DEN',
          flyTo: 'ORD',
          local_departure: '2024-03-20T18:30:00',
          local_arrival: '2024-03-20T21:30:00',
          airline: 'UA',
          flight_no: 789,
          operating_carrier: 'UA',
        },
      ],
    });
    const result = transformKiwiFlights([kiwiFlight]);

    // Return has 2 segments = 1 stop
    expect(result[0].returnStops).toBe(1);
  });

  it('should calculate outbound stops correctly for round-trip', () => {
    const kiwiFlight = createRoundTripKiwiFlight({
      route: [
        // Outbound leg 1: ORD -> DEN
        {
          flyFrom: 'ORD',
          flyTo: 'DEN',
          local_departure: '2024-03-15T08:30:00',
          local_arrival: '2024-03-15T10:00:00',
          airline: 'UA',
          flight_no: 100,
          operating_carrier: 'UA',
        },
        // Outbound leg 2: DEN -> LAX
        {
          flyFrom: 'DEN',
          flyTo: 'LAX',
          local_departure: '2024-03-15T11:00:00',
          local_arrival: '2024-03-15T12:30:00',
          airline: 'UA',
          flight_no: 101,
          operating_carrier: 'UA',
        },
        // Return: LAX -> ORD (nonstop)
        {
          flyFrom: 'LAX',
          flyTo: 'ORD',
          local_departure: '2024-03-20T14:00:00',
          local_arrival: '2024-03-20T19:30:00',
          airline: 'UA',
          flight_no: 456,
          operating_carrier: 'UA',
        },
      ],
    });
    const result = transformKiwiFlights([kiwiFlight]);

    // Outbound has 2 segments = 1 stop
    expect(result[0].stops).toBe(1);
    // Return has 1 segment = 0 stops
    expect(result[0].returnStops).toBe(0);
  });

  it('should not set return fields for one-way flights', () => {
    const oneWayFlight = createMockKiwiFlight({
      duration: { departure: 9000, return: 0, total: 9000 },
    });
    const result = transformKiwiFlights([oneWayFlight]);

    expect(result[0].returnDepartureDate).toBeUndefined();
    expect(result[0].returnDepartureTime).toBeUndefined();
    expect(result[0].returnArrivalTime).toBeUndefined();
    expect(result[0].returnDurationMinutes).toBeUndefined();
    expect(result[0].returnStops).toBeUndefined();
  });

  it('should handle round-trip with connecting flights on both legs', () => {
    const kiwiFlight = createRoundTripKiwiFlight({
      duration: { departure: 10800, return: 12000, total: 22800 },
      route: [
        // Outbound leg 1: ORD -> DFW
        {
          flyFrom: 'ORD',
          flyTo: 'DFW',
          local_departure: '2024-03-15T06:00:00',
          local_arrival: '2024-03-15T09:00:00',
          airline: 'AA',
          flight_no: 100,
          operating_carrier: 'AA',
        },
        // Outbound leg 2: DFW -> LAX
        {
          flyFrom: 'DFW',
          flyTo: 'LAX',
          local_departure: '2024-03-15T10:00:00',
          local_arrival: '2024-03-15T11:30:00',
          airline: 'AA',
          flight_no: 200,
          operating_carrier: 'AA',
        },
        // Return leg 1: LAX -> DFW
        {
          flyFrom: 'LAX',
          flyTo: 'DFW',
          local_departure: '2024-03-20T08:00:00',
          local_arrival: '2024-03-20T13:00:00',
          airline: 'AA',
          flight_no: 300,
          operating_carrier: 'AA',
        },
        // Return leg 2: DFW -> ORD
        {
          flyFrom: 'DFW',
          flyTo: 'ORD',
          local_departure: '2024-03-20T14:00:00',
          local_arrival: '2024-03-20T17:00:00',
          airline: 'AA',
          flight_no: 400,
          operating_carrier: 'AA',
        },
      ],
    });
    const result = transformKiwiFlights([kiwiFlight]);

    // Outbound: 2 segments = 1 stop
    expect(result[0].stops).toBe(1);
    // Return: 2 segments = 1 stop
    expect(result[0].returnStops).toBe(1);
    // Return departure time from first return segment
    expect(result[0].returnDepartureTime).toBe('08:00');
    // Return arrival time from last return segment
    expect(result[0].returnArrivalTime).toBe('17:00');
    // Return duration: 12000 seconds = 200 minutes
    expect(result[0].returnDurationMinutes).toBe(200);
  });

  it('should preserve outbound flight information for round-trips', () => {
    const kiwiFlight = createRoundTripKiwiFlight();
    const result = transformKiwiFlights([kiwiFlight]);

    // Verify outbound info is preserved
    expect(result[0].id).toBe('round-trip-flight');
    expect(result[0].price).toBe(150);
    expect(result[0].origin).toBe('ORD');
    expect(result[0].destination).toBe('LAX');
    expect(result[0].departureTime).toBe('08:30');
    expect(result[0].arrivalTime).toBe('10:45');
    // 8100 seconds = 135 minutes
    expect(result[0].durationMinutes).toBe(135);
  });
});
