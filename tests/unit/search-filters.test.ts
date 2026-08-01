import {
  filterByDepartureTime,
  filterByMaxDuration,
  filterByBasicEconomy,
} from '../../src/services/search.js';
import type { FlightResult } from '../../src/types.js';

/**
 * Helper to create a mock FlightResult with sensible defaults.
 * Override any field as needed for specific test cases.
 */
function createFlight(overrides: Partial<FlightResult> = {}): FlightResult {
  return {
    id: 'test-flight-1',
    price: 150,
    origin: 'ORD',
    destination: 'LAX',
    destinationCity: 'Los Angeles',
    departureDate: new Date('2024-08-15'),
    departureTime: '10:00',
    arrivalTime: '12:30',
    durationMinutes: 150,
    stops: 0,
    airlines: ['UA'],
    bookingUrl: 'https://example.com/book',
    ...overrides,
  };
}

describe('filterByDepartureTime', () => {
  it('returns all flights when no bounds are specified', () => {
    const flights = [
      createFlight({ departureTime: '06:30' }),
      createFlight({ departureTime: '12:00' }),
      createFlight({ departureTime: '20:00' }),
    ];

    const result = filterByDepartureTime(flights, undefined, undefined);

    expect(result).toHaveLength(3);
    expect(result).toEqual(flights);
  });

  it('filters by departureAfter only', () => {
    const flights = [
      createFlight({ id: 'early', departureTime: '06:30' }),
      createFlight({ id: 'mid', departureTime: '10:00' }),
      createFlight({ id: 'late', departureTime: '14:00' }),
    ];

    const result = filterByDepartureTime(flights, '08:00', undefined);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['mid', 'late']);
  });

  it('filters by departureBefore only', () => {
    const flights = [
      createFlight({ id: 'early', departureTime: '06:30' }),
      createFlight({ id: 'mid', departureTime: '14:00' }),
      createFlight({ id: 'late', departureTime: '20:00' }),
    ];

    const result = filterByDepartureTime(flights, undefined, '18:00');

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['early', 'mid']);
  });

  it('filters with both bounds - only returns flights in window', () => {
    const flights = [
      createFlight({ id: 'too-early', departureTime: '05:00' }),
      createFlight({ id: 'in-window', departureTime: '10:00' }),
      createFlight({ id: 'also-in', departureTime: '15:00' }),
      createFlight({ id: 'too-late', departureTime: '22:00' }),
    ];

    const result = filterByDepartureTime(flights, '08:00', '18:00');

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['in-window', 'also-in']);
  });

  it('includes boundary values - departureAfter is inclusive', () => {
    const flights = [
      createFlight({ id: 'at-boundary', departureTime: '08:00' }),
      createFlight({ id: 'after', departureTime: '09:00' }),
      createFlight({ id: 'before', departureTime: '07:59' }),
    ];

    const result = filterByDepartureTime(flights, '08:00', undefined);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['at-boundary', 'after']);
  });
});

describe('filterByMaxDuration', () => {
  it('includes flights at exactly the max duration', () => {
    const flights = [
      createFlight({ id: 'exact', durationMinutes: 300 }),
      createFlight({ id: 'under', durationMinutes: 200 }),
    ];

    const result = filterByMaxDuration(flights, 300);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['exact', 'under']);
  });

  it('excludes flights over the max duration', () => {
    const flights = [
      createFlight({ id: 'short', durationMinutes: 120 }),
      createFlight({ id: 'long', durationMinutes: 400 }),
      createFlight({ id: 'medium', durationMinutes: 300 }),
    ];

    const result = filterByMaxDuration(flights, 300);

    expect(result).toHaveLength(2);
    expect(result.map((f) => f.id)).toEqual(['short', 'medium']);
  });

  it('handles edge case: 0 minute flights', () => {
    const flights = [
      createFlight({ id: 'zero', durationMinutes: 0 }),
      createFlight({ id: 'positive', durationMinutes: 60 }),
    ];

    const result = filterByMaxDuration(flights, 0);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('zero');
  });
});

describe('filterByBasicEconomy', () => {
  it('keeps flights without isBasicEconomy set', () => {
    const flights = [
      createFlight({ id: 'no-field' }),
    ];

    const result = filterByBasicEconomy(flights);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('no-field');
  });

  it('keeps flights with isBasicEconomy=false', () => {
    const flights = [
      createFlight({ id: 'not-basic', isBasicEconomy: false }),
    ];

    const result = filterByBasicEconomy(flights);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('not-basic');
  });

  it('removes flights with isBasicEconomy=true', () => {
    const flights = [
      createFlight({ id: 'basic', isBasicEconomy: true }),
      createFlight({ id: 'regular', isBasicEconomy: false }),
      createFlight({ id: 'also-basic', isBasicEconomy: true }),
    ];

    const result = filterByBasicEconomy(flights);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('regular');
  });

  it('returns empty array when input is empty', () => {
    const result = filterByBasicEconomy([]);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });
});
