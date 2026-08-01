#!/usr/bin/env node
/**
 * CLI Entry Point
 * Main entry point for the cheap-flight-finder application.
 * Handles argument parsing and orchestrates the search flow.
 * 
 * **Validates: Requirements 3.4, 3.5, 6.1, 6.2, 6.3, 8.2, 9.1, 9.3, 10.4, 11.1, 11.2, 11.3**
 */

import { Command } from 'commander';
import { addDays, parse, differenceInDays, startOfDay } from 'date-fns';
import { loadConfig } from './config.js';
import { ValidationError, AppError } from './errors.js';
import { SkyscannerAdapter } from './adapters/skyscanner.js';
import { SearchService } from './services/search.js';
import { formatOutput, formatNoResults } from './formatters/table.js';
import { CsvExportService } from './formatters/csv.js';
import { openInBrowser } from './utils/browser.js';
import { isDateInPast } from './utils/dates.js';
import { RetryHandler } from './utils/retry.js';
import type { SearchParams, OriginAirport, FlightResult } from './types.js';

/**
 * CLI Options interface representing all parsed command-line arguments.
 */
export interface CLIOptions {
  /** Origin airport: ORD, MDW, or BOTH (default: BOTH) */
  from: 'ORD' | 'MDW' | 'BOTH';
  
  /** Single departure date (YYYY-MM-DD) */
  date?: string;
  
  /** Start of date range (YYYY-MM-DD) */
  dateFrom?: string;
  
  /** End of date range (YYYY-MM-DD) */
  dateTo?: string;
  
  /** Search for round-trip flights */
  roundTrip: boolean;
  
  /** Return window for round-trips (e.g., 3-7) */
  returnDays?: string;
  
  /** Show only nonstop flights */
  nonstop: boolean;
  
  /** Filter by airline codes (comma-separated) */
  airline?: string;
  
  /** Maximum price in USD */
  maxPrice?: number;
  
  /** Search specific destination instead of all US */
  destination?: string;
  
  /** Maximum results to display (default: 20) */
  limit: number;
  
  /** Display booking URLs */
  showLinks: boolean;
  
  /** Open result N in browser */
  open?: number;
  
  /** Export results to CSV file */
  export?: string;
  
  /** Override RAPIDAPI_KEY environment variable */
  apiKey?: string;
}

/**
 * Parse command-line arguments and return structured options.
 * 
 * @returns Parsed CLI options
 */
export function parseArgs(): CLIOptions {
  const program = new Command();
  
  program
    .name('cheap-flights')
    .description('Discover low-cost flights from Chicago airports to any US destination')
    .version('1.0.0', '-v, --version', 'Show version number')
    .option(
      '--from <AIRPORT>',
      'Origin airport: ORD, MDW, or BOTH',
      'BOTH'
    )
    .option(
      '--date <DATE>',
      'Single departure date (YYYY-MM-DD)'
    )
    .option(
      '--date-from <DATE>',
      'Start of date range (YYYY-MM-DD)'
    )
    .option(
      '--date-to <DATE>',
      'End of date range (YYYY-MM-DD)'
    )
    .option(
      '--round-trip',
      'Search for round-trip flights',
      false
    )
    .option(
      '--return-days <RANGE>',
      'Return window for round-trips (e.g., 3-7, default: 2-7)'
    )
    .option(
      '--nonstop',
      'Show only nonstop flights',
      false
    )
    .option(
      '--airline <CODES>',
      'Filter by airline codes (comma-separated)'
    )
    .option(
      '--max-price <AMOUNT>',
      'Maximum price in USD (default: 100 one-way, 200 round-trip)',
      (value: string) => parseFloat(value)
    )
    .option(
      '--destination <CODE>',
      'Search specific destination instead of all US'
    )
    .option(
      '--limit <N>',
      'Maximum results to display (default: 20)',
      (value: string) => parseInt(value, 10),
      20
    )
    .option(
      '--show-links',
      'Display booking URLs',
      false
    )
    .option(
      '--open <N>',
      'Open result N in browser',
      (value: string) => parseInt(value, 10)
    )
    .option(
      '--export <FILE>',
      'Export results to CSV file'
    )
    .option(
      '--api-key <KEY>',
      'Override RAPIDAPI_KEY environment variable'
    )
    .addHelpText('after', `
Examples:
  cheap-flights                           # Search both airports, next 30 days
  cheap-flights --from ORD --nonstop      # Nonstop from O'Hare only
  cheap-flights --date 2024-03-15         # Specific date
  cheap-flights --round-trip --return-days 3-5  # Round-trip, 3-5 day trips
  cheap-flights --max-price 75 --limit 10 # Cheapest 10 under $75
  cheap-flights --export deals.csv        # Save to file
`);

  program.parse();
  
  const opts = program.opts();
  
  return {
    from: opts.from.toUpperCase() as 'ORD' | 'MDW' | 'BOTH',
    date: opts.date,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    roundTrip: opts.roundTrip,
    returnDays: opts.returnDays,
    nonstop: opts.nonstop,
    airline: opts.airline,
    maxPrice: opts.maxPrice,
    destination: opts.destination?.toUpperCase(),
    limit: opts.limit,
    showLinks: opts.showLinks,
    open: opts.open,
    export: opts.export,
    apiKey: opts.apiKey
  };
}

