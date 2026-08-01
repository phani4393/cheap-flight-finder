/**
 * Property Test: Protobuf Encoding Round-Trip (Property 1)
 *
 * For any valid GoogleFlightsQueryParams, encoding then decoding SHALL produce equivalent parameters.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 */

import * as fc from 'fast-check';
import { ProtobufEncoder } from '../../src/adapters/google-flights/protobuf-encoder.js';
import type { GoogleFlightsQueryParams } from '../../src/adapters/google-flights/protobuf-encoder.js';

const encoder = new ProtobufEncoder();

/**
 * Arbitrary for generating a 3-letter uppercase IATA airport code.
 */
const iataCodeArb = fc.stringMatching(/^[A-Z]{3}$/);

/**
 * Arbitrary for generating a valid date string in YYYY-MM-DD format within 2024-2026.
 */
const dateArb = fc
  .record({
    year: fc.integer({ min: 2024, max: 2026 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }), // Use 28 max to avoid invalid dates
  })
  .map(({ year, month, day }) => {
    const m = String(month).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
  });

/**
 * Arbitrary for generating valid GoogleFlightsQueryParams for one-way trips (tripType=2).
 */
const oneWayParamsArb: fc.Arbitrary<GoogleFlightsQueryParams> = fc.record({
  origin: iataCodeArb,
  destination: iataCodeArb,
  departureDate: dateArb,
  tripType: fc.constant(2 as const),
  seatClass: fc.constantFrom(1 as const, 2 as const, 3 as const, 4 as const),
  adults: fc.integer({ min: 1, max: 9 }),
});

/**
 * Arbitrary for generating valid GoogleFlightsQueryParams for round-trip (tripType=1).
 * Ensures returnDate is also generated.
 */
const roundTripParamsArb: fc.Arbitrary<GoogleFlightsQueryParams> = fc.record({
  origin: iataCodeArb,
  destination: iataCodeArb,
  departureDate: dateArb,
  returnDate: dateArb,
  tripType: fc.constant(1 as const),
  seatClass: fc.constantFrom(1 as const, 2 as const, 3 as const, 4 as const),
  adults: fc.integer({ min: 1, max: 9 }),
});

/**
 * Combined arbitrary that generates both one-way and round-trip params.
 */
const queryParamsArb: fc.Arbitrary<GoogleFlightsQueryParams> = fc.oneof(
  oneWayParamsArb,
  roundTripParamsArb
);

describe('Feature: google-flights-scraper, Property 1: Protobuf Encoding Round-Trip', () => {
  it('encode then decode produces equivalent parameters for any valid input', () => {
    fc.assert(
      fc.property(queryParamsArb, (params) => {
        const encoded = encoder.encode(params);
        const decoded = encoder.decode(encoded);

        // Core fields must match exactly
        expect(decoded.origin).toBe(params.origin);
        expect(decoded.destination).toBe(params.destination);
        expect(decoded.departureDate).toBe(params.departureDate);
        expect(decoded.tripType).toBe(params.tripType);
        expect(decoded.seatClass).toBe(params.seatClass);
        expect(decoded.adults).toBe(params.adults);

        // Return date must match for round-trip
        if (params.tripType === 1) {
          expect(decoded.returnDate).toBe(params.returnDate);
        } else {
          expect(decoded.returnDate).toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it('encoded output is a non-empty URL-safe Base64 string', () => {
    fc.assert(
      fc.property(queryParamsArb, (params) => {
        const encoded = encoder.encode(params);

        // Must be non-empty
        expect(encoded.length).toBeGreaterThan(0);

        // Must only contain URL-safe Base64 characters (no +, /, or = padding)
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      }),
      { numRuns: 200 }
    );
  });
});
