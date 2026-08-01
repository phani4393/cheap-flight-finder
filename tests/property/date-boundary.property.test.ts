/**
 * Property Test: Date Range Boundary Inclusion (Property 3)
 *
 * Verifies that the API request includes exact boundary dates from SearchParams.
 * The transformToKiwiRequest function should pass dateFrom and dateTo through
 * formatDateForKiwi without any off-by-one errors.
 *
 * **Validates: Requirements 3.1, 3.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { transformToKiwiRequest, formatDateForKiwi } from '../../src/services/search.js';
import type { SearchParams } from '../../src/types.js';

describe('Feature: cheap-flight-finder, Property 3: Date Range Boundary Inclusion', () => {
  it('should include exact boundary dates in the API request (no off-by-one)', () => {
    fc.assert(
      fc.property(
        // Generate a dateFrom in the future (1 to 365 days from now)
        fc.integer({ min: 1, max: 365 }),
        // Generate a range length (0 to 30 days, so dateTo >= dateFrom)
        fc.integer({ min: 0, max: 30 }),
        (daysFromNow, rangeLength) => {
          // Create dateFrom as a future date
          const now = new Date();
          const dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromNow);
          // Create dateTo as dateFrom + rangeLength (ensures dateTo >= dateFrom)
          const dateTo = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate() + rangeLength);

          // Build minimal valid SearchParams
          const params: SearchParams = {
            origins: ['ORD'],
            destination: 'US',
            dateFrom,
            dateTo,
            tripType: 'oneway',
            maxPrice: 100,
            nonstopOnly: false,
            limit: 20,
          };

          // Transform to API request
          const request = transformToKiwiRequest(params, 'ORD');

          // The request dates should exactly match the formatted boundary dates
          const expectedDateFrom = formatDateForKiwi(dateFrom);
          const expectedDateTo = formatDateForKiwi(dateTo);

          // Verify exact boundary inclusion (no off-by-one)
          expect(request.date_from).toBe(expectedDateFrom);
          expect(request.date_to).toBe(expectedDateTo);
        }
      ),
      { numRuns: 100 }
    );
  });
});
