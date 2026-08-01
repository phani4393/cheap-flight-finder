/**
 * Property Test: Invalid Time Format Rejection (Property 8)
 *
 * For any string not matching HH:mm (00–23:00–59), the validator SHALL reject and signal error.
 * Also verifies that valid HH:mm strings (00:00 to 23:59) do NOT throw.
 *
 * **Validates: Requirements 7.4**
 */

import * as fc from 'fast-check';
import { validateTimeFormat } from '../../src/cli.js';
import { ValidationError } from '../../src/errors.js';

describe('Feature: google-flights-scraper, Property 8: Invalid Time Format Rejection', () => {
  it('should reject strings with invalid hour (25:00, 24:00, etc.)', () => {
    fc.assert(
      fc.property(
        // Generate hours 24-99 paired with valid minutes
        fc.integer({ min: 24, max: 99 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          expect(() => validateTimeFormat(time)).toThrow(ValidationError);
          expect(() => validateTimeFormat(time)).toThrow(/Invalid time format/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject strings with invalid minute (12:60, 08:99, etc.)', () => {
    fc.assert(
      fc.property(
        // Generate valid hours with minutes 60-99
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 60, max: 99 }),
        (hour, minute) => {
          const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          expect(() => validateTimeFormat(time)).toThrow(ValidationError);
          expect(() => validateTimeFormat(time)).toThrow(/Invalid time format/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject arbitrary strings that do not match HH:mm pattern', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 20 }).filter((s) => {
          // Exclude strings that happen to be valid HH:mm
          return !/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
        }),
        (invalidTime) => {
          expect(() => validateTimeFormat(invalidTime)).toThrow(ValidationError);
          expect(() => validateTimeFormat(invalidTime)).toThrow(/Invalid time format/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject single-digit hour format (e.g., "1:30" instead of "01:30")', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          // Single digit hour without padding
          const time = `${hour}:${String(minute).padStart(2, '0')}`;
          expect(() => validateTimeFormat(time)).toThrow(ValidationError);
          expect(() => validateTimeFormat(time)).toThrow(/Invalid time format/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject empty string', () => {
    expect(() => validateTimeFormat('')).toThrow(ValidationError);
    expect(() => validateTimeFormat('')).toThrow(/Invalid time format/);
  });

  it('should NOT throw for valid HH:mm strings (00:00 to 23:59)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (hour, minute) => {
          const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          expect(() => validateTimeFormat(time)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