/**
 * Validates a date string in YYYY-MM-DD format.
 * 
 * @param dateStr - The date string to validate
 * @returns The parsed Date object if valid
 * @throws {ValidationError} If the format is invalid
 * 
 * **Validates: Requirement 3.4**
 */
export function validateDateFormat(dateStr: string): Date {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    throw new ValidationError('Invalid date format. Use YYYY-MM-DD');
  }
  
  const parsed = parse(dateStr, 'yyyy-MM-dd', new Date());
  if (isNaN(parsed.getTime())) {
    throw new ValidationError('Invalid date format. Use YYYY-MM-DD');
  }
  
  return parsed;
}

/**
 * Validates that a date is not in the past.
 * 
 * @param date - The date to validate
 * @throws {ValidationError} If the date is in the past
 * 
 * **Validates: Requirement 3.4**
 */
export function validateDateNotInPast(date: Date): void {
  if (isDateInPast(date)) {
    throw new ValidationError('Departure date must be today or a future date');
  }
}

/**
 * Validates that a date range does not exceed 30 days.
 * 
 * @param dateFrom - Start date
 * @param dateTo - End date
 * @throws {ValidationError} If the range exceeds 30 days
 * 
 * **Validates: Requirement 3.5**
 */
export function validateDateRange(dateFrom: Date, dateTo: Date): void {
  const daysDiff = differenceInDays(dateTo, dateFrom);
  if (daysDiff > 30) {
    throw new ValidationError('Date range cannot exceed 30 days');
  }
  if (daysDiff < 0) {
    throw new ValidationError('End date must be after start date');
  }
}

/**
 * Validates the airport code.
 * 
 * @param airport - The airport code to validate
 * @throws {ValidationError} If the airport code is invalid
 */
export function validateAirportCode(airport: string): void {
  const validAirports = ['ORD', 'MDW', 'BOTH'];
  if (!validAirports.includes(airport)) {
    throw new ValidationError(`Invalid airport code: ${airport}. Must be ORD, MDW, or BOTH`);
  }
}

/**
 * Validates and parses the return-days format (e.g., "3-7").
 * 
 * @param returnDays - The return-days string to validate
 * @returns Object with min and max days
 * @throws {ValidationError} If the format is invalid
 */
export function validateReturnDays(returnDays: string): { min: number; max: number } {
  const returnDaysRegex = /^(\d+)-(\d+)$/;
  const match = returnDays.match(returnDaysRegex);
  
  if (!match) {
    throw new ValidationError('Invalid return-days format. Use format like "3-7"');
  }
  
  const min = parseInt(match[1]!, 10);
  const max = parseInt(match[2]!, 10);
  
  if (min > max) {
    throw new ValidationError('Return-days minimum must be less than or equal to maximum');
  }
  
  if (min < 0 || max < 0) {
    throw new ValidationError('Return-days values must be non-negative');
  }
  
  return { min, max };
}

