# Implementation Plan: Google Flights Scraper

## Overview

Replace the RapidAPI-based Skyscanner adapter with a direct Google Flights scraping adapter, eliminating the paid API key dependency. Implementation follows a bottom-up approach: build the Protobuf encoder foundation, then the response parser, then the adapter that wires them together, then extend the types and search service, update the CLI, simplify config, and finally add tests.

## Tasks

- [x] 1. Implement Protobuf Encoder
  - [x] 1.1 Create `src/adapters/google-flights/protobuf-encoder.ts` with the `IProtobufEncoder` interface and `ProtobufEncoder` class
    - Define `GoogleFlightsQueryParams` interface with fields: origin, destination, departureDate, returnDate, tripType, seatClass, adults
    - Implement manual Protobuf wire format construction: varint encoding (wire type 0), length-delimited encoding (wire type 2) for strings and sub-messages
    - Implement `encode(params)` method that constructs nested Protobuf messages (FlightSearch → FlightLeg → FlightDate) and encodes to URL-safe Base64 (replace `+`→`-`, `/`→`_`, remove `=` padding)
    - Implement `decode(tfs)` method that reverses the encoding for testing/validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x]* 1.2 Write property test for Protobuf encoding round-trip
    - **Property 1: Protobuf Encoding Round-Trip**
    - For any valid GoogleFlightsQueryParams, encoding then decoding SHALL produce equivalent parameters
    - Generate random: 3-letter IATA codes, dates (2024–2026), tripType in {1,2}, seatClass in {1,2,3,4}, adults in 1–9
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

- [x] 2. Implement Flight Response Parser
  - [x] 2.1 Create `src/adapters/google-flights/response-parser.ts` with the `IFlightResponseParser` interface and `FlightResponseParser` class
    - Define `ParsedFlight` and `ParsedSegment` interfaces
    - Implement regex extraction of `AF_initDataCallback` blocks from HTML response
    - Implement JSON array parsing and navigation of nested array structures to extract flight offer data
    - Map raw array entries to `ParsedFlight` objects (price, origin, destination, departure/arrival times, duration, airlines, segments, isBasicEconomy)
    - Skip entries with missing required fields (price, departure time, destination)
    - Generate Google Flights booking URLs as deep_link values
    - Return empty array when no recognizable flight data structures are found
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 2.2 Write property test for parser output shape validity
    - **Property 2: Parser Output Shape Validity**
    - For any valid response body with `AF_initDataCallback` format, every output element SHALL have all required SkyscannerFlight fields populated
    - Generate valid nested arrays matching the callback format
    - **Validates: Requirements 3.1, 3.2, 3.5**

  - [x]* 2.3 Write property test for parser skipping incomplete entries
    - **Property 3: Parser Skips Incomplete Entries**
    - For any array of flight entries with some missing required fields, parser SHALL return only complete entries
    - Generate mixes of complete and incomplete flight data arrays
    - **Validates: Requirements 3.4**

- [x] 3. Implement Google Flights Adapter
  - [x] 3.1 Create `src/adapters/google-flights/adapter.ts` with the `GoogleFlightsAdapter` class implementing `IFlightAdapter`
    - Accept `IRetryHandler`, `IProtobufEncoder`, `IFlightResponseParser`, and `requestTimeoutMs` as constructor dependencies
    - Implement `searchFlights(request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]>`
    - Map `SkyscannerSearchRequest` fields to `GoogleFlightsQueryParams` (including seat_class and adults)
    - Construct HTTP GET URL: `https://www.google.com/travel/flights?tfs={encoded}&curr=USD&hl=en`
    - Set browser-like headers (User-Agent, Accept, Accept-Language, Accept-Encoding, Connection, Cache-Control)
    - Set request timeout to 15 seconds
    - On HTTP 200: pass response body to parser
    - On HTTP 429 or 5xx: delegate to RetryHandler with `{ maxAttempts: 3, baseDelayMs: 1000 }`
    - On HTTP 403 or CAPTCHA detection: throw `ApiError` with descriptive blocked message
    - On network error: throw `ApiError` with cause description
    - On parse failure (empty result from parser): log warning to stderr, return empty array
    - Map `ParsedFlight[]` to `SkyscannerFlight[]` (generate SHA-256 id, map duration to seconds, construct route segments)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3, 4.4, 11.1, 11.2, 11.3, 11.4_

  - [x] 3.2 Create `src/adapters/google-flights/index.ts` barrel export
    - Export all public types and classes from protobuf-encoder, response-parser, and adapter
    - _Requirements: 4.1_

