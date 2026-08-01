/**
 * Property Test: Past Date Rejection (Property 4)
 *
 * Verifies that for any date D where D < today, the validation rejects
 * the search and returns an error before any API call is made.
 *
 * **Validates: Requirements 3.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateOptions, validateDateNotInPast } from '../../src/cli.js';
import { isDateInPast } from '../../src/utils/dates.js';
import { ValidationError } from '../../src/errors.js';
import type { CLIOptions } from '../../src/cli.js';

describe('Feature: cheap-flight-finder, Property 4: Past Date Rejection', () => {
  it('should reject any date before today with a ValidationError before any API call', () => {
    fc.assert(
      fc.property(
        // Generate a number of days in the past (1 to 3650 days ago, i.e. up to ~10 years)
        fc.integer({ min: 1, max: 3650 }),
        (daysInPast) => {
          const now = new Date();
          const pastDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - daysInPast
          );

          // The date should be recognized as in the past
          expect(isDateInPast(pastDate)).toBe(true);

          // validateDateNotInPast should throw ValidationError
          expect(() => validateDateNotInPast(pastDate)).toThrow(ValidationError);
          expect(() => validateDateNotInPast(pastDate)).toThrow(
            'Departure date must be today or a future date'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject past dates via validateOptions with --date flag before any API call', () => {
    fc.assert(
      fc.property(
        // Generate past dates as YYYY-MM-DD strings
        fc.integer({ min: 1, max: 3650 }),
        (daysInPast) => {
          const now = new Date();
          const pastDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - daysInPast
          );

          // Format as YYYY-MM-DD
          const year = pastDate.getFullYear();
          const month = String(pastDate.getMonth() + 1).padStart(2, '0');
          const day = String(pastDate.getDate()).padStart(2, '0');
          const dateStr = `${year}-${month}-${day}`;

          // Build CLI options with a past date
          const options: CLIOptions = {
            from: 'ORD',
            date: dateStr,
            roundTrip: false,
            nonstop: false,
            limit: 20,
            showLinks: false,
          };

          // validateOptions should throw before any API call would be made
          expect(() => validateOptions(options)).toThrow(ValidationError);
          expect(() => validateOptions(options)).toThrow(
            'Departure date must be today or a future date'
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject past dates via validateOptions with --date-from flag before any API call', () => {
    fc.assert(
      fc.property(
        // Generate past dates for date-from
        fc.integer({ min: 1, max: 3650 }),
        (daysInPast) => {
          const now = new Date();
          const pastDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - daysInPast
          );

          // Format as YYYY-MM-DD
          const year = pastDate.getFullYear();
          const month = String(pastDate.getMonth() + 1).padStart(2, '0');
          const day = String(pastDate.getDate()).padStart(2, '0');
          const dateFromStr = `${year}-${month}-${day}`;

          // dateTo is a valid future date
          const futureDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 10
          );
          const fYear = futureDate.getFullYear();
          const fMonth = String(futureDate.getMonth() + 1).padStart(2, '0');
          const fDay = String(futureDate.getDate()).padStart(2, '0');
          const dateToStr = `${fYear}-${fMonth}-${fDay}`;

          // Build CLI options with a past date-from
          const options: CLIOptions = {
            from: 'BOTH',
            dateFrom: dateFromStr,
            dateTo: dateToStr,
            roundTrip: false,
            nonstop: false,
            limit: 20,
            showLinks: false,
          };

          // validateOptions should throw before any API call would be made
          expect(() => validateOptions(options)).toThrow(ValidationError);
          expect(() => validateOptions(options)).toThrow(
            'Departure date must be today or a future date'
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