/**
 * Validates all CLI options and returns validated dates.
 * 
 * @param options - CLI options to validate
 * @returns Validated date range
 * @throws {ValidationError} If any validation fails
 * 
 * **Validates: Requirements 3.4, 3.5**
 */
export function validateOptions(options: CLIOptions): { dateFrom: Date; dateTo: Date; returnDaysMin?: number; returnDaysMax?: number } {
  // Validate airport code
  validateAirportCode(options.from);
  
  let dateFrom: Date;
  let dateTo: Date;
  
  // Handle date options
  if (options.date) {
    // Single date specified
    dateFrom = validateDateFormat(options.date);
    dateTo = dateFrom;
    validateDateNotInPast(dateFrom);
  } else if (options.dateFrom || options.dateTo) {
    // Date range specified
    if (!options.dateFrom) {
      throw new ValidationError('--date-from is required when using --date-to');
    }
    if (!options.dateTo) {
      throw new ValidationError('--date-to is required when using --date-from');
    }
    
    dateFrom = validateDateFormat(options.dateFrom);
    dateTo = validateDateFormat(options.dateTo);
    
    validateDateNotInPast(dateFrom);
    validateDateRange(dateFrom, dateTo);
  } else {
    // Default: tomorrow through 30 days from today
    dateFrom = startOfDay(addDays(new Date(), 1));
    dateTo = startOfDay(addDays(new Date(), 30));
  }
  
  // Validate return-days if specified
  let returnDaysMin: number | undefined;
  let returnDaysMax: number | undefined;
  
  if (options.returnDays) {
    const returnDaysValidated = validateReturnDays(options.returnDays);
    returnDaysMin = returnDaysValidated.min;
    returnDaysMax = returnDaysValidated.max;
  }
  
  return { dateFrom, dateTo, returnDaysMin, returnDaysMax };
}

/**
 * Builds SearchParams from CLI options and validated dates.
 * 
 * @param options - CLI options
 * @param validatedDates - Validated date range and return days
 * @param config - Application configuration
 * @returns SearchParams for the search service
 * 
 * **Validates: Requirements 3.3, 9.1, 9.3**
 */
export function buildSearchParams(
  options: CLIOptions,
  validatedDates: { dateFrom: Date; dateTo: Date; returnDaysMin?: number; returnDaysMax?: number },
  config: { defaultMaxPriceOneway: number; defaultMaxPriceRoundtrip: number; defaultLimit: number }
): SearchParams {
  // Determine origins based on --from option
  let origins: OriginAirport[];
  if (options.from === 'BOTH') {
    origins = ['ORD', 'MDW'];
  } else {
    origins = [options.from];
  }
  
  // Determine trip type
  const tripType = options.roundTrip ? 'round' : 'oneway';
  
  // Determine max price - use provided value or default based on trip type
  const defaultMaxPrice = tripType === 'round' 
    ? config.defaultMaxPriceRoundtrip 
    : config.defaultMaxPriceOneway;
  const maxPrice = options.maxPrice ?? defaultMaxPrice;
  
  // Determine destination - use provided or default to 'US' for all US airports
  const destination = options.destination ?? 'US';
  
  // Parse airline filter if provided
  const airlineFilter = options.airline 
    ? options.airline.split(',').map(code => code.trim().toUpperCase())
    : undefined;
  
  // Determine limit - use provided or default
  const limit = options.limit ?? config.defaultLimit;
  
  return {
    origins,
    destination,
    dateFrom: validatedDates.dateFrom,
    dateTo: validatedDates.dateTo,
    tripType,
    returnDaysMin: validatedDates.returnDaysMin,
    returnDaysMax: validatedDates.returnDaysMax,
    maxPrice,
    nonstopOnly: options.nonstop,
    airlineFilter,
    limit,
  };
}

