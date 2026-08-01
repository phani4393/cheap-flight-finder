/**
 * Unit Tests for ProtobufEncoder
 * Tests for src/adapters/google-flights/protobuf-encoder.ts
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { ProtobufEncoder } from '../../src/adapters/google-flights/protobuf-encoder.js';

const encoder = new ProtobufEncoder();

/** URL-safe Base64 character set regex: A-Z, a-z, 0-9, -, _ (no +, /, or =) */
const URL_SAFE_BASE64_REGEX = /^[A-Za-z0-9\-_]+$/;

describe('ProtobufEncoder', () => {
  describe('encode one-way ORD→LAX', () => {
    it('should produce a non-empty URL-safe Base64 string', () => {
      const result = encoder.encode({
        origin: 'ORD',
        destination: 'LAX',
        departureDate: '2024-06-15',
        tripType: 2,
        seatClass: 1,
        adults: 1,
      });

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(URL_SAFE_BASE64_REGEX);
    });
  });

  describe('decode the encoded result back', () => {
    it('should decode fields matching the original input for one-way', () => {
      const params = {
        origin: 'ORD',
        destination: 'LAX',
        departureDate: '2024-06-15',
        tripType: 2 as const,
        seatClass: 1 as const,
        adults: 1,
      };

      const encoded = encoder.encode(params);
      const decoded = encoder.decode(encoded);

      expect(decoded.origin).toBe('ORD');
      expect(decoded.destination).toBe('LAX');
      expect(decoded.departureDate).toBe('2024-06-15');
      expect(decoded.tripType).toBe(2);
      expect(decoded.seatClass).toBe(1);
      expect(decoded.adults).toBe(1);
    });
  });

  describe('round-trip with return date', () => {
    it('should encode and decode round-trip ORD→LAX with return date', () => {
      const params = {
        origin: 'ORD',
        destination: 'LAX',
        departureDate: '2024-06-15',
        returnDate: '2024-06-22',
        tripType: 1 as const,
        seatClass: 1 as const,
        adults: 1,
      };

      const encoded = encoder.encode(params);
      expect(encoded).toBeTruthy();
      expect(encoded).toMatch(URL_SAFE_BASE64_REGEX);

      const decoded = encoder.decode(encoded);

      expect(decoded.origin).toBe('ORD');
      expect(decoded.destination).toBe('LAX');
      expect(decoded.departureDate).toBe('2024-06-15');
      expect(decoded.returnDate).toBe('2024-06-22');
      expect(decoded.tripType).toBe(1);
      expect(decoded.seatClass).toBe(1);
      expect(decoded.adults).toBe(1);
    });
  });

  describe('all seat classes encode/decode correctly', () => {
    const seatClasses = [1, 2, 3, 4] as const;

    for (const seatClass of seatClasses) {
      it(`should encode and decode seat class ${seatClass}`, () => {
        const params = {
          origin: 'ORD',
          destination: 'LAX',
          departureDate: '2024-06-15',
          tripType: 2 as const,
          seatClass,
          adults: 1,
        };

        const encoded = encoder.encode(params);
        const decoded = encoder.decode(encoded);

        expect(decoded.seatClass).toBe(seatClass);
      });
    }
  });

  describe('passengers 1-9 encode/decode correctly', () => {
    for (let adults = 1; adults <= 9; adults++) {
      it(`should encode and decode ${adults} adult(s)`, () => {
        const params = {
          origin: 'ORD',
          destination: 'LAX',
          departureDate: '2024-06-15',
          tripType: 2 as const,
          seatClass: 1 as const,
          adults,
        };

        const encoded = encoder.encode(params);
        const decoded = encoder.decode(encoded);

        expect(decoded.adults).toBe(adults);
      });
    }
  });

  describe('encoded strings only contain URL-safe Base64 chars', () => {
    it('should only contain A-Z, a-z, 0-9, -, _ for one-way', () => {
      const encoded = encoder.encode({
        origin: 'ORD',
        destination: 'LAX',
        departureDate: '2024-06-15',
        tripType: 2,
        seatClass: 1,
        adults: 1,
      });

      expect(encoded).toMatch(URL_SAFE_BASE64_REGEX);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should only contain URL-safe chars for round-trip', () => {
      const encoded = encoder.encode({
        origin: 'JFK',
        destination: 'SFO',
        departureDate: '2025-12-31',
        returnDate: '2026-01-07',
        tripType: 1,
        seatClass: 4,
        adults: 9,
      });

      expect(encoded).toMatch(URL_SAFE_BASE64_REGEX);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('should only contain URL-safe chars for various parameter combinations', () => {
      const combos = [
        { origin: 'ATL', destination: 'MIA', departureDate: '2024-01-01', tripType: 2 as const, seatClass: 2 as const, adults: 3 },
        { origin: 'DFW', destination: 'SEA', departureDate: '2025-07-04', tripType: 2 as const, seatClass: 3 as const, adults: 5 },
        { origin: 'BOS', destination: 'DEN', departureDate: '2024-11-28', returnDate: '2024-12-05', tripType: 1 as const, seatClass: 1 as const, adults: 2 },
      ];

      for (const params of combos) {
        const encoded = encoder.encode(params);
        expect(encoded).toMatch(URL_SAFE_BASE64_REGEX);
      }
    });
  });
});
