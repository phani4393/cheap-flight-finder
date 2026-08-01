# Requirements Document

## Introduction

Replace the RapidAPI Flight Scanner adapter with a direct Google Flights scraping adapter, eliminating the paid API key dependency. The new adapter constructs Protobuf-encoded Base64 query strings to fetch Google Flights search results and parses flight data from embedded JavaScript in the response page. Additionally, new CLI search filters are introduced to provide finer control over flight searches (seat class, passenger count, departure time window, max duration, and basic economy exclusion).

## Glossary

- **Google_Flights_Adapter**: The new adapter module implementing the `IFlightAdapter` interface that scrapes Google Flights directly without requiring an API key.
- **Protobuf_Encoder**: The component responsible for constructing Protocol Buffer-encoded, Base64-encoded query strings used as the `tfs` URL parameter in Google Flights requests.
- **Flight_Response_Parser**: The component that extracts structured flight data from JavaScript data embedded in the Google Flights HTML response page.
- **Search_Service**: The existing orchestration layer (`SearchService`) that calls the flight adapter and applies client-side filtering and sorting.
- **CLI**: The command-line interface (`cli.ts`) that parses user arguments and drives the search flow.
- **Flight_Finder**: The overall cheap-flight-finder application.
- **Seat_Class**: The cabin class for the flight search, one of: economy, premium-economy, business, or first.
- **TFS_Parameter**: The URL query parameter used by Google Flights that contains a Protobuf-encoded, Base64-encoded representation of the flight search query.

## Requirements

### Requirement 1: Protobuf Query Encoding

**User Story:** As a developer, I want the adapter to construct properly encoded Google Flights query strings, so that valid search requests can be made without an API key.

#### Acceptance Criteria

1. WHEN a flight search is initiated, THE Protobuf_Encoder SHALL encode the origin airport IATA code, destination airport IATA code, departure date, and trip type into a Protobuf binary message.
2. WHEN the Protobuf binary message is constructed, THE Protobuf_Encoder SHALL encode the binary data using URL-safe Base64 encoding to produce the TFS_Parameter value.
3. WHEN a round-trip search is initiated, THE Protobuf_Encoder SHALL encode both the outbound departure date and the return date into the Protobuf message.
4. WHEN a seat class other than economy is specified, THE Protobuf_Encoder SHALL include the seat class parameter in the Protobuf message.
5. WHEN a passenger count greater than 1 is specified, THE Protobuf_Encoder SHALL include the adult passenger count in the Protobuf message.
6. FOR ALL valid SearchParams inputs, encoding then decoding the TFS_Parameter SHALL produce an equivalent set of search parameters (round-trip property).

### Requirement 2: Google Flights HTTP Request

**User Story:** As a user, I want the adapter to fetch Google Flights search results directly, so that I can search for flights without paying for an API subscription.

#### Acceptance Criteria

1. WHEN a search is executed, THE Google_Flights_Adapter SHALL construct an HTTP GET request to the Google Flights URL with the encoded TFS_Parameter as a query parameter.
2. THE Google_Flights_Adapter SHALL include browser-like HTTP headers (User-Agent, Accept-Language, Accept) to avoid automated request detection.
3. WHEN the HTTP response status code is 200, THE Google_Flights_Adapter SHALL pass the response body to the Flight_Response_Parser.
4. WHEN the HTTP response status code is 429, THE Google_Flights_Adapter SHALL wait and retry the request using exponential backoff with a maximum of 3 retry attempts.
5. WHEN the HTTP response status code indicates a server error (5xx), THE Google_Flights_Adapter SHALL retry the request using exponential backoff with a maximum of 3 retry attempts.
6. THE Google_Flights_Adapter SHALL complete each individual search request within 15 seconds.

### Requirement 3: Flight Response Parsing

**User Story:** As a developer, I want to reliably parse flight data from Google Flights responses, so that search results can be displayed to the user.

#### Acceptance Criteria

1. WHEN a valid Google Flights response body is received, THE Flight_Response_Parser SHALL extract flight data from embedded JavaScript arrays in the response rather than parsing HTML DOM elements.
2. WHEN flight data is extracted, THE Flight_Response_Parser SHALL map each flight entry to the existing `SkyscannerFlight` interface shape including: id, price, flyFrom, flyTo, cityFrom, cityTo, local_departure, local_arrival, duration, airlines, route segments, and deep_link.
3. WHEN the response body does not contain recognizable flight data structures, THE Flight_Response_Parser SHALL return an empty array.
4. WHEN an individual flight entry is missing required fields (price, departure time, or destination), THE Flight_Response_Parser SHALL skip that entry and continue parsing remaining entries.
5. THE Flight_Response_Parser SHALL generate a Google Flights booking URL for each parsed flight result as the deep_link value.

### Requirement 4: Adapter Interface Compatibility

**User Story:** As a developer, I want the new adapter to be a drop-in replacement for the existing Skyscanner adapter, so that no changes are needed in the search service or formatters.

#### Acceptance Criteria

