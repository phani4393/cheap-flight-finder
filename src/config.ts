/**
 * Configuration Module
 * Handles loading application configuration.
 * No API key required — uses direct Google Flights scraping.
 */

/**
 * Application configuration interface.
 * Contains default values for search parameters and the Google Flights base URL.
 */
export interface AppConfig {
  /** Base URL for Google Flights */
  googleFlightsBaseUrl: string;

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
}

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG: AppConfig = {
  googleFlightsBaseUrl: 'https://www.google.com/travel/flights',
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
 * No API key or environment variables required.
 *
 * @returns Complete application configuration
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.5**
 */
export function loadConfig(): AppConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Get default configuration values (useful for testing).
 */
export function getDefaultConfig(): AppConfig {
  return { ...DEFAULT_CONFIG };
}
