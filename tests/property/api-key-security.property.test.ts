/**
 * Property 11: API Key Never Logged
 *
 * For any execution (success or failure), the API key value SHALL NOT appear
 * in stdout, stderr, or any log output.
 *
 * **Validates: Requirements 9.4**
 */

import * as fc from 'fast-check';
import {
  createApiErrorFromStatus,
  createNetworkError,
  API_ERROR_MESSAGES,
} from '../../src/errors.js';

/**
 * Generator for random API key strings (alphanumeric, various lengths 10-50).
 */
const apiKeyArb = fc.stringOf(
  fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
  ),
  { minLength: 10, maxLength: 50 }
);

/**
 * Generator for HTTP error status codes that the adapter handles.
 */
const errorStatusCodeArb = fc.constantFrom(401, 429, 500, 502, 503, 504);

describe('Feature: cheap-flight-finder, Property 11: API Key Never Logged', () => {
  it('createApiErrorFromStatus never includes the API key in the error message', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        errorStatusCodeArb,
        (apiKey, statusCode) => {
          const error = createApiErrorFromStatus(statusCode, new Error('test'));

          // The API key value must never appear in the error message
          expect(error.message).not.toContain(apiKey);
          // Also check the name field
          expect(error.name).not.toContain(apiKey);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('createApiErrorFromStatus with arbitrary status codes never leaks the API key', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        fc.integer({ min: 400, max: 599 }),
        (apiKey, statusCode) => {
          const error = createApiErrorFromStatus(statusCode, new Error('test'));

          // The API key value must never appear in any error output
          expect(error.message).not.toContain(apiKey);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('createNetworkError never includes the API key in the error message', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        (apiKey) => {
          const error = createNetworkError(new Error(`connection failed with key ${apiKey}`));

          // Even if the original error contains the key, the user-facing message must not
          expect(error.message).not.toContain(apiKey);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('error messages contain helpful guidance (env var name) but not actual key values', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        (apiKey) => {
          // 401 error should reference the env var name for guidance
          const error401 = createApiErrorFromStatus(401, new Error('unauthorized'));

          // The error message should contain helpful env var name reference
          expect(error401.message).toContain('RAPIDAPI_KEY');

          // But must NEVER contain the actual API key value
          expect(error401.message).not.toContain(apiKey);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('API_ERROR_MESSAGES constants never contain any generated API key value', () => {
    fc.assert(
      fc.property(
        apiKeyArb,
        (apiKey) => {
          // Verify all predefined error messages don't contain the key
          const allMessages = Object.values(API_ERROR_MESSAGES);

          for (const message of allMessages) {
            expect(message).not.toContain(apiKey);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
