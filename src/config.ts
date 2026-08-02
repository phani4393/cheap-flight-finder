/**
 * Configuration Module
 * Handles loading application configuration.
 */

/**
 * Application configuration interface.
 * Contains default values for search parameters.
 */
export interface AppConfig {
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

  /** RapidAPI key (loaded from RAPIDAPI_KEY env var) */
  rapidApiKey?: string;
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: AppConfig = {
  defaultMaxPriceOneway: 100,
  defaultMaxPriceRoundtrip: 200,
  defaultDateRangeDays: 30,
  defaultReturnDaysMin: 2,
  defaultReturnDaysMax: 7,
  defaultLimit: 20,
  requestTimeoutMs: 30000,
};

/**
 * Load application configuration.
 *
 * @returns Complete application configuration
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.5**
 */
export function loadConfig(): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    rapidApiKey: process.env.RAPIDAPI_KEY,  // may be undefined
  };
}

/**
 * Get default configuration values (useful for testing).
 */
export function getDefaultConfig(): AppConfig {
  return { ...DEFAULT_CONFIG };
}
