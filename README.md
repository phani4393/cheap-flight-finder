# Cheap Flight Finder

A command-line tool that discovers low-cost flights from Chicago airports (ORD/MDW) to any US destination using the Flight Scanner API (Skyscanner data via RapidAPI).

## Features

- Search for one-way flights under $100 or round-trip flights under $200
- Search from O'Hare (ORD), Midway (MDW), or both airports
- Filter by nonstop flights, specific airlines, or custom price limits
- Display results in a formatted terminal table sorted by price
- Export results to CSV for sharing or later review
- Open booking links directly in your default browser

## Prerequisites

- **Node.js** 18.0 or higher
- **npm** (included with Node.js)
- A free **RapidAPI key** with the Flight Scanner API subscription (see below)

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd cheap-flight-finder

# Install dependencies
npm install

# Build the project
npm run build

# (Optional) Install globally for use anywhere
npm link
```

After running `npm link`, the `cheap-flights` command becomes available system-wide.

## Getting an API Key

The app uses the Flight Scanner API on RapidAPI (powered by Skyscanner data).

1. Sign up at https://rapidapi.com (free, instant)
2. Go to https://rapidapi.com/apiheya/api/flight-scanner10
3. Subscribe to the Basic plan ($0/month)
4. Copy your RapidAPI key from any endpoint's code snippet (the `X-RapidAPI-Key` value)

No payment information is required for the Basic tier.

## Configuration

Set your API key as an environment variable:

```bash
# Linux / macOS
export RAPIDAPI_KEY="your-api-key-here"

# Windows (PowerShell)
$env:RAPIDAPI_KEY="your-api-key-here"

# Windows (CMD)
set RAPIDAPI_KEY=your-api-key-here
```

To persist the variable, add it to your shell profile (e.g., `~/.bashrc`, `~/.zshrc`) or system environment variables on Windows.

Alternatively, pass the key directly via the `--api-key` flag:

```bash
cheap-flights --api-key "your-key-here"
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
| `--max-price <AMOUNT>` | Maximum price in USD | 100 (one-way) / 200 (round-trip) |
| `--destination <CODE>` | Specific destination airport code | all US |
| `--limit <N>` | Maximum results to display | 20 |
| `--show-links` | Display booking URLs in output | off |
| `--open <N>` | Open result N's booking URL in browser | — |
| `--export <FILE>` | Export results to CSV file | — |
| `--api-key <KEY>` | Override KIWI_API_KEY env variable | — |
| `-h, --help` | Show help text | — |
| `-v, --version` | Show version number | — |

## Examples

```bash
# Search both airports for the next 30 days (defaults)
cheap-flights

# Nonstop flights from O'Hare only
cheap-flights --from ORD --nonstop

# Search a specific departure date
cheap-flights --date 2024-06-15

# Search a date range
cheap-flights --date-from 2024-06-01 --date-to 2024-06-14

# Round-trip flights with 3-5 day trips
cheap-flights --round-trip --return-days 3-5

# Cheapest 10 flights under $75
cheap-flights --max-price 75 --limit 10

# Filter to United and American Airlines only
cheap-flights --airline UA,AA

# Search for flights to Los Angeles specifically
cheap-flights --destination LAX

# Show booking links in output
cheap-flights --show-links

# Open the 3rd result in your browser
cheap-flights --open 3

# Export results to a CSV file
cheap-flights --export deals.csv

# Combine multiple options
cheap-flights --from ORD --nonstop --round-trip --return-days 2-4 --max-price 150 --export weekend-deals.csv
```

## Example Output

```
Found 8 flights from $47 to $98

┌───────┬───────────┬────────┬─────────┬──────────┬──────────┬─────────┐
│ Price │ Route     │ Date   │ Time    │ Airline  │ Duration │ Stops   │
├───────┼───────────┼────────┼─────────┼──────────┼──────────┼─────────┤
│ $47   │ MDW → FLL │ Mar 15 │ 6:30am  │ Spirit   │ 2h 55m   │ Nonstop │
│ $52   │ ORD → MCO │ Mar 18 │ 7:15am  │ Frontier │ 2h 45m   │ Nonstop │
│ $67   │ ORD → LAX │ Mar 20 │ 9:00am  │ United   │ 4h 15m   │ Nonstop │
│ $73   │ MDW → DEN │ Mar 16 │ 11:30am │ Southwest│ 3h 10m   │ Nonstop │
│ $98   │ ORD → SFO │ Mar 22 │ 2:45pm  │ United   │ 4h 30m   │ Nonstop │
└───────┴───────────┴────────┴─────────┴──────────┴──────────┴─────────┘

Note: Prices may differ on booking site
```

## Development

### Scripts

```bash
# Build TypeScript to JavaScript
npm run build

# Run in development mode (no build step needed)
npm run dev

# Run the built application
npm start

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Type-check without emitting
npm run lint
```

### Project Structure

```
cheap-flight-finder/
├── src/
│   ├── cli.ts              # Entry point, argument parsing
│   ├── config.ts           # Configuration and env loading
│   ├── types.ts            # Shared TypeScript interfaces
│   ├── errors.ts           # Custom error classes
│   ├── services/
│   │   └── search.ts       # Search orchestration
│   ├── adapters/
│   │   └── kiwi.ts         # Kiwi API client
│   ├── formatters/
│   │   ├── table.ts        # Terminal table output
│   │   └── csv.ts          # CSV export
│   └── utils/
│       ├── retry.ts        # Retry with exponential backoff
│       ├── dates.ts        # Date formatting utilities
│       └── browser.ts      # Open URL in browser
├── tests/
│   ├── unit/               # Unit tests
│   ├── property/           # Property-based tests
│   ├── integration/        # Integration tests
│   └── fixtures/           # Test data
├── dist/                   # Compiled output (generated)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Troubleshooting

**"RAPIDAPI_KEY environment variable not set"**
Set the environment variable as shown in the Configuration section above.

**"Invalid API key"**
Verify your RapidAPI key and ensure your Flight Scanner subscription is active.

**"API rate limit exceeded"**
Wait a few minutes before trying again. The Basic tier has usage limits.

**"Date range cannot exceed 30 days"**
Narrow your `--date-from` / `--date-to` range to 30 days or less.

**"Departure date must be today or a future date"**
You cannot search for flights in the past. Use a current or future date.

## License

MIT
