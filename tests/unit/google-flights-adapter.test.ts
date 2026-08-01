/**
 * GoogleFlightsAdapter Unit Tests
 * Tests for the Google Flights adapter orchestration flow including
 * HTTP response handling, retry behavior, blocking detection, and error handling.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 11.1, 11.2, 11.3, 11.4
 */

import { vi } from 'vitest';
import nock from 'nock';
import { GoogleFlightsAdapter } from '../../src/adapters/google-flights/adapter.js';
import { IRetryHandler, RetryConfig } from '../../src/utils/retry.js';
import { IProtobufEncoder, GoogleFlightsQueryParams } from '../../src/adapters/google-flights/protobuf-encoder.js';
import { IFlightResponseParser, ParsedFlight } from '../../src/adapters/google-flights/response-parser.js';
import { ApiError } from '../../src/errors.js';
import type { SkyscannerSearchRequest } from '../../src/adapters/skyscanner.js';

// --- Mock Implementations ---

class MockRetryHandler implements IRetryHandler {
  public callCount = 0;
  public lastConfig: Partial<RetryConfig> | undefined;

  async withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    this.callCount++;
    this.lastConfig = config;
    // By default, just execute the operation once (no actual retry logic)
    return operation();
  }
}

/**
 * A retry handler that actually retries on retryable errors (for testing retry delegation).
 */
class RetryingMockHandler implements IRetryHandler {
  public attempts = 0;

  async withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const maxAttempts = config?.maxAttempts ?? 3;
    let lastError: unknown;

    for (let i = 0; i < maxAttempts; i++) {
      this.attempts++;
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (error instanceof ApiError && error.statusCode && [429, 500, 502, 503, 504].includes(error.statusCode)) {
          continue; // Retry on retryable status codes
        }
        throw error; // Non-retryable, throw immediately
      }
    }
    throw lastError;
  }
}

class MockProtobufEncoder implements IProtobufEncoder {
  public lastParams: GoogleFlightsQueryParams | undefined;
  public encodedValue = 'mock-tfs-encoded-value';

  encode(params: GoogleFlightsQueryParams): string {
    this.lastParams = params;
    return this.encodedValue;
  }

  decode(tfs: string): GoogleFlightsQueryParams {
    return {
      origin: 'ORD',
      destination: 'LAX',
      departureDate: '2024-06-15',
      tripType: 2,
      seatClass: 1,
      adults: 1,
    };
  }
}

class MockFlightResponseParser implements IFlightResponseParser {
  public parsedFlights: ParsedFlight[] = [];
  public lastBody: string | undefined;

  parse(responseBody: string): ParsedFlight[] {
    this.lastBody = responseBody;
    return this.parsedFlights;
  }

  static generateDeepLink(flight: ParsedFlight, tfsParam?: string): string {
    return `https://www.google.com/travel/flights/booking?tfs=${tfsParam}&curr=${flight.currency}`;
  }
}

// --- Test Helpers ---

function createSearchRequest(overrides: Partial<SkyscannerSearchRequest> = {}): SkyscannerSearchRequest {
  return {
    fly_from: 'ORD',
    fly_to: 'LAX',
    date_from: '2024-06-15',
    date_to: '2024-06-15',
    flight_type: 'oneway',
    price_to: 500,
    curr: 'USD',
    limit: 10,
    sort: 'price',
    ...overrides,
  };
}

function createParsedFlight(overrides: Partial<ParsedFlight> = {}): ParsedFlight {
  return {
    price: 199,
    currency: 'USD',
    origin: 'ORD',
    destination: 'LAX',
    departureTime: '2024-06-15T08:30:00',
    arrivalTime: '2024-06-15T10:45:00',
    durationMinutes: 255,
    stops: 0,
    airlines: ['UA'],
    flightNumbers: ['UA1234'],
    segments: [
      {
        origin: 'ORD',
        destination: 'LAX',
        departureTime: '2024-06-15T08:30:00',
        arrivalTime: '2024-06-15T10:45:00',
        airline: 'UA',
        flightNumber: 'UA1234',
        durationMinutes: 255,
      },
    ],
    isBasicEconomy: false,
    ...overrides,
  };
}

// --- Tests ---

