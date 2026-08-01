# Implementation Plan: Cheap Flight Finder

## Overview

This implementation plan breaks down the Cheap Flight Finder CLI application into actionable coding tasks. The app will search for low-cost flights from Chicago airports (ORD/MDW) to US destinations using the Kiwi Tequila API, displaying results in a formatted terminal table with filtering, sorting, and export capabilities.

The implementation follows a bottom-up approach: core utilities first, then the API adapter, search service, formatters, and finally the CLI entry point to wire everything together.

## Tasks

- [x] 1. Set up project structure and configuration
  - [x] 1.1 Initialize Node.js project with TypeScript configuration
    - Create package.json with dependencies (commander, axios, cli-table3, date-fns, csv-stringify, open)
    - Create tsconfig.json with strict mode, ES2022 target, Node16 module resolution
    - Create vitest.config.ts for testing with fast-check
    - Set up src/ and tests/ directory structure
    - _Requirements: All (foundation)_

  - [x] 1.2 Create shared types and interfaces
    - Create `src/types.ts` with OriginAirport, FlightResult, SearchParams, SearchResult interfaces
    - Create `src/config.ts` with AppConfig interface and loadConfig() function
    - Implement environment variable loading for KIWI_API_KEY with helpful error message
    - Define default configuration values (price thresholds, date ranges, limits)
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 1.3 Create custom error classes
    - Create `src/errors.ts` with AppError base class
    - Implement ConfigError, ValidationError, and ApiError subclasses
    - Include exitCode and isUserFacing properties for proper error handling
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [x] 2. Implement core utilities
  - [x] 2.1 Implement retry handler with exponential backoff
    - Create `src/utils/retry.ts` with IRetryHandler interface
    - Implement withRetry() function with configurable max attempts and base delay
    - Apply exponential backoff formula: delay = baseDelay * 2^(attempt-1)
    - Support retryable status codes (408, 429, 500, 502, 503, 504)
    - _Requirements: 7.3, 7.4_

  - [x] 2.2 Write property test for retry backoff timing (Property 12)
    - **Property 12: Retry Backoff Timing**
    - Verify delay before retry K equals baseDelay * 2^(K-1) milliseconds
    - **Validates: Requirements 7.3**

  - [x] 2.3 Implement date formatting utilities
    - Create `src/utils/dates.ts` with date helper functions
    - Implement formatForKiwiApi() to convert Date to DD/MM/YYYY format
    - Implement formatForDisplay() for "Mar 15" abbreviated format
    - Implement formatTime() for 12-hour format (e.g., "6:30am")
    - Implement isDateInPast() validation helper
    - _Requirements: 3.6, 4.4, 4.5_

  - [x] 2.4 Write property test for date range boundary inclusion (Property 3)
    - **Property 3: Date Range Boundary Inclusion**
    - Verify API request includes exact boundary dates
    - **Validates: Requirements 3.1, 3.2**

  - [x] 2.5 Implement browser URL opener utility
    - Create `src/utils/browser.ts` using the 'open' package
    - Implement openInBrowser() function to launch default browser with booking URL
    - _Requirements: 8.2_

- [x] 3. Checkpoint - Verify core utilities
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Kiwi API adapter
  - [x] 4.1 Create Kiwi API adapter with request formatting
    - Create `src/adapters/kiwi.ts` with IKiwiAdapter interface
    - Implement searchFlights() method that constructs API requests
    - Format dates as DD/MM/YYYY, set currency to USD, include apikey header
    - Configure axios with 30-second timeout and retry handler integration
    - _Requirements: 1.1, 1.5, 1.6, 2.1_

  - [x] 4.2 Implement response parsing and error mapping
    - Parse KiwiSearchResponse into KiwiFlight[] array
    - Map HTTP 401 to "Invalid API key" error message
    - Map HTTP 429 to "Rate limit exceeded" error message
    - Map network timeouts and 5xx errors to appropriate messages
    - Ensure API key is never logged or displayed
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 9.4_

  - [x] 4.3 Write property test for API key never logged (Property 11)
    - **Property 11: API Key Never Logged**
    - Verify API key value never appears in stdout, stderr, or logs
    - **Validates: Requirements 9.4**

  - [x] 4.4 Write unit tests for Kiwi adapter error handling
    - Test 401 response returns correct error message
    - Test 429 response returns rate limit message
    - Test network timeout triggers retry
    - Use nock for HTTP mocking
    - _Requirements: 7.1, 7.2_

