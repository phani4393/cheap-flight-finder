/**
 * Unit tests for shared types.
 * Verifies that type definitions are correctly exported and usable.
 */

import { describe, it, expect } from 'vitest';
import type { 
  OriginAirport, 
  FlightResult, 
  SearchParams, 
  SearchResult 
} from '../../src/types.js';

describe('types', () => {
  describe('OriginAirport', () => {
    it('should accept valid airport codes', () => {
      const ord: OriginAirport = 'ORD';
      const mdw: OriginAirport = 'MDW';
      
      expect(ord).toBe('ORD');
      expect(mdw).toBe('MDW');
    });
  });

  describe('FlightResult', () => {
    it('should allow creating one-way flight result', () => {
      const flight: FlightResult = {
        id: 'test-123',
        price: 67,
        origin: 'ORD',
        destination: 'LAX',
        destinationCity: 'Los Angeles',
        departureDate: new Date('2024-03-15'),
        departureTime: '06:30',
        arrivalTime: '08:45',
        durationMinutes: 255,
        stops: 0,
        airlines: ['UA'],
        bookingUrl: 'https://kiwi.com/booking/123'
      };

      expect(flight.price).toBe(67);
      expect(flight.origin).toBe('ORD');
      expect(flight.stops).toBe(0);
      expect(flight.returnDepartureDate).toBeUndefined();
    });

    it('should allow creating round-trip flight result', () => {
      const flight: FlightResult = {
        id: 'test-456',
        price: 147,
        origin: 'MDW',
        destination: 'MIA',
        destinationCity: 'Miami',
        departureDate: new Date('2024-03-15'),
        departureTime: '07:00',
        arrivalTime: '11:30',
        durationMinutes: 210,
        stops: 0,
        airlines: ['WN'],
        bookingUrl: 'https://kiwi.com/booking/456',
        // Round-trip specific
        returnDepartureDate: new Date('2024-03-20'),
        returnDepartureTime: '14:00',
        returnArrivalTime: '18:30',
        returnDurationMinutes: 210,
        returnStops: 0
      };

      expect(flight.price).toBe(147);
      expect(flight.returnDepartureDate).toEqual(new Date('2024-03-20'));
      expect(flight.returnStops).toBe(0);
    });
  });

  describe('SearchParams', () => {
    it('should allow creating one-way search params', () => {
      const params: SearchParams = {
        origins: ['ORD', 'MDW'],
        destination: 'US',
        dateFrom: new Date('2024-03-15'),
        dateTo: new Date('2024-03-22'),
        tripType: 'oneway',
        maxPrice: 100,
        nonstopOnly: false,
        limit: 20
      };

      expect(params.origins).toEqual(['ORD', 'MDW']);
      expect(params.tripType).toBe('oneway');
      expect(params.returnDaysMin).toBeUndefined();
    });

    it('should allow creating round-trip search params', () => {
      const params: SearchParams = {
        origins: ['ORD'],
        destination: 'US',
        dateFrom: new Date('2024-03-15'),
        dateTo: new Date('2024-03-22'),
        tripType: 'round',
        returnDaysMin: 3,
        returnDaysMax: 7,
        maxPrice: 200,
        nonstopOnly: true,
        airlineFilter: ['UA', 'AA'],
        limit: 10
      };

      expect(params.tripType).toBe('round');
      expect(params.returnDaysMin).toBe(3);
      expect(params.returnDaysMax).toBe(7);
      expect(params.nonstopOnly).toBe(true);
    });
  });

  describe('SearchResult', () => {
    it('should allow creating search result', () => {
      const result: SearchResult = {
        flights: [],
        searchParams: {
          origins: ['ORD'],
          destination: 'US',
          dateFrom: new Date('2024-03-15'),
          dateTo: new Date('2024-03-22'),
          tripType: 'oneway',
          maxPrice: 100,
          nonstopOnly: false,
          limit: 20
        },
        apiCallCount: 1,
        totalResultsFromApi: 0
      };

      expect(result.flights).toEqual([]);
      expect(result.apiCallCount).toBe(1);
    });
  });
});
