/**
 * Configuration Module
 * Handles loading and validating application configuration including API keys.
 */

import { ConfigError } from './errors.js';

/**
 * Application configuration interface.
 * Contains API credentials and default values for search parameters.
 */
export interface AppConfig {
  /** RapidAPI key for Flight Scanner API */
  rapidApiKey: string;
  
  /** Base URL for the Flight Scanner API */
  apiBaseUrl: string;
  
  /** Default max price for one-way flights (USD) */
  defaultMaxPriceOneway: number;
  
  /** Default max price for round-trip flights (USD) */
  defaultMaxPriceRoundtrip: number;
  
  /** Default number of days to search ahead */
  defaultDateRangeDays: number;
  
  /** Default minimum nights at destination for round-trips */
  defaultReturnDaysMin: number;
  
  /** Default maximum nights at destination for round-trips */
  defaultReturnDaysMax: number;
  
  /** Default number of results to display */
  defaultLimit: number;
  
  /** HTTP request timeout in milliseconds */
  requestTimeoutMs: number;

  // Legacy aliases for backward compatibility with search service
  /** @deprecated Use rapidApiKey */
  kiwiApiKey: string;
  /** @deprecated Use apiBaseUrl */
  kiwiBaseUrl: string;
}

/**
 * Default configuration values (excluding API key which must be provided).
 */
const DEFAULT_CONFIG = {
  apiBaseUrl: 'https://flight-scanner10.p.rapidapi.com',
  defaultMaxPriceOneway: 100,
  defaultMaxPriceRoundtrip: 200,
  defaultDateRangeDays: 30,
  defaultReturnDaysMin: 2,
  defaultReturnDaysMax: 7,
  defaultLimit: 20,
  requestTimeoutMs: 30000
};

/**
 * Load application configuration from environment variables.
 * 
 * @param apiKeyOverride - Optional API key to use instead of environment variable
 * @returns Complete application configuration
 * @throws {ConfigError} If RAPIDAPI_KEY is not set and no override provided
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3**
 */
export function loadConfig(apiKeyOverride?: string): AppConfig {
  const apiKey = apiKeyOverride ?? process.env.RAPIDAPI_KEY ?? process.env.KIWI_API_KEY;
  
  if (!apiKey) {
    throw new ConfigError(
      'Error: RAPIDAPI_KEY environment variable not set.\n\n' +
      'Get a free API key:\n' +
      '1. Sign up at https://rapidapi.com (free)\n' +
      '2. Subscribe to "Flight Scanner" API (Basic plan, $0/month)\n' +
      '   https://rapidapi.com/apiheya/api/flight-scanner10\n' +
      '3. Copy your RapidAPI key from any endpoint page\n' +
      '4. Set: export RAPIDAPI_KEY="your-key-here"'
    );
  }
  
  return {
    ...DEFAULT_CONFIG,
    rapidApiKey: apiKey,
    // Legacy aliases
    kiwiApiKey: apiKey,
    kiwiBaseUrl: DEFAULT_CONFIG.apiBaseUrl,
  };
}

/**
 * Get default configuration values (useful for testing).
 * Does not include API key.
 */
export function getDefaultConfig(): Omit<AppConfig, 'rapidApiKey' | 'kiwiApiKey'> {
  return { ...DEFAULT_CONFIG, kiwiBaseUrl: DEFAULT_CONFIG.apiBaseUrl };
}
