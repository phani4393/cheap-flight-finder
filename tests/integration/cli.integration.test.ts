/**
 * Integration tests for CLI end-to-end flow.
 * Tests the full CLI pipeline from argument parsing through API calls to output.
 * Uses nock for HTTP mocking to avoid real API calls.
 *
 * Validates: All Requirements (end-to-end integration)
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import nock from 'nock';
import { addDays, format } from 'date-fns';
import * as fs from 'fs/promises';
import * as path from 'path';

import { loadConfig } from '../../src/config.js';
import { validateOptions, buildSearchParams, displayResults, handleExport } from '../../src/cli.js';
import { SearchService } from '../../src/services/search.js';
import { SkyscannerAdapter } from '../../src/adapters/skyscanner.js';
import { RetryHandler } from '../../src/utils/retry.js';
import { formatNoResults } from '../../src/formatters/table.js';
import type { CLIOptions } from '../../src/cli.js';
import type { SearchParams } from '../../src/types.js';

const API_BASE_URL = 'https://flight-scanner10.p.rapidapi.com';
const TEST_API_KEY = 'test-rapidapi-key-integration';

/**
 * Helper to get a future date string in YYYY-MM-DD format.
 */
function getFutureDate(daysAhead: number): string {
  return format(addDays(new Date(), daysAhead), 'yyyy-MM-dd');
}

/**
 * Creates a mock Skyscanner searchFlights API response with flight results.
 */
function createMockSearchResponse(flights: Array<{
  id: string;
  price: number;
  origin: string;
  destination: string;
  originCity?: string;
  destinationCity?: string;
  departure?: string;
  arrival?: string;
  durationMinutes?: number;
  stopCount?: number;
  airline?: string;
}>) {
  const itineraries = flights.map((f) => ({
    id: f.id,
    price: { raw: f.price, formatted: `$${f.price}` },
    legs: [
      {
        origin: { id: f.origin, name: f.originCity ?? 'Chicago', city: f.originCity ?? 'Chicago' },
        destination: { id: f.destination, name: f.destinationCity ?? 'Test City', city: f.destinationCity ?? 'Test City' },
        departure: f.departure ?? '2024-06-15T08:00:00',
        arrival: f.arrival ?? '2024-06-15T11:00:00',
        durationInMinutes: f.durationMinutes ?? 180,
        stopCount: f.stopCount ?? 0,
        carriers: {
          marketing: [{ id: 1, name: f.airline ?? 'Spirit', alternateId: f.airline ?? 'NK' }],
        },
        segments: [
          {
            origin: { flightPlaceId: f.origin },
            destination: { flightPlaceId: f.destination },
            departure: f.departure ?? '2024-06-15T08:00:00',
            arrival: f.arrival ?? '2024-06-15T11:00:00',
            marketingCarrier: { alternateId: f.airline ?? 'NK', name: f.airline ?? 'Spirit' },
            flightNumber: '123',
            operatingCarrier: { alternateId: f.airline ?? 'NK' },
          },
        ],
      },
    ],
  }));

  return {
    status: true,
    data: {
      itineraries,
      context: { status: 'complete', sessionId: 'test-session' },
    },
  };
}

/**
 * Creates an empty search response (no flights found).
 */
function createEmptySearchResponse() {
  return {
    status: true,
    data: {
      itineraries: [],
      context: { status: 'complete', sessionId: 'test-session' },
    },
  };
}

/**
 * Creates a mock countryDestination response with cheap city results.
 */
function createMockCountryDestinationResponse(cities: Array<{
  entityId: string;
  city: string;
  price: number;
}>) {
  const results: Record<string, unknown> = {};
  cities.forEach((city, i) => {
    results[`result-${i}`] = {
      content: { location: { name: city.city } },
      destinationEntityId: city.entityId,
      flightQuote: { rawPrice: city.price },
    };
  });

  return {
    status: true,
    data: {
      countryDestination: { results },
    },
  };
}

/**
 * Builds a default set of CLI options for testing.
 */
function createTestOptions(overrides: Partial<CLIOptions> = {}): CLIOptions {
  return {
    from: 'ORD',
    roundTrip: false,
    nonstop: false,
    limit: 20,
    showLinks: false,
    seat: 'economy',
    adults: 1,
    excludeBasicEconomy: false,
    ...overrides,
  };
}

/**
 * Creates the full search pipeline (adapter + service) for integration testing.
 */
function createSearchPipeline(apiKey: string = TEST_API_KEY, baseUrl: string = API_BASE_URL) {
  const retryHandler = new RetryHandler();
  const adapter = new SkyscannerAdapter(apiKey, retryHandler, baseUrl);
  const searchService = new SearchService(adapter);
  return searchService;
}