1. THE Google_Flights_Adapter SHALL implement the existing `IFlightAdapter` interface with a `searchFlights` method accepting a `SkyscannerSearchRequest` parameter.
2. THE Google_Flights_Adapter SHALL return an array of `SkyscannerFlight` objects matching the existing interface shape.
3. WHEN the adapter is instantiated, THE Google_Flights_Adapter SHALL require no API key or authentication credential as a constructor parameter.
4. THE Google_Flights_Adapter SHALL accept an `IRetryHandler` dependency for retry logic, consistent with the existing adapter pattern.

### Requirement 5: Seat Class CLI Filter

**User Story:** As a user, I want to specify the cabin class when searching for flights, so that I can find business or first class deals.

#### Acceptance Criteria

1. WHEN the `--seat` option is provided with a value of "economy", "premium-economy", "business", or "first", THE CLI SHALL pass the specified Seat_Class to the search parameters.
2. WHEN the `--seat` option is not provided, THE Flight_Finder SHALL default the Seat_Class to "economy".
3. WHEN an invalid `--seat` value is provided, THE CLI SHALL display an error message listing the valid options and exit with a non-zero exit code.

### Requirement 6: Passenger Count CLI Filter

**User Story:** As a user, I want to specify the number of adult passengers, so that I can see accurate pricing for group travel.

#### Acceptance Criteria

1. WHEN the `--adults` option is provided with an integer between 1 and 9, THE CLI SHALL pass the passenger count to the search parameters.
2. WHEN the `--adults` option is not provided, THE Flight_Finder SHALL default the passenger count to 1.
3. WHEN the `--adults` option is provided with a value less than 1 or greater than 9, THE CLI SHALL display an error message and exit with a non-zero exit code.
4. WHEN a passenger count greater than 1 is specified, THE Google_Flights_Adapter SHALL include the adult count in the Protobuf-encoded query.

### Requirement 7: Departure Time Window CLI Filter

**User Story:** As a user, I want to filter flights by departure time, so that I can find flights that fit my schedule.

#### Acceptance Criteria

1. WHEN the `--departure-after` option is provided with a time in HH:mm format, THE Search_Service SHALL exclude flight results with a departure time earlier than the specified time.
2. WHEN the `--departure-before` option is provided with a time in HH:mm format, THE Search_Service SHALL exclude flight results with a departure time later than the specified time.
3. WHEN both `--departure-after` and `--departure-before` are provided, THE Search_Service SHALL include only flights departing within the specified time window (inclusive of boundary values).
4. WHEN a time filter value does not match the HH:mm format (24-hour clock, 00:00 to 23:59), THE CLI SHALL display an error message and exit with a non-zero exit code.

### Requirement 8: Maximum Duration CLI Filter

**User Story:** As a user, I want to filter out flights that are too long, so that I can avoid lengthy layovers or indirect routes.

#### Acceptance Criteria

1. WHEN the `--max-duration` option is provided with a positive integer representing minutes, THE Search_Service SHALL exclude flight results with a duration exceeding the specified value.
2. WHEN the `--max-duration` option is not provided, THE Search_Service SHALL apply no duration filter.
3. WHEN the `--max-duration` value is not a positive integer, THE CLI SHALL display an error message and exit with a non-zero exit code.

### Requirement 9: Exclude Basic Economy CLI Filter

**User Story:** As a user, I want to exclude basic economy fares, so that I only see flights with standard amenities like seat selection and carry-on bags.

#### Acceptance Criteria

1. WHEN the `--exclude-basic-economy` flag is provided, THE Search_Service SHALL exclude flight results tagged as basic economy fares.
2. WHEN the `--exclude-basic-economy` flag is not provided, THE Search_Service SHALL include all fare types in results.

### Requirement 10: Remove RapidAPI Dependency

**User Story:** As a user, I want the tool to work without any API key setup, so that I can search for flights immediately after installation.

#### Acceptance Criteria

1. THE Flight_Finder SHALL operate without requiring the `RAPIDAPI_KEY` environment variable.
2. THE Flight_Finder SHALL operate without requiring any API key or authentication token for basic flight search functionality.
3. WHEN the application starts, THE CLI SHALL NOT display an error if the `RAPIDAPI_KEY` environment variable is unset.
4. THE Flight_Finder SHALL remove the `--api-key` CLI option.
5. THE Flight_Finder SHALL update the configuration module to remove API key loading and validation logic.

### Requirement 11: Error Handling for Scraping Failures

**User Story:** As a user, I want clear error messages when Google Flights is unavailable or blocks the request, so that I understand what went wrong.

#### Acceptance Criteria

1. IF Google Flights blocks the request (HTTP 403 or CAPTCHA detection in response), THEN THE Google_Flights_Adapter SHALL return a descriptive error message indicating the request was blocked and suggest waiting before retrying.
2. IF the Google Flights response format changes and the Flight_Response_Parser cannot extract flight data, THEN THE Google_Flights_Adapter SHALL return an empty result set and log a warning to stderr.
3. IF a network error occurs (DNS failure, connection timeout, connection refused), THEN THE Google_Flights_Adapter SHALL throw an error with a descriptive message including the underlying cause.
4. IF all retry attempts are exhausted, THEN THE Google_Flights_Adapter SHALL throw an error indicating the maximum retry count was reached.