describe('GoogleFlightsAdapter', () => {
  let mockRetryHandler: MockRetryHandler;
  let mockEncoder: MockProtobufEncoder;
  let mockParser: MockFlightResponseParser;
  let adapter: GoogleFlightsAdapter;

  beforeEach(() => {
    mockRetryHandler = new MockRetryHandler();
    mockEncoder = new MockProtobufEncoder();
    mockParser = new MockFlightResponseParser();
    adapter = new GoogleFlightsAdapter(mockRetryHandler, mockEncoder, mockParser, 15000);
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  describe('Successful flow', () => {
    it('should return SkyscannerFlight[] when HTTP 200 and parser returns flights', async () => {
      const parsedFlights = [
        createParsedFlight({ price: 150, airlines: ['UA'] }),
        createParsedFlight({ price: 250, airlines: ['AA'], destination: 'SFO' }),
      ];
      mockParser.parsedFlights = parsedFlights;

      // Mock HTTP 200 response
      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>flight data here</html>');

      const request = createSearchRequest();
      const results = await adapter.searchFlights(request);

      // Should return flights mapped from parsed data
      expect(results.length).toBe(2);
      expect(results[0]!.price).toBe(150);
      expect(results[1]!.price).toBe(250);

      // Each result should have required SkyscannerFlight fields
      for (const flight of results) {
        expect(flight.id).toBeDefined();
        expect(flight.price).toBeGreaterThan(0);
        expect(flight.flyFrom).toBe('ORD');
        expect(flight.duration.departure).toBeGreaterThan(0);
        expect(flight.airlines.length).toBeGreaterThan(0);
        expect(flight.route.length).toBeGreaterThan(0);
      }
    });

    it('should pass encoded tfs parameter in the URL', async () => {
      mockParser.parsedFlights = [createParsedFlight()];
      mockEncoder.encodedValue = 'custom-encoded-tfs';

      const scope = nock('https://www.google.com')
        .get('/travel/flights')
        .query((query) => query['tfs'] === 'custom-encoded-tfs')
        .reply(200, '<html>data</html>');

      await adapter.searchFlights(createSearchRequest());

      expect(scope.isDone()).toBe(true);
    });

    it('should map request parameters to GoogleFlightsQueryParams correctly', async () => {
      mockParser.parsedFlights = [createParsedFlight()];

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>data</html>');

      const request = createSearchRequest({
        fly_from: 'MDW',
        fly_to: 'JFK',
        date_from: '2024-08-20',
        seat_class: 3,
        adults: 2,
        flight_type: 'oneway',
      });

      await adapter.searchFlights(request);

      expect(mockEncoder.lastParams).toEqual({
        origin: 'MDW',
        destination: 'JFK',
        departureDate: '2024-08-20',
        tripType: 2, // oneway
        seatClass: 3, // business
        adults: 2,
      });
    });

    it('should sort results by price and apply limit', async () => {
      mockParser.parsedFlights = [
        createParsedFlight({ price: 300 }),
        createParsedFlight({ price: 100 }),
        createParsedFlight({ price: 200 }),
      ];

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>data</html>');

      const request = createSearchRequest({ limit: 2, price_to: 500 });
      const results = await adapter.searchFlights(request);

      expect(results.length).toBe(2);
      expect(results[0]!.price).toBe(100);
      expect(results[1]!.price).toBe(200);
    });

    it('should filter out flights above price_to', async () => {
      mockParser.parsedFlights = [
        createParsedFlight({ price: 100 }),
        createParsedFlight({ price: 600 }), // over budget
      ];

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>data</html>');

      const request = createSearchRequest({ price_to: 500 });
      const results = await adapter.searchFlights(request);

      expect(results.length).toBe(1);
      expect(results[0]!.price).toBe(100);
    });
  });

  describe('HTTP 429 triggers retry', () => {
    it('should delegate to RetryHandler which retries on 429', async () => {
      const retryingHandler = new RetryingMockHandler();
      const adapterWithRetry = new GoogleFlightsAdapter(retryingHandler, mockEncoder, mockParser, 15000);
      mockParser.parsedFlights = [createParsedFlight()];

      // First request returns 429, second returns 200
      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(429, 'Too Many Requests');

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>flight data</html>');

      const results = await adapterWithRetry.searchFlights(createSearchRequest());

      expect(retryingHandler.attempts).toBe(2);
      expect(results.length).toBe(1);
    });

    it('should throw ApiError after all retries exhausted on 429', async () => {
      const retryingHandler = new RetryingMockHandler();
      const adapterWithRetry = new GoogleFlightsAdapter(retryingHandler, mockEncoder, mockParser, 15000);

      // All requests return 429
      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .times(3)
        .reply(429, 'Too Many Requests');

      await expect(adapterWithRetry.searchFlights(createSearchRequest()))
        .rejects.toThrow(ApiError);

      expect(retryingHandler.attempts).toBe(3);
    });
  });

  describe('HTTP 403 throws ApiError with "blocked" message', () => {
    it('should throw ApiError with blocked message on HTTP 403', async () => {
      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(403, 'Forbidden');

      try {
        await adapter.searchFlights(createSearchRequest());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('blocked');
        expect((error as ApiError).statusCode).toBe(403);
      }
    });
  });

  describe('CAPTCHA detection', () => {
    it('should throw ApiError when response body contains "recaptcha"', async () => {
      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html><div class="recaptcha">Please verify you are human</div></html>');

      try {
        await adapter.searchFlights(createSearchRequest());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message.toLowerCase()).toContain('captcha');
      }
    });

    it('should throw ApiError when response body contains "/sorry/index"', async () => {
      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>Redirect to /sorry/index because automated request</html>');

      try {
        await adapter.searchFlights(createSearchRequest());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
      }
    });
  });

  describe('Network timeout', () => {
    it('should throw ApiError on request timeout', async () => {
      // Create adapter with very short timeout
      const timeoutAdapter = new GoogleFlightsAdapter(mockRetryHandler, mockEncoder, mockParser, 50);

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .delayConnection(5000) // Delay much longer than timeout
        .reply(200, '<html>data</html>');

      try {
        await timeoutAdapter.searchFlights(createSearchRequest());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message.toLowerCase()).toMatch(/timeout|timed out|connect/);
      }
    });
  });

  describe('Empty parse result', () => {
    it('should return empty array when parser returns no flights', async () => {
      mockParser.parsedFlights = []; // Empty parse result

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, '<html>no recognizable flight data</html>');

      // Spy on console.warn to verify warning is logged
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const results = await adapter.searchFlights(createSearchRequest());

      expect(results).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No flight data extracted')
      );

      warnSpy.mockRestore();
    });

    it('should still pass response body to parser even when result is empty', async () => {
      mockParser.parsedFlights = [];
      const responseBody = '<html>some response content</html>';

      nock('https://www.google.com')
        .get('/travel/flights')
        .query(true)
        .reply(200, responseBody);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await adapter.searchFlights(createSearchRequest());

      expect(mockParser.lastBody).toBe(responseBody);

      warnSpy.mockRestore();
    });
  });
});
