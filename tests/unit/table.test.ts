/**
 * Unit tests for Table Formatter
 * Tests the formatting of flight results as terminal tables.
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 8.1, 8.3
 */

import { describe, it, expect } from 'vitest';
import {
  ResultFormatter,
  formatPrice,
  formatRoute,
  formatStops,
  formatOutput,
  formatNoResults,
  FormatOptions,
} from '../../src/formatters/table.js';
import { FlightResult, SearchParams } from '../../src/types.js';

// Helper to create a sample flight result
function createSampleFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    id: 'test-123',
    price: 67,
    origin: 'ORD',
    destination: 'LAX',
    destinationCity: 'Los Angeles',
    departureDate: new Date(2024, 2, 17), // March 17, 2024 (month is 0-indexed)
    departureTime: '06:30',
    arrivalTime: '08:45',
    durationMinutes: 255, // 4h 15m
    stops: 0,
    airlines: ['Spirit'],
    bookingUrl: 'https://kiwi.com/booking/test-123',
    ...overrides,
  };
}

// Helper to create sample search params
function createSampleParams(overrides: Partial<SearchParams> = {}): SearchParams {
  return {
    origins: ['ORD'],
    destination: 'US',
    dateFrom: new Date(2024, 2, 15), // March 15, 2024
    dateTo: new Date(2024, 2, 22),   // March 22, 2024
    tripType: 'oneway',
    maxPrice: 100,
    nonstopOnly: false,
    limit: 20,
    ...overrides,
  };
}

describe('formatPrice', () => {
  /**
   * Validates: Requirement 4.2
   * THE Flight_Finder SHALL format Price as "$XX" (e.g., "$67")
   */
  it('should format price as "$XX"', () => {
    expect(formatPrice(67)).toBe('$67');
    expect(formatPrice(100)).toBe('$100');
    expect(formatPrice(47)).toBe('$47');
  });

  it('should round decimal prices', () => {
    expect(formatPrice(67.49)).toBe('$67');
    expect(formatPrice(67.5)).toBe('$68');
    expect(formatPrice(99.99)).toBe('$100');
  });
});

describe('formatRoute', () => {
  /**
   * Validates: Requirement 4.3
   * THE Flight_Finder SHALL format Route as "ORD → LAX"
   */
  it('should format route as "ORD → LAX"', () => {
    expect(formatRoute('ORD', 'LAX')).toBe('ORD → LAX');
    expect(formatRoute('MDW', 'JFK')).toBe('MDW → JFK');
    expect(formatRoute('ORD', 'MIA')).toBe('ORD → MIA');
  });
});

describe('formatStops', () => {
  /**
   * Validates: Requirement 4.7
   * THE Flight_Finder SHALL display Stops as "Nonstop" or "1 stop" or "2 stops"
   */
  it('should format 0 stops as "Nonstop"', () => {
    expect(formatStops(0)).toBe('Nonstop');
  });

  it('should format 1 stop as "1 stop"', () => {
    expect(formatStops(1)).toBe('1 stop');
  });

  it('should format 2+ stops as "X stops"', () => {
    expect(formatStops(2)).toBe('2 stops');
    expect(formatStops(3)).toBe('3 stops');
  });
});