/**
 * Displays results or no-results message.
 * 
 * @param flights - Array of flight results
 * @param searchParams - Search parameters used
 * @param options - CLI options
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */
export function displayResults(
  flights: FlightResult[],
  searchParams: SearchParams,
  options: CLIOptions
): void {
  if (flights.length === 0) {
    // No results found - display message and suggestion
    // Validates: Requirements 6.1, 6.2
    console.log(formatNoResults(searchParams.maxPrice));
  } else {
    // Display formatted table
    const output = formatOutput(flights, searchParams, {
      showLinks: options.showLinks,
      isRoundTrip: searchParams.tripType === 'round',
    });
    console.log(output);
  }
}

/**
 * Handles export to CSV file.
 * 
 * @param flights - Flight results to export
 * @param filePath - Path to export to
 * @param searchParams - Search parameters
 * 
 * **Validates: Requirement 10.4**
 */
export async function handleExport(
  flights: FlightResult[],
  filePath: string,
  searchParams: SearchParams
): Promise<void> {
  const exportService = new CsvExportService();
  const rowCount = await exportService.exportToCsv(flights, filePath, searchParams);
  console.log(`Exported ${rowCount} results to ${filePath}`);
}

/**
 * Handles opening a flight booking URL in the browser.
 * 
 * @param flights - Flight results
 * @param resultNumber - 1-indexed result number to open
 * 
 * **Validates: Requirement 8.2**
 */
export async function handleOpenBrowser(
  flights: FlightResult[],
  resultNumber: number
): Promise<void> {
  if (resultNumber < 1 || resultNumber > flights.length) {
    throw new ValidationError(
      `Invalid result number: ${resultNumber}. Must be between 1 and ${flights.length}`
    );
  }
  
  const flight = flights[resultNumber - 1];
  if (!flight) {
    throw new ValidationError(`Result ${resultNumber} not found`);
  }
  
  await openInBrowser(flight.bookingUrl);
}

/**
 * Main entry point for the CLI application.
 * Parses arguments, validates options, and orchestrates the search flow.
 * 
 * **Validates: Requirements 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 8.2, 9.1, 9.3, 10.4**
 */
export async function main(): Promise<void> {
  const options = parseArgs();
  
  // Task 8.2: Validate options
  const validatedDates = validateOptions(options);
  
  // Task 8.5: Load configuration and validate API key
  const config = loadConfig(options.apiKey);
  
  // Build SearchParams from CLI options
  const searchParams = buildSearchParams(options, validatedDates, {
    defaultMaxPriceOneway: config.defaultMaxPriceOneway,
    defaultMaxPriceRoundtrip: config.defaultMaxPriceRoundtrip,
    defaultLimit: config.defaultLimit,
  });
  
  // Create the search service with the Skyscanner adapter
  const retryHandler = new RetryHandler();
  const flightAdapter = new SkyscannerAdapter(config.rapidApiKey, retryHandler, config.apiBaseUrl);
  const searchService = new SearchService(flightAdapter);
  
  // Execute the search
  const searchResult = await searchService.search(searchParams);
  const flights = searchResult.flights;
  
  // Task 8.6: Display results or no-results message
  displayResults(flights, searchParams, options);
  
  // Task 8.8: Handle export if requested
  if (options.export) {
    await handleExport(flights, options.export, searchParams);
  }
  
  // Task 8.8: Handle open in browser if requested
  if (options.open !== undefined) {
    if (flights.length === 0) {
      throw new ValidationError('No results to open. Cannot use --open with empty results');
    }
    await handleOpenBrowser(flights, options.open);
  }
  
  // Exit with code 0 for success (including no results)
  // Validates: Requirement 6.3
}

// Run main if this is the entry point
// Using import.meta.url to check if this is the main module
const scriptPath = process.argv[1] ?? '';
const isMainModule = import.meta.url === `file://${scriptPath.replace(/\\/g, '/')}` || 
                     scriptPath.endsWith('cli.ts') || 
                     scriptPath.endsWith('cli.js');

if (isMainModule) {
  main().catch((error) => {
    if (error instanceof AppError) {
      console.error(error.message);
      process.exit(error.exitCode);
    } else {
      console.error(error.message || 'An unexpected error occurred');
      process.exit(1);
    }
  });
}