describe('CLI Integration Tests', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Happy path: search returns results', () => {
    it('should find flights when API returns results for a specific destination', async () => {
      const futureDate = getFutureDate(7);

      // Mock searchAirport to resolve LAX entity ID
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27544850' } },
          ],
        });

      // Mock searchFlights for specific destination
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .reply(200, createMockSearchResponse([
          {
            id: 'flight-lax-1',
            price: 58,
            origin: 'ORD',
            destination: 'LAX',
            destinationCity: 'Los Angeles',
            departure: `${futureDate}T09:00:00`,
            arrival: `${futureDate}T11:10:00`,
            durationMinutes: 250,
            stopCount: 0,
            airline: 'NK',
          },
          {
            id: 'flight-lax-2',
            price: 73,
            origin: 'ORD',
            destination: 'LAX',
            destinationCity: 'Los Angeles',
            departure: `${futureDate}T14:00:00`,
            arrival: `${futureDate}T16:10:00`,
            durationMinutes: 250,
            stopCount: 0,
            airline: 'F9',
          },
        ]));

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAX',
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline();
      const result = await searchService.search(searchParams);

      // Verify flights were returned
      expect(result.flights.length).toBeGreaterThan(0);
      expect(result.flights[0]!.destination).toBe('LAX');
      expect(result.flights[0]!.price).toBe(58);

      // Verify results are sorted by price
      for (let i = 1; i < result.flights.length; i++) {
        expect(result.flights[i]!.price).toBeGreaterThanOrEqual(result.flights[i - 1]!.price);
      }
    });

    it('should display results in formatted table output', async () => {
      const futureDate = getFutureDate(7);

      // Mock searchAirport
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27536671' } },
          ],
        });

      // Mock searchFlights
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .reply(200, createMockSearchResponse([
          {
            id: 'display-flight-1',
            price: 52,
            origin: 'ORD',
            destination: 'LAS',
            destinationCity: 'Las Vegas',
            departure: `${futureDate}T06:30:00`,
            arrival: `${futureDate}T09:15:00`,
            durationMinutes: 165,
            stopCount: 0,
            airline: 'NK',
          },
        ]));

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAS',
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline();
      const result = await searchService.search(searchParams);

      // Capture console output
      let output = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        output += args.map(String).join(' ') + '\n';
      };

      displayResults(result.flights, searchParams, options);

      console.log = originalLog;

      // Verify output contains flight information
      expect(output).toContain('Found');
      expect(output).toContain('$52');
      expect(output).toContain('Prices may differ on booking site');
    });
  });

  describe('Error path: invalid API key', () => {
    it('should throw ApiError when API returns 401 for invalid key', async () => {
      const futureDate = getFutureDate(5);

      // Mock searchAirport for destination resolution
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27544850' } },
          ],
        });

      // Mock searchFlights to return 401 (invalid API key)
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .times(5)
        .reply(401, { message: 'Unauthorized' });

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAX', // Use specific destination to avoid country-level fallback
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline('invalid-api-key');

      try {
        await searchService.search(searchParams);
        expect.fail('Should have thrown an error');
      } catch (error: unknown) {
        const err = error as Error;
        expect(err.message).toContain('Invalid API key');
      }
    });

    it('should not throw ConfigError when no API key is provided (no longer required)', () => {
      // loadConfig no longer requires an API key since we migrated to Google Flights scraping
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(config.googleFlightsBaseUrl).toBe('https://www.google.com/travel/flights');
    });
  });

  describe('No results handling', () => {
    it('should return empty results when no flights match criteria', async () => {
      const futureDate = getFutureDate(5);

      // Mock searchAirport
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27544850' } },
          ],
        });

      // Mock searchFlights returning empty
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .reply(200, createEmptySearchResponse());

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAX',
        maxPrice: 50,
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline();
      const result = await searchService.search(searchParams);

      expect(result.flights).toHaveLength(0);
    });

    it('should display "No flights found" message when search returns empty', async () => {
      const futureDate = getFutureDate(5);

      // Mock searchAirport
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27544850' } },
          ],
        });

      // Mock searchFlights returning empty
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .reply(200, createEmptySearchResponse());

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAX',
        maxPrice: 50,
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline();
      const result = await searchService.search(searchParams);

      // Capture console output
      let output = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        output += args.map(String).join(' ') + '\n';
      };

      displayResults(result.flights, searchParams, options);

      console.log = originalLog;

      // Verify no-results message
      expect(output).toContain('No flights found under $50 for your search criteria');
      expect(output).toContain('Try expanding your date range');
    });
  });

  describe('Export functionality', () => {
    const exportPath = path.join(process.cwd(), 'test-export-integration.csv');

    afterEach(async () => {
      try {
        await fs.unlink(exportPath);
      } catch {
        // File might not exist
      }
    });

    it('should export results to CSV file', async () => {
      const futureDate = getFutureDate(5);

      // Mock searchAirport
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27536671' } },
          ],
        });

      // Mock searchFlights with results
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .reply(200, createMockSearchResponse([
          {
            id: 'export-flight-1',
            price: 47,
            origin: 'ORD',
            destination: 'LAS',
            destinationCity: 'Las Vegas',
            departure: `${futureDate}T06:30:00`,
            arrival: `${futureDate}T09:15:00`,
            durationMinutes: 165,
            stopCount: 0,
            airline: 'NK',
          },
          {
            id: 'export-flight-2',
            price: 63,
            origin: 'ORD',
            destination: 'LAS',
            destinationCity: 'Las Vegas',
            departure: `${futureDate}T14:00:00`,
            arrival: `${futureDate}T16:45:00`,
            durationMinutes: 165,
            stopCount: 0,
            airline: 'F9',
          },
        ]));

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAS',
        export: exportPath,
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline();
      const result = await searchService.search(searchParams);

      // Perform export
      let exportOutput = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        exportOutput += args.map(String).join(' ') + '\n';
      };

      await handleExport(result.flights, exportPath, searchParams);

      console.log = originalLog;

      // Verify export success message
      expect(exportOutput).toContain('Exported');
      expect(exportOutput).toContain('results to');

      // Verify CSV file was created
      const csvContent = await fs.readFile(exportPath, 'utf-8');
      expect(csvContent).toBeTruthy();

      // Verify CSV header row
      expect(csvContent).toContain('price');
      expect(csvContent).toContain('origin');
      expect(csvContent).toContain('destination');
      expect(csvContent).toContain('departure_date');
      expect(csvContent).toContain('booking_url');

      // Verify CSV contains data rows (header + 2 data rows = 3 lines)
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBe(3);
    });

    it('should export CSV with only header when no results found', async () => {
      const futureDate = getFutureDate(5);

      // Mock searchAirport
      nock(API_BASE_URL)
        .get('/api/v3/flights/searchAirport')
        .query(true)
        .reply(200, {
          status: true,
          data: [
            { navigation: { entityType: 'AIRPORT', entityId: '27536671' } },
          ],
        });

      // Mock searchFlights returning empty
      nock(API_BASE_URL)
        .post('/api/v3/flights/searchFlights')
        .reply(200, createEmptySearchResponse());

      const options = createTestOptions({
        from: 'ORD',
        date: futureDate,
        destination: 'LAS',
        export: exportPath,
      });

      const validatedDates = validateOptions(options);
      const config = loadConfig();
      const searchParams = buildSearchParams(options, validatedDates, config);
      const searchService = createSearchPipeline();
      const result = await searchService.search(searchParams);

      // Capture export output
      const originalLog = console.log;
      console.log = () => {};

      await handleExport(result.flights, exportPath, searchParams);

      console.log = originalLog;

      // Verify CSV file was created
      const csvContent = await fs.readFile(exportPath, 'utf-8');
      expect(csvContent).toBeTruthy();

      // Should have only header row
      const lines = csvContent.trim().split('\n');
      expect(lines.length).toBe(1);
      expect(lines[0]).toContain('price');
    });
  });

  describe('Input validation', () => {
    it('should reject past dates with validation error', () => {
      const options = createTestOptions({
        date: '2020-01-01',
      });

      expect(() => validateOptions(options)).toThrow('Departure date must be today or a future date');
    });

    it('should reject date range exceeding 30 days', () => {
      const dateFrom = getFutureDate(1);
      const dateTo = getFutureDate(35);

      const options = createTestOptions({
        dateFrom,
        dateTo,
      });

      expect(() => validateOptions(options)).toThrow('Date range cannot exceed 30 days');
    });

    it('should reject invalid airport codes', () => {
      const options = createTestOptions({
        from: 'XYZ' as 'ORD',
      });

      expect(() => validateOptions(options)).toThrow('Invalid airport code');
    });

    it('should accept valid future date options', () => {
      const futureDate = getFutureDate(5);
      const options = createTestOptions({
        date: futureDate,
      });

      const result = validateOptions(options);
      expect(result.dateFrom).toBeInstanceOf(Date);
      expect(result.dateTo).toBeInstanceOf(Date);
    });
  });
});
