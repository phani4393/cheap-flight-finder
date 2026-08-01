# Cheap Flight Finder

A command-line tool that discovers low-cost flights from Chicago airports (ORD/MDW) to any US destination. Supports two backends: direct Google Flights scraping (no API key needed) and RapidAPI Flight Scanner (reliable, needs free key).

## Features

- Search for one-way flights under $100 or round-trip flights under $200
- Search from O'Hare (ORD), Midway (MDW), or both airports
- Filter by nonstop flights, specific airlines, or custom price limits
- Filter by departure time window, max duration, and seat class
- Support for multiple passengers and basic economy exclusion
- Display results in a formatted terminal table sorted by price
- Export results to CSV for sharing or later review
- Open booking links directly in your default browser
- Two backends: Google Flights (free) or RapidAPI (reliable)

## Prerequisites

- **Node.js** 18.0 or higher
- **npm** (included with Node.js)

## Installation

```bash
# Clone the repository
git clone https://github.com/phani4393/cheap-flight-finder.git
cd cheap-flight-finder

# Install dependencies
npm install

# Build the project
npm run build

# (Optional) Install globally for use anywhere
npm link
```

## Quick Start

No API key needed with the default Google Flights backend:

```bash
cheap-flights --from ORD --nonstop --limit 5
```

If Google blocks the request (CAPTCHA), switch to RapidAPI:

```bash
cheap-flights --backend rapidapi --api-key YOUR_KEY --from ORD --limit 5
```

## Backends

### Google Flights (default)

- No API key required
- Scrapes Google Flights directly using Protobuf-encoded URL parameters
- May occasionally get blocked by Google's bot detection (CAPTCHA)
- Wait a few minutes and retry, or switch to RapidAPI

### RapidAPI Flight Scanner

- Requires a free RapidAPI key
- Reliable, no blocking issues
- Sign up at https://rapidapi.com
- Subscribe to "Flight Scanner" API (Basic plan, $0/month): https://rapidapi.com/apiheya/api/flight-scanner10
- Set your key via `--api-key` flag or `RAPIDAPI_KEY` environment variable

## Configuration

For the RapidAPI backend, set your key:

```bash
# Linux / macOS
export RAPIDAPI_KEY="your-key-here"

# Windows (PowerShell)
$env:RAPIDAPI_KEY="your-key-here"

# Or pass directly
cheap-flights --backend rapidapi --api-key "your-key-here"
```

## Usage

```bash
cheap-flights [OPTIONS]
```

### Available Options

| Option | Description | Default |
|--------|-------------|---------|
| `--from <AIRPORT>` | Origin airport: ORD, MDW, or BOTH | BOTH |
| `--date <DATE>` | Single departure date (YYYY-MM-DD) | — |
| `--date-from <DATE>` | Start of date range (YYYY-MM-DD) | tomorrow |
| `--date-to <DATE>` | End of date range (YYYY-MM-DD) | 30 days out |
| `--round-trip` | Search for round-trip flights | off |
| `--return-days <RANGE>` | Return window for round-trips (e.g., 3-7) | 2-7 |
| `--nonstop` | Show only nonstop flights | off |
| `--airline <CODES>` | Filter by airline codes (comma-separated) | — |
| `--max-price <AMOUNT>` | Maximum price in USD | 100 / 200 |
| `--destination <CODE>` | Specific destination airport code | all US |
| `--limit <N>` | Maximum results to display | 20 |
| `--seat <CLASS>` | Cabin class: economy, premium-economy, business, first | economy |
| `--adults <N>` | Number of adult passengers (1-9) | 1 |
| `--departure-after <HH:mm>` | Only show flights departing after this time | — |
| `--departure-before <HH:mm>` | Only show flights departing before this time | — |
| `--max-duration <MINUTES>` | Maximum flight duration in minutes | — |
| `--exclude-basic-economy` | Exclude basic economy fares | off |
| `--show-links` | Display booking URLs in output | off |
| `--open <N>` | Open result N's booking URL in browser | — |
| `--export <FILE>` | Export results to CSV file | — |
| `--backend <TYPE>` | Backend: google or rapidapi | google |
| `--api-key <KEY>` | RapidAPI key (for rapidapi backend) | — |
| `-h, --help` | Show help text | — |
| `-v, --version` | Show version number | — |

## Examples