- [x] 4. Checkpoint - Ensure adapter builds cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Extend types and search service with new filters
  - [x] 5.1 Modify `src/types.ts` to add new fields to `SearchParams` interface
    - Add `seatClass?: 'economy' | 'premium-economy' | 'business' | 'first'`
    - Add `adults?: number`
    - Add `departureAfter?: string` (HH:mm format)
    - Add `departureBefore?: string` (HH:mm format)
    - Add `maxDuration?: number` (minutes)
    - Add `excludeBasicEconomy?: boolean`
    - Add `isBasicEconomy?: boolean` field to `FlightResult` interface
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 7.1, 7.2, 8.1, 8.2, 9.1, 9.2_

  - [x] 5.2 Modify `src/adapters/skyscanner.ts` to extend `SkyscannerSearchRequest` interface
    - Add `seat_class?: number` field (1=economy, 2=premium-economy, 3=business, 4=first)
    - Add `adults?: number` field
    - _Requirements: 4.1, 5.1, 6.4_

  - [x] 5.3 Modify `src/services/search.ts` to add new filter functions and update `transformToKiwiRequest`
    - Add `filterByDepartureTime(flights, departureAfter?, departureBefore?)` function that filters flights by departure time window (inclusive of boundaries)
    - Add `filterByMaxDuration(flights, maxDuration)` function that excludes flights exceeding the max duration
    - Add `filterByBasicEconomy(flights)` function that excludes flights where `isBasicEconomy` is true
    - Update `transformToKiwiRequest` to pass `seat_class` and `adults` from SearchParams to the request
    - Update `SearchService.search()` to apply new filters (departure time, max duration, basic economy) after existing filters
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 9.1, 9.2_

  - [x]* 5.4 Write property test for departure time window filter
    - **Property 4: Departure Time Window Filter**
    - For any departure time window and any list of FlightResult objects, filter SHALL return only flights within the window (inclusive)
    - Generate random HH:mm times and random FlightResult lists
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [x]* 5.5 Write property test for max duration filter
    - **Property 5: Max Duration Filter**
    - For any positive integer maxDuration and any list of FlightResult objects, filter SHALL return only flights with duration <= maxDuration
    - Generate random positive integers and random FlightResult lists
    - **Validates: Requirements 8.1**

  - [x]* 5.6 Write property test for basic economy exclusion filter
    - **Property 6: Basic Economy Exclusion Filter**
    - For any list of FlightResult objects with isBasicEconomy flags, filter SHALL return only non-basic-economy flights
    - Generate random FlightResult lists with random isBasicEconomy booleans
    - **Validates: Requirements 9.1**

