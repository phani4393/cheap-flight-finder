/**
 * Unit tests for configuration module.
 * Tests that config loads without API key requirements and returns correct defaults.
 */

import { loadConfig, getDefaultConfig } from '../../src/config.js';

describe('config', () => {
  describe('loadConfig', () => {
    it('should return config without requiring any environment variables', () => {
      const config = loadConfig();
      expect(config).toBeDefined();
    });

    it('should not throw when no API key is set', () => {
      expect(() => loadConfig()).not.toThrow();
    });

    it('should include default pricing configuration', () => {
      const config = loadConfig();
      expect(config.defaultMaxPriceOneway).toBe(100);
      expect(config.defaultMaxPriceRoundtrip).toBe(200);
    });

    it('should include default date range and return days', () => {
      const config = loadConfig();
      expect(config.defaultDateRangeDays).toBe(30);
      expect(config.defaultReturnDaysMin).toBe(2);
      expect(config.defaultReturnDaysMax).toBe(7);
    });

    it('should include default limit', () => {
      const config = loadConfig();
      expect(config.defaultLimit).toBe(20);
    });

    it('should include request timeout', () => {
      const config = loadConfig();
      expect(config.requestTimeoutMs).toBe(30000);
    });

    it('should have rapidApiKey field (may be undefined)', () => {
      const config = loadConfig();
      expect(config).toHaveProperty('rapidApiKey');
    });

    it('should not have kiwiApiKey field', () => {
      const config = loadConfig();
      expect(config).not.toHaveProperty('kiwiApiKey');
    });

    it('should not have kiwiBaseUrl field', () => {
      const config = loadConfig();
      expect(config).not.toHaveProperty('kiwiBaseUrl');
    });

    it('should not have googleFlightsBaseUrl field', () => {
      const config = loadConfig();
      expect(config).not.toHaveProperty('googleFlightsBaseUrl');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return config defaults without rapidApiKey', () => {
      const defaults = getDefaultConfig();
      const config = loadConfig();
      // getDefaultConfig returns base defaults; loadConfig adds rapidApiKey from env
      expect(defaults.defaultMaxPriceOneway).toEqual(config.defaultMaxPriceOneway);
      expect(defaults.defaultMaxPriceRoundtrip).toEqual(config.defaultMaxPriceRoundtrip);
      expect(defaults.defaultLimit).toEqual(config.defaultLimit);
    });

    it('should return a copy of defaults (not same reference)', () => {
      const defaults1 = getDefaultConfig();
      const defaults2 = getDefaultConfig();
      expect(defaults1).not.toBe(defaults2);
      expect(defaults1).toEqual(defaults2);
    });

    it('should not have rapidApiKey field', () => {
      const defaults = getDefaultConfig();
      expect(defaults).not.toHaveProperty('rapidApiKey');
    });

    it('should not have any legacy API key fields', () => {
      const defaults = getDefaultConfig();
      expect(defaults).not.toHaveProperty('kiwiApiKey');
      expect(defaults).not.toHaveProperty('kiwiBaseUrl');
      expect(defaults).not.toHaveProperty('googleFlightsBaseUrl');
    });
  });
});