- [x] 5. Implement search service
  - [x] 5.1 Create search service with parameter transformation
    - Create `src/services/search.ts` with ISearchService interface
    - Transform SearchParams to KiwiSearchRequest format
    - Set price_to based on trip type (100 one-way, 200 round-trip)
    - Set max_stopovers=0 when nonstopOnly is true
    - Handle fly_to=US for all destinations or specific airport code
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 5.1, 5.5_

  - [x] 5.2 Implement multi-origin search with result merging
    - Make parallel API calls when searching both ORD and MDW
    - Merge results from multiple origins into single array
    - Remove duplicates (same flight from same origin)
    - _Requirements: 1.3, 1.4_

  - [x] 5.3 Write property test for origin airport correctness (Property 2)
    - **Property 2: Origin Airport Correctness**
    - Verify search queries exactly the specified airports
    - Verify BOTH selection returns union of ORD and MDW results
    - **Validates: Requirements 1.3, 1.4**

  - [x] 5.4 Implement result transformation and filtering
    - Transform KiwiFlight[] to FlightResult[] with normalized fields
    - Apply client-side price filtering below threshold
    - Apply airline filter when specified (match any airline in flight.airlines)
    - Calculate duration in minutes from API duration.departure seconds
    - Determine stop count from route segments
    - _Requirements: 5.2, 5.3_

  - [x] 5.5 Write property test for price filter accuracy (Property 1)
    - **Property 1: Price Filter Accuracy**
    - Verify all results have price < threshold
    - Verify all flights below threshold are included
    - **Validates: Requirements 1.2, 2.2, 5.3**

  - [x] 5.6 Write property test for airline filter correctness (Property 7)
    - **Property 7: Airline Filter Correctness**
    - Verify filtered flights have at least one airline from filter set
    - **Validates: Requirements 5.2**

  - [x] 5.7 Implement sorting and limit enforcement
    - Sort results by price ascending (cheapest first)
    - Apply limit to restrict number of results returned
    - _Requirements: 4.8, 5.4_

  - [x] 5.8 Write property test for results sorted by price (Property 5)
    - **Property 5: Results Sorted by Price**
    - Verify consecutive pairs satisfy results[i].price ≤ results[i+1].price
    - **Validates: Requirements 4.8**

  - [x] 5.9 Write property test for limit enforcement (Property 10)
    - **Property 10: Limit Enforcement**
    - Verify displayed results contain at most N flights
    - **Validates: Requirements 5.4**

  - [x] 5.10 Implement round-trip search parameters
    - Set flight_type=round for round-trip searches
    - Set nights_in_dst_from and nights_in_dst_to from return window
    - Default to 2-7 days if no return window specified
    - Include return flight details in FlightResult
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 5.11 Write property test for round-trip return window (Property 8)
    - **Property 8: Round-Trip Return Window**
    - Verify (returnDate - departureDate) is within [min, max] days
    - **Validates: Requirements 2.3, 2.4**

- [x] 6. Checkpoint - Verify search functionality
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement output formatters
  - [x] 7.1 Implement terminal table formatter
    - Create `src/formatters/table.ts` with IResultFormatter interface
    - Use cli-table3 to create formatted table with columns: Price, Route, Date, Time, Airline, Duration, Stops
    - Format Price as "$XX" (e.g., "$67")
    - Format Route as "ORD → LAX"
    - Format Duration as "Xh Ym" (e.g., "4h 15m")
    - Format Stops as "Nonstop", "1 stop", "2 stops"
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 7.2 Implement round-trip display formatting
    - Display outbound and return on two lines, grouped together
    - Add visual separator between flight pairs
    - _Requirements: 4.10_

  - [x] 7.3 Implement summary and booking link display
    - Create formatSummary() showing "Found X flights from $Y to $Z"
    - Optionally display booking URLs when --show-links is enabled
    - Add disclaimer "Note: Prices may differ on booking site"
    - _Requirements: 4.9, 8.1, 8.3_

  - [x] 7.4 Write unit tests for table formatter
    - Test price formatting, route formatting, time formatting
    - Test nonstop vs stop count display
    - Test round-trip grouping
    - _Requirements: 4.1-4.10_

  - [x] 7.5 Implement CSV exporter
    - Create `src/formatters/csv.ts` with IExportService interface
    - Use csv-stringify to generate CSV with columns: price, origin, destination, departure_date, departure_time, arrival_time, airline, duration_minutes, stops, booking_url
    - Include header row as first line
    - Write to specified file path with proper error handling
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 7.6 Write property test for export row count (Property 9)
    - **Property 9: Export Row Count**
    - Verify CSV contains exactly (N + 1) rows (header + N results)
    - **Validates: Requirements 10.2**

