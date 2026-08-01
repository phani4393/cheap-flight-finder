/**
 * Property Test: Export Row Count (Property 9)
 *
 * For any export operation, the CSV file SHALL contain exactly (N + 1) rows
 * where N is the number of flight results (1 header + N data rows).
 *
 * **Validates: Requirements 10.2**
 */

import * as fc from 'fast-check';
import { CsvExportService } from '../../src/formatters/csv.js';
import { readFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { FlightResult, SearchParams, OriginAirport } from '../../src/types.js';

/**
 * Arbitrary for generating valid FlightResult objects.
 */
const flightResultArb: fc.Arbitrary<FlightResult> = fc.record({
  id: fc.uuid(),
  price: fc.integer({ min: 1, max: 500 }),
  origin: fc.constantFrom<OriginAirport>('ORD', 'MDW'),
  destination: fc.stringMatching(/^[A-Z]{3}$/),
  destinationCity: fc.string({ minLength: 2, maxLength: 30 }).filter(s => !s.includes('\0')),
  departureDate: fc.date({
    min: new Date(2025, 0, 1),
    max: new Date(2026, 0, 1),
  }),
  departureTime: fc.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
  arrivalTime: fc.stringMatching(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: fc.integer({ min: 60, max: 600 }),
  stops: fc.integer({ min: 0, max: 3 }),
  airlines: fc.array(fc.stringMatching(/^[A-Z0-9]{2}$/), { minLength: 1, maxLength: 3 }),
  bookingUrl: fc.constant('https://example.com/book'),
});

/**
 * Helper: build a minimal valid SearchParams for CSV export.
 */
function buildSearchParams(): SearchParams {
  return {
    origins: ['ORD'],
    destination: 'US',
    dateFrom: new Date(2025, 3, 1),
    dateTo: new Date(2025, 3, 30),
    tripType: 'oneway',
    maxPrice: 100,
    nonstopOnly: false,
    limit: 20,
  };
}

describe('Feature: cheap-flight-finder, Property 9: Export Row Count', () => {
  const service = new CsvExportService();
  const params = buildSearchParams();

  it('CSV contains exactly (N + 1) rows: 1 header + N data rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(flightResultArb, { minLength: 0, maxLength: 50 }),
        async (flights) => {
          // Generate a unique temp file for each run
          const filePath = join(tmpdir(), `export-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);

          try {
            await service.exportToCsv(flights, filePath, params);

            // Read the CSV file back
            const content = await readFile(filePath, 'utf-8');

            // Split into rows, filtering out trailing empty line from final newline
            const rows = content.split('\n').filter(row => row.length > 0);

            // CSV must have exactly N + 1 rows (1 header + N data rows)
            expect(rows.length).toBe(flights.length + 1);
          } finally {
            // Cleanup temp file
            await rm(filePath, { force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