```bash
# Search both airports for the next 30 days (defaults)
cheap-flights

# Nonstop flights from O'Hare only
cheap-flights --from ORD --nonstop

# Search a specific departure date
cheap-flights --date 2025-09-15

# Search a date range
cheap-flights --date-from 2025-09-01 --date-to 2025-09-14

# Round-trip flights with 3-5 day trips
cheap-flights --round-trip --return-days 3-5

# Cheapest 10 flights under $75
cheap-flights --max-price 75 --limit 10

# Business class for 2 passengers
cheap-flights --seat business --adults 2

# Daytime flights only (8am to 6pm)
cheap-flights --departure-after 08:00 --departure-before 18:00

# Short flights only (under 4 hours)
cheap-flights --max-duration 240

# Exclude basic economy fares
cheap-flights --exclude-basic-economy

# Filter to United and American Airlines only
cheap-flights --airline UA,AA

# Export results to a CSV file
cheap-flights --export deals.csv

# Use RapidAPI backend (more reliable)
cheap-flights --backend rapidapi --api-key YOUR_KEY --from ORD --nonstop

# Combine multiple options
cheap-flights --from ORD --nonstop --seat business --departure-after 08:00 --max-price 300 --export morning-deals.csv
```

## Example Output

```
Found 5 flights from $47 to $98

┌───────┬───────────┬────────┬─────────┬──────────┬──────────┬─────────┐
│ Price │ Route     │ Date   │ Time    │ Airline  │ Duration │ Stops   │
├───────┼───────────┼────────┼─────────┼──────────┼──────────┼─────────┤
│ $47   │ MDW → FLL │ Sep 15 │ 6:30am  │ Spirit   │ 2h 55m   │ Nonstop │
│ $52   │ ORD → MCO │ Sep 18 │ 7:15am  │ Frontier │ 2h 45m   │ Nonstop │
│ $67   │ ORD → LAX │ Sep 20 │ 9:00am  │ United   │ 4h 15m   │ Nonstop │
│ $73   │ MDW → DEN │ Sep 16 │ 11:30am │ Southwest│ 3h 10m   │ Nonstop │
│ $98   │ ORD → SFO │ Sep 22 │ 2:45pm  │ United   │ 4h 30m   │ Nonstop │
└───────┴───────────┴────────┴─────────┴──────────┴──────────┴─────────┘

Note: Prices may differ on booking site
```

## Development

### Scripts

```bash
npm run build          # Build TypeScript to JavaScript
npm run dev            # Run in development mode (no build needed)
npm start              # Run the built application
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run lint           # Type-check without emitting
```

### Project Structure

```
cheap-flight-finder/
├── src/
│   ├── cli.ts                          # Entry point, argument parsing
│   ├── config.ts                       # Configuration (no API key needed)
│   ├── types.ts                        # Shared TypeScript interfaces
│   ├── errors.ts                       # Custom error classes
│   ├── services/
│   │   └── search.ts                   # Search orchestration + filters
│   ├── adapters/
│   │   ├── google-flights/             # Google Flights scraper (default)
│   │   │   ├── protobuf-encoder.ts     # Protobuf → Base64 URL encoding
│   │   │   ├── response-parser.ts      # Parse flight data from HTML
│   │   │   ├── adapter.ts             # Main adapter class
│   │   │   └── index.ts              # Barrel export
│   │   └── skyscanner.ts              # RapidAPI Flight Scanner (fallback)
│   ├── formatters/
│   │   ├── table.ts                    # Terminal table output
│   │   └── csv.ts                      # CSV export
│   └── utils/
│       ├── retry.ts                    # Retry with exponential backoff
│       ├── dates.ts                    # Date formatting utilities
│       └── browser.ts                  # Open URL in browser
├── tests/
│   ├── unit/                           # Unit tests
│   ├── property/                       # Property-based tests (fast-check)
│   └── integration/                    # Integration tests
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Troubleshooting

**"CAPTCHA detected. Please wait a few minutes before retrying"**
Google detected automated traffic. Either wait 5-10 minutes or switch to `--backend rapidapi`.

**"RapidAPI key required when using --backend rapidapi"**
Set the `RAPIDAPI_KEY` env var or pass `--api-key YOUR_KEY`.

**"Date range cannot exceed 30 days"**
Narrow your `--date-from` / `--date-to` range to 30 days or less.

**"Departure date must be today or a future date"**
You cannot search for flights in the past.

**"Invalid seat class"**
Must be one of: economy, premium-economy, business, first.

**"Invalid adults count"**
Must be an integer between 1 and 9.

## License

MIT