- [x] 8. Implement CLI entry point
  - [x] 8.1 Create CLI parser with Commander.js
    - Create `src/cli.ts` as main entry point
    - Define all CLI options: --from, --date, --date-from, --date-to, --round-trip, --return-days, --nonstop, --airline, --max-price, --destination, --limit, --show-links, --open, --export, --api-key
    - Set up --help and --version flags
    - Include example commands in help text
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 8.2 Implement input validation
    - Validate date format (YYYY-MM-DD)
    - Check departure date is not in the past (exit with code 1 if invalid)
    - Check date range does not exceed 30 days (exit with code 1 if invalid)
    - Validate airport codes (ORD, MDW, or BOTH)
    - Validate return-days format (e.g., "3-7")
    - _Requirements: 3.4, 3.5_

  - [x] 8.3 Write property test for past date rejection (Property 4)
    - **Property 4: Past Date Rejection**
    - Verify dates before today are rejected before any API call
    - **Validates: Requirements 3.4**

  - [x] 8.4 Write property test for exit code consistency (Property 13)
    - **Property 13: Exit Code Consistency**
    - Verify validation/API errors exit with code 1
    - Verify successful execution (including zero results) exits with code 0
    - **Validates: Requirements 3.4, 3.5, 6.3, 7.1, 7.2, 7.3, 7.4**

  - [x] 8.5 Implement main search flow
    - Load configuration and validate API key
    - Build SearchParams from CLI options
    - Apply defaults (next 30 days, both airports, limit 20)
    - Call search service and handle results
    - _Requirements: 3.3, 9.1, 9.3_

  - [x] 8.6 Implement result display and no-results handling
    - Display formatted table when results found
    - Show "No flights found under $X for your search criteria" when empty
    - Suggest "Try expanding your date range, increasing max price, or searching from both airports"
    - Exit with code 0 for no results (not an error)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 8.7 Write property test for nonstop filter completeness (Property 6)
    - **Property 6: Nonstop Filter Completeness**
    - Verify all flights have stops === 0 when --nonstop is set
    - **Validates: Requirements 5.1**

  - [x] 8.8 Implement export and browser integration
    - Handle --export flag to write CSV file
    - Display "Exported X results to filename.csv" on success
    - Handle --open N to open result N's booking URL in browser
    - _Requirements: 8.2, 10.4_

- [x] 9. Checkpoint - Verify CLI integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Final integration and polish
  - [x] 10.1 Wire all components together in main entry
    - Ensure proper dependency injection between components
    - Add proper error boundaries and exit code handling
    - Implement stderr logging for errors with stdout for user messages
    - _Requirements: 7.5_

  - [x] 10.2 Write integration tests for CLI end-to-end flow
    - Test happy path: search returns results
    - Test error path: invalid API key
    - Test no results handling
    - Test export functionality
    - Use nock for API mocking
    - _Requirements: All_

  - [x] 10.3 Add build scripts and npm bin configuration
    - Configure package.json bin field for global installation
    - Add build script to compile TypeScript
    - Add test script for vitest
    - Create README.md with installation and usage instructions
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 11. Final checkpoint - Complete verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation follows a bottom-up approach, building utilities before services before CLI
- All 13 correctness properties from the design document have corresponding test tasks
- TypeScript strict mode is used throughout for type safety

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.3", "2.5"] },
    { "id": 3, "tasks": ["2.2", "2.4"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2", "5.10"] },
    { "id": 8, "tasks": ["5.3", "5.4"] },
    { "id": 9, "tasks": ["5.5", "5.6", "5.7"] },
    { "id": 10, "tasks": ["5.8", "5.9", "5.11"] },
    { "id": 11, "tasks": ["7.1"] },
    { "id": 12, "tasks": ["7.2", "7.3", "7.5"] },
    { "id": 13, "tasks": ["7.4", "7.6"] },
    { "id": 14, "tasks": ["8.1"] },
    { "id": 15, "tasks": ["8.2", "8.5"] },
    { "id": 16, "tasks": ["8.3", "8.4", "8.6"] },
    { "id": 17, "tasks": ["8.7", "8.8"] },
    { "id": 18, "tasks": ["10.1"] },
    { "id": 19, "tasks": ["10.2", "10.3"] }
  ]
}
```