- [x] 6. Update CLI with new options and remove API key dependency
  - [x] 6.1 Modify `src/cli.ts` to add new CLI options and remove `--api-key`
    - Add `--seat <CLASS>` option with choices: economy, premium-economy, business, first (default: economy)
    - Add `--adults <N>` option accepting integer 1–9 (default: 1)
    - Add `--departure-after <HH:mm>` option for minimum departure time
    - Add `--departure-before <HH:mm>` option for maximum departure time
    - Add `--max-duration <MINUTES>` option for maximum flight duration
    - Add `--exclude-basic-economy` boolean flag (default: false)
    - Remove the `--api-key <KEY>` option entirely
    - Add validation: seat class must be one of the valid values (error + non-zero exit if invalid)
    - Add validation: adults must be integer 1–9 (error + non-zero exit if invalid)
    - Add validation: departure time must match HH:mm format 00:00–23:59 (error + non-zero exit if invalid)
    - Add validation: max-duration must be positive integer (error + non-zero exit if invalid)
    - Update `buildSearchParams` to pass new fields to SearchParams
    - Update `main()` to instantiate `GoogleFlightsAdapter` instead of `SkyscannerAdapter` (no API key needed)
    - Update imports to use new Google Flights adapter
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 9.1, 9.2, 10.4_

  - [x]* 6.2 Write property test for invalid adults rejection
    - **Property 7: Invalid Adults Rejection**
    - For any integer outside [1, 9], the validator SHALL reject and signal error
    - Generate random integers outside the valid range (0, negatives, >9)
    - **Validates: Requirements 6.3**

  - [x]* 6.3 Write property test for invalid time format rejection
    - **Property 8: Invalid Time Format Rejection**
    - For any string not matching HH:mm (00–23:00–59), the validator SHALL reject and signal error
    - Generate random strings not matching the valid pattern
    - **Validates: Requirements 7.4**

- [x] 7. Simplify configuration module
  - [x] 7.1 Modify `src/config.ts` to remove API key dependency
    - Remove `rapidApiKey`, `kiwiApiKey`, `kiwiBaseUrl` fields from `AppConfig` interface
    - Add `googleFlightsBaseUrl: string` field (default: `https://www.google.com/travel/flights`)
    - Update `loadConfig()` to require no API key — remove environment variable checks and error throwing
    - Remove `apiKeyOverride` parameter from `loadConfig()`
    - Keep all default pricing, date range, and limit fields unchanged
    - Remove legacy alias fields
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Unit tests for new components
  - [x]* 9.1 Write unit tests for ProtobufEncoder
    - Test specific known encodings (ORD→LAX, 2024-06-15, economy, 1 adult) verified against captured real tfs values
    - Test round-trip encoding with return date
    - Test all seat class values
    - Test passenger counts 1–9
    - File: `tests/unit/protobuf-encoder.test.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x]* 9.2 Write unit tests for FlightResponseParser
    - Parse fixture response bodies and verify correct extraction
    - Test empty/malformed responses return empty array
    - Test entries with missing fields are skipped
    - Test deep_link URL generation
    - File: `tests/unit/response-parser.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 9.3 Write unit tests for GoogleFlightsAdapter
    - Mock HTTP responses and parser, verify orchestration flow
    - Test retry behavior on 429 and 5xx
    - Test blocking detection on 403 and CAPTCHA
    - Test timeout handling
    - File: `tests/unit/google-flights-adapter.test.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 11.1, 11.2, 11.3, 11.4_

  - [x]* 9.4 Write unit tests for new search service filters
    - Test filterByDepartureTime with various time windows
    - Test filterByMaxDuration with edge cases
    - Test filterByBasicEconomy with mixed lists
    - File: `tests/unit/search-filters.test.ts`
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 9.1_

  - [x]* 9.5 Update existing unit tests for config and CLI
    - Update `tests/unit/config.test.ts` to verify loadConfig() works without env vars
    - Update CLI tests for new options and removed --api-key
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 10. Final checkpoint - Ensure all tests pass and integration works
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design (8 total)
- Unit tests validate specific examples and edge cases
- The existing `SkyscannerAdapter` is kept in the codebase for potential fallback but is no longer wired in `main()`
- All new code uses TypeScript with the existing project conventions (ESM, vitest, fast-check)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3", "3.1", "5.1", "5.2"] },
    { "id": 2, "tasks": ["3.2", "5.3"] },
    { "id": 3, "tasks": ["5.4", "5.5", "5.6", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5"] }
  ]
}
```
