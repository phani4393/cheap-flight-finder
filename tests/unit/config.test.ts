/**
 * Unit tests for configuration module.
 * Tests API key loading, error handling, and default values.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getDefaultConfig } from '../../src/config.js';
import { ConfigError } from '../../src/errors.js';

describe('config', () => {
  const originalKiwiKey = process.env.KIWI_API_KEY;
  const originalRapidKey = process.env.RAPIDAPI_KEY;

  beforeEach(() => {
    // Clear both environment variables before each test
    delete process.env.KIWI_API_KEY;
    delete process.env.RAPIDAPI_KEY;
  });

  afterEach(() => {
    // Restore original environment variables
    if (originalKiwiKey !== undefined) {
      process.env.KIWI_API_KEY = originalKiwiKey;
    } else {
      delete process.env.KIWI_API_KEY;
    }
    if (originalRapidKey !== undefined) {
      process.env.RAPIDAPI_KEY = originalRapidKey;
    } else {
      delete process.env.RAPIDAPI_KEY;
    }
  });

  describe('loadConfig', () => {
    it('should throw ConfigError when RAPIDAPI_KEY is not set', () => {
      expect(() => loadConfig()).toThrow(ConfigError);
    });

    it('should include helpful error message when API key is missing', () => {
      try {
        loadConfig();
        expect.fail('Expected ConfigError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).message).toContain('RAPIDAPI_KEY environment variable not set');
        expect((error as ConfigError).message).toContain('https://rapidapi.com');
        expect((error as ConfigError).message).toContain('export RAPIDAPI_KEY');
      }
    });

    it('should have exit code 1 for ConfigError', () => {
      try {
        loadConfig();
        expect.fail('Expected ConfigError to be thrown');
      } catch (error) {
        expect((error as ConfigError).exitCode).toBe(1);
      }
    });

    it('should load config from RAPIDAPI_KEY environment variable', () => {
      process.env.RAPIDAPI_KEY = 'test-rapid-api-key-123';
      
      const config = loadConfig();
      
      expect(config.kiwiApiKey).toBe('test-rapid-api-key-123');
    });

    it('should fall back to KIWI_API_KEY when RAPIDAPI_KEY is not set', () => {
      process.env.KIWI_API_KEY = 'test-kiwi-key-456';
      
      const config = loadConfig();
      
      expect(config.kiwiApiKey).toBe('test-kiwi-key-456');
    });

    it('should prefer RAPIDAPI_KEY over KIWI_API_KEY', () => {
      process.env.RAPIDAPI_KEY = 'rapid-key';
      process.env.KIWI_API_KEY = 'kiwi-key';
      
      const config = loadConfig();
      
      expect(config.kiwiApiKey).toBe('rapid-key');
    });

    it('should use apiKeyOverride when provided', () => {
      process.env.RAPIDAPI_KEY = 'env-api-key';
      
      const config = loadConfig('override-api-key');
      
      expect(config.kiwiApiKey).toBe('override-api-key');
    });

    it('should use apiKeyOverride even when env var is not set', () => {
      const config = loadConfig('override-api-key');
      
      expect(config.kiwiApiKey).toBe('override-api-key');
    });

    it('should include default configuration values', () => {
      const config = loadConfig('test-key');
      
      expect(config.kiwiBaseUrl).toBe('https://flight-scanner10.p.rapidapi.com');
      expect(config.defaultMaxPriceOneway).toBe(100);
      expect(config.defaultMaxPriceRoundtrip).toBe(200);
      expect(config.defaultDateRangeDays).toBe(30);
      expect(config.defaultReturnDaysMin).toBe(2);
      expect(config.defaultReturnDaysMax).toBe(7);
      expect(config.defaultLimit).toBe(20);
      expect(config.requestTimeoutMs).toBe(30000);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default config without API key', () => {
      const defaults = getDefaultConfig();
      
      expect(defaults).not.toHaveProperty('kiwiApiKey');
      expect(defaults.defaultMaxPriceOneway).toBe(100);
      expect(defaults.defaultMaxPriceRoundtrip).toBe(200);
    });

    it('should return a copy of defaults (not same reference)', () => {
      const defaults1 = getDefaultConfig();
      const defaults2 = getDefaultConfig();
      
      expect(defaults1).not.toBe(defaults2);
      expect(defaults1).toEqual(defaults2);
    });
  });
});