describe('ResultFormatter', () => {
  const formatter = new ResultFormatter();

  describe('formatFlight', () => {
    /**
     * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
     */
    it('should format a single flight correctly', () => {
      const flight = createSampleFlight();
      const row = formatter.formatFlight(flight);

      expect(row.price).toBe('$67');
      expect(row.route).toBe('ORD → LAX');
      expect(row.date).toBe('Mar 17');
      expect(row.time).toBe('6:30am');
      expect(row.airline).toBe('Spirit');
      expect(row.duration).toBe('4h 15m');
      expect(row.stops).toBe('Nonstop');
    });

    it('should handle multiple airlines', () => {
      const flight = createSampleFlight({ airlines: ['United', 'American'] });
      const row = formatter.formatFlight(flight);

      expect(row.airline).toBe('United, American');
    });

    it('should format afternoon time correctly', () => {
      const flight = createSampleFlight({ departureTime: '18:45' });
      const row = formatter.formatFlight(flight);

      expect(row.time).toBe('6:45pm');
    });

    it('should format stops correctly', () => {
      const flightNonstop = createSampleFlight({ stops: 0 });
      const flightOneStop = createSampleFlight({ stops: 1 });
      const flightTwoStops = createSampleFlight({ stops: 2 });

      expect(formatter.formatFlight(flightNonstop).stops).toBe('Nonstop');
      expect(formatter.formatFlight(flightOneStop).stops).toBe('1 stop');
      expect(formatter.formatFlight(flightTwoStops).stops).toBe('2 stops');
    });
  });

  describe('formatTable', () => {
    /**
     * Validates: Requirement 4.1
     * THE Flight_Finder SHALL display results in a formatted table
     */
    it('should return empty string for no results', () => {
      const options: FormatOptions = { showLinks: false, isRoundTrip: false };
      const result = formatter.formatTable([], options);

      expect(result).toBe('');
    });

    it('should format a table with one-way flights', () => {
      const flights = [createSampleFlight()];
      const options: FormatOptions = { showLinks: false, isRoundTrip: false };
      const result = formatter.formatTable(flights, options);

      expect(result).toContain('Price');
      expect(result).toContain('Route');
      expect(result).toContain('Date');
      expect(result).toContain('Time');
      expect(result).toContain('Airline');
      expect(result).toContain('Duration');
      expect(result).toContain('Stops');
      expect(result).toContain('$67');
      expect(result).toContain('ORD → LAX');
      expect(result).toContain('Mar 17');
      expect(result).toContain('6:30am');
      expect(result).toContain('Spirit');
      expect(result).toContain('4h 15m');
      expect(result).toContain('Nonstop');
    });

    /**
     * Validates: Requirement 8.1
     * WHEN `--show-links` flag is provided, THE Flight_Finder SHALL display the booking URL
     */
    it('should include booking URL when showLinks is true', () => {
      const flights = [createSampleFlight()];
      const options: FormatOptions = { showLinks: true, isRoundTrip: false };
      const result = formatter.formatTable(flights, options);

      expect(result).toContain('Booking URL');
      expect(result).toContain('https://kiwi.com/booking/test-123');
    });

    /**
     * Validates: Requirement 4.10
     * FOR round-trip results, THE Flight_Finder SHALL display outbound and return on two lines
     */
    it('should display round-trip flights on two lines', () => {
      const roundTripFlight = createSampleFlight({
        returnDepartureDate: new Date(2024, 2, 20), // March 20, 2024
        returnDepartureTime: '16:30',
        returnArrivalTime: '22:45',
        returnDurationMinutes: 255, // 4h 15m
        returnStops: 0,
      });
      const flights = [roundTripFlight];
      const options: FormatOptions = { showLinks: false, isRoundTrip: true };
      const result = formatter.formatTable(flights, options);

      // Check outbound
      expect(result).toContain('ORD → LAX');
      expect(result).toContain('Mar 17');

      // Check return (LAX → ORD)
      expect(result).toContain('LAX → ORD');
      expect(result).toContain('Mar 20');
      expect(result).toContain('4:30pm');
    });
  });

  describe('formatSummary', () => {
    /**
     * Validates: Requirement 4.9
     * THE Flight_Finder SHALL display a summary line showing total results and price range
     */
    it('should return empty string for no results', () => {
      const params = createSampleParams();
      const result = formatter.formatSummary([], params);

      expect(result).toBe('');
    });

    it('should format summary with price range', () => {
      const flights = [
        createSampleFlight({ price: 47 }),
        createSampleFlight({ price: 67 }),
        createSampleFlight({ price: 94 }),
      ];
      const params = createSampleParams();
      const result = formatter.formatSummary(flights, params);

      expect(result).toBe('Found 3 flights from $47 to $94');
    });

    it('should show same price when min equals max', () => {
      const flights = [
        createSampleFlight({ price: 67 }),
        createSampleFlight({ price: 67 }),
      ];
      const params = createSampleParams();
      const result = formatter.formatSummary(flights, params);

      expect(result).toBe('Found 2 flights from $67 to $67');
    });
  });
});

describe('formatOutput', () => {
  /**
   * Validates: Requirements 4.1, 4.9, 8.3
   */
  it('should include summary, table, and disclaimer', () => {
    const flights = [createSampleFlight()];
    const params = createSampleParams();
    const options: FormatOptions = { showLinks: false, isRoundTrip: false };
    const result = formatOutput(flights, params, options);

    // Summary
    expect(result).toContain('Found 1 flights from $67 to $67');

    // Table headers
    expect(result).toContain('Price');
    expect(result).toContain('Route');

    // Disclaimer
    expect(result).toContain('Note: Prices may differ on booking site');
  });

  it('should return empty output with disclaimer skipped for no results', () => {
    const flights: FlightResult[] = [];
    const params = createSampleParams();
    const options: FormatOptions = { showLinks: false, isRoundTrip: false };
    const result = formatOutput(flights, params, options);

    // No disclaimer for empty results
    expect(result).not.toContain('Note: Prices may differ on booking site');
  });
});

describe('formatNoResults', () => {
  /**
   * Validates: Requirements 6.1, 6.2
   */
  it('should show no results message with max price', () => {
    const result = formatNoResults(100);

    expect(result).toContain('No flights found under $100 for your search criteria');
    expect(result).toContain('Try expanding your date range, increasing max price, or searching from both airports');
  });

  it('should format custom max price', () => {
    const result = formatNoResults(75);

    expect(result).toContain('No flights found under $75');
  });
});
