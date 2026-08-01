/**
 * Property Test: Invalid Adults Rejection (Property 7)
 *
 * For any integer outside [1, 9], the validator SHALL reject and signal error.
 * Also verifies that valid values (1-9) do NOT throw.
 *
 * **Validates: Requirements 6.3**
 */

import * as fc from 'fast-check';
import { validateAdults } from '../../src/cli.js';
import { ValidationError } from '../../src/errors.js';

describe('Feature: google-flights-scraper, Property 7: Invalid Adults Rejection', () => {
  it('should reject any integer less than 1 (zero and negatives)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 0 }),
        (invalidAdults) => {
          expect(() => validateAdults(invalidAdults)).toThrow(ValidationError);
          expect(() => validateAdults(invalidAdults)).toThrow(
            /Invalid adults count/
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject any integer greater than 9', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 10000 }),
        (invalidAdults) => {
          expect(() => validateAdults(invalidAdults)).toThrow(ValidationError);
          expect(() => validateAdults(invalidAdults)).toThrow(
            /Invalid adults count/
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should NOT throw for valid values 1 through 9', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9 }),
        (validAdults) => {
          expect(() => validateAdults(validAdults)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
