# Requirements Document

## Introduction

The Cheap Flight Finder is a command-line application that discovers low-cost flights (under $100 one-way, under $200 round-trip) departing from Chicago airports (ORD and MDW) to any destination within the United States. The application uses the Kiwi Tequila API to search for deals and presents results in a terminal interface with filtering and export capabilities.

Unlike traditional flight search where you specify a destination, this tool answers the question: "Where can I fly cheaply from Chicago?" - surfacing deals you might never have thought to search for.

## Glossary

- **Flight_Finder**: The CLI application that searches for and displays cheap flights
- **Origin_Airport**: A departure airport in Chicago (ORD - O'Hare International or MDW - Midway International)
- **Destination_Airport**: Any commercial airport within the United States
- **Flight_Result**: A single flight itinerary returned by a search, containing price, route, timing, and airline information
- **Price_Threshold**: The maximum price below which a flight is considered "cheap" ($100 for one-way, $200 for round-trip by default)
- **Search_Query**: A user-initiated request specifying search parameters (dates, trip type, origin preferences)
- **Kiwi_Tequila_API**: The external flight data provider (https://tequila-api.kiwi.com) used to retrieve pricing and availability
- **Date_Range**: A span of departure dates within which the user wants to find cheap flights
- **Trip_Type**: Either "one-way" (outbound only) or "round-trip" (outbound + return)
- **Return_Window**: For round-trip searches, the acceptable range of return dates (e.g., 3-7 days after departure)

## Requirements

### Requirement 1: Search for Cheap One-Way Flights

**User Story:** As a budget traveler, I want to search for one-way flights under $100 from Chicago airports to any US destination, so that I can find affordable travel opportunities I didn't know existed.

#### Acceptance Criteria

1. WHEN a user initiates a one-way search, THE Flight_Finder SHALL call the Kiwi Tequila API with `fly_from` set to the Origin_Airport(s) and `fly_to` set to "US" (country code) to search all US destinations in a single API call
2. THE Flight_Finder SHALL include `price_to=100` in the API request to filter results server-side to flights under $100
3. WHEN no Origin_Airport preference is specified, THE Flight_Finder SHALL make two API calls (one for ORD, one for MDW) and merge the results
4. WHEN an Origin_Airport preference is specified (via `--from ORD` or `--from MDW`), THE Flight_Finder SHALL search only from that airport
5. THE Flight_Finder SHALL include the Kiwi API key in the `apikey` header of each request
6. THE Flight_Finder SHALL set `curr=USD` to receive prices in US dollars

### Requirement 2: Search for Cheap Round-Trip Flights

**User Story:** As a traveler planning a short trip, I want to search for round-trip flights under $200 from Chicago to any US destination, so that I can find complete trip options at low cost.

#### Acceptance Criteria

1. WHEN a user initiates a round-trip search (via `--round-trip` flag), THE Flight_Finder SHALL call the Kiwi Tequila API with `flight_type=round` parameter
2. THE Flight_Finder SHALL set `price_to=200` for round-trip searches (2x the one-way threshold)
3. WHEN a user specifies a return window (via `--return-days 3-7`), THE Flight_Finder SHALL set `nights_in_dst_from` and `nights_in_dst_to` parameters accordingly
4. IF no return window is specified, THE Flight_Finder SHALL default to `nights_in_dst_from=2` and `nights_in_dst_to=7` (2-7 day trips)
5. THE Flight_Finder SHALL display both outbound and return flight details for each round-trip result

### Requirement 3: Specify Search Date Parameters

**User Story:** As a user, I want to specify when I want to travel, so that I can find cheap flights for my available travel dates.

#### Acceptance Criteria

1. WHEN a user specifies a single departure date (via `--date 2024-03-15`), THE Flight_Finder SHALL set `date_from` and `date_to` to that same date
2. WHEN a user specifies a date range (via `--date-from 2024-03-15 --date-to 2024-03-22`), THE Flight_Finder SHALL search across all dates in that range
3. IF no date is specified, THE Flight_Finder SHALL default to searching from tomorrow through 30 days from today
4. IF a user specifies a departure date in the past, THEN THE Flight_Finder SHALL exit with error code 1 and message "Error: Departure date must be today or a future date"
5. IF date range exceeds 30 days, THEN THE Flight_Finder SHALL exit with error code 1 and message "Error: Date range cannot exceed 30 days"
6. THE Flight_Finder SHALL format dates as DD/MM/YYYY for the Kiwi API `date_from` and `date_to` parameters

### Requirement 4: Display Flight Results in Terminal

**User Story:** As a user, I want to see relevant details about each cheap flight in my terminal, so that I can quickly evaluate the deals.

#### Acceptance Criteria

1. THE Flight_Finder SHALL display results in a formatted table with columns: Price, Route, Date, Time, Airline, Duration, Stops
2. THE Flight_Finder SHALL format Price as "$XX" (e.g., "$67")
3. THE Flight_Finder SHALL format Route as "ORD → LAX" (origin → destination airport codes)
4. THE Flight_Finder SHALL format Date as "Mar 15" (abbreviated month + day)
5. THE Flight_Finder SHALL format Time as departure time in 12-hour format (e.g., "6:30am")
6. THE Flight_Finder SHALL format Duration as "Xh Ym" (e.g., "4h 15m")
7. THE Flight_Finder SHALL display Stops as "Nonstop" or "1 stop" or "2 stops"
8. WHEN results are displayed, THE Flight_Finder SHALL sort by price ascending (cheapest first)
9. THE Flight_Finder SHALL display a summary line showing total results found and price range
10. FOR round-trip results, THE Flight_Finder SHALL display outbound and return on two lines, grouped together

### Requirement 5: Filter Search Results via CLI Flags

**User Story:** As a user, I want to filter results using command-line options, so that I can narrow down to flights that match my preferences.

#### Acceptance Criteria

1. WHEN `--nonstop` flag is provided, THE Flight_Finder SHALL include `max_stopovers=0` in the API request
2. WHEN `--airline UA,AA` is provided, THE Flight_Finder SHALL filter results client-side to only show flights from specified airlines
3. WHEN `--max-price 75` is provided, THE Flight_Finder SHALL override the default price threshold
4. WHEN `--limit 10` is provided, THE Flight_Finder SHALL display only the top N results (default: 20)
5. WHEN `--destination LAX` is provided, THE Flight_Finder SHALL replace `fly_to=US` with `fly_to=LAX` to search a specific destination

### Requirement 6: Handle No Results

**User Story:** As a user, I want clear feedback when no cheap flights are found, so that I can adjust my search.

#### Acceptance Criteria

1. WHEN a search returns zero results, THE Flight_Finder SHALL display "No flights found under $X for your search criteria"
2. WHEN no results are found, THE Flight_Finder SHALL suggest: "Try expanding your date range, increasing max price, or searching from both airports"
3. THE Flight_Finder SHALL exit with code 0 even when no results are found (not an error condition)

### Requirement 7: Handle API Errors Gracefully

**User Story:** As a user, I want clear error messages when something goes wrong, so that I understand why results are unavailable.

#### Acceptance Criteria

1. IF the Kiwi API returns HTTP 401, THEN THE Flight_Finder SHALL display "Error: Invalid API key. Check your KIWI_API_KEY environment variable" and exit with code 1
2. IF the Kiwi API returns HTTP 429, THEN THE Flight_Finder SHALL display "Error: API rate limit exceeded. Please wait a few minutes and try again" and exit with code 1
3. IF a network timeout occurs (>30 seconds), THEN THE Flight_Finder SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s delays)
4. IF all retries fail, THEN THE Flight_Finder SHALL display "Error: Unable to connect to flight data service. Check your internet connection" and exit with code 1
5. THE Flight_Finder SHALL log error details to stderr while showing user-friendly messages to stdout

### Requirement 8: Provide Booking Links

**User Story:** As a user, I want to easily book a flight I find interesting, so that I can act on the deal.

#### Acceptance Criteria

1. WHEN `--show-links` flag is provided, THE Flight_Finder SHALL display the Kiwi booking URL (`deep_link` from API response) for each result
2. WHEN `--open N` is provided (where N is result number), THE Flight_Finder SHALL open that flight's booking URL in the default browser
3. THE Flight_Finder SHALL display a disclaimer: "Note: Prices may differ on booking site"

### Requirement 9: Configure API Key

**User Story:** As a user, I want a simple way to configure my API credentials, so that I can use the application.

#### Acceptance Criteria

1. THE Flight_Finder SHALL read the Kiwi API key from the `KIWI_API_KEY` environment variable
2. IF `KIWI_API_KEY` is not set, THEN THE Flight_Finder SHALL display the following message and exit with code 1:
   ```
   Error: KIWI_API_KEY environment variable not set.
   
   Get a free API key:
   1. Go to https://tequila.kiwi.com/portal/login
   2. Register for a free account
   3. Create an API key in the portal
   4. Set: export KIWI_API_KEY="your-key-here"
   ```
3. THE Flight_Finder SHALL support a `--api-key` flag to override the environment variable (for testing)
4. THE Flight_Finder SHALL never log or display the API key value

### Requirement 10: Export Search Results

**User Story:** As a user, I want to export results to a file, so that I can review or share them later.

#### Acceptance Criteria

1. WHEN `--export results.csv` is provided, THE Flight_Finder SHALL write results to the specified CSV file
2. THE CSV SHALL include columns: price, origin, destination, departure_date, departure_time, arrival_time, airline, duration_minutes, stops, booking_url
3. THE CSV SHALL include a header row as the first line
4. THE Flight_Finder SHALL display "Exported X results to results.csv" after successful export
5. IF the file cannot be written, THEN THE Flight_Finder SHALL display an error and exit with code 1

### Requirement 11: Display Help and Version

**User Story:** As a user, I want to see usage instructions, so that I know how to use all the features.

#### Acceptance Criteria

1. WHEN `--help` or `-h` flag is provided, THE Flight_Finder SHALL display usage instructions with all available options
2. WHEN `--version` or `-v` flag is provided, THE Flight_Finder SHALL display the application version
3. THE help text SHALL include example commands for common use cases

## CLI Interface Summary

```
cheap-flights [OPTIONS]

Options:
  --from <AIRPORT>       Origin airport: ORD, MDW, or BOTH (default: BOTH)
  --date <DATE>          Single departure date (YYYY-MM-DD)
  --date-from <DATE>     Start of date range (YYYY-MM-DD)
  --date-to <DATE>       End of date range (YYYY-MM-DD)
  --round-trip           Search for round-trip flights
  --return-days <RANGE>  Return window for round-trips (e.g., 3-7, default: 2-7)
  --nonstop              Show only nonstop flights
  --airline <CODES>      Filter by airline codes (comma-separated)
  --max-price <AMOUNT>   Maximum price in USD (default: 100 one-way, 200 round-trip)
  --destination <CODE>   Search specific destination instead of all US
  --limit <N>            Maximum results to display (default: 20)
  --show-links           Display booking URLs
  --open <N>             Open result N in browser
  --export <FILE>        Export results to CSV file
  --api-key <KEY>        Override KIWI_API_KEY environment variable
  --help, -h             Show help
  --version, -v          Show version

Examples:
  cheap-flights                           # Search both airports, next 30 days
  cheap-flights --from ORD --nonstop      # Nonstop from O'Hare only
  cheap-flights --date 2024-03-15         # Specific date
  cheap-flights --round-trip --return-days 3-5  # Round-trip, 3-5 day trips
  cheap-flights --max-price 75 --limit 10 # Cheapest 10 under $75
  cheap-flights --export deals.csv        # Save to file
```
