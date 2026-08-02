# Flight Search Pipeline Documentation

## What This Pipeline Does

This GitHub Actions workflow automatically searches for cheap nonstop flights from Chicago airports to all US destinations, saves results, and sends Telegram alerts when deals are found.

## Schedule

Runs **3 times daily** (Chicago time):
- 🌅 6:00 AM CT
- ☀️ 12:00 PM CT
- 🌆 6:00 PM CT

Can also be triggered manually from the GitHub Actions tab.

## Search Criteria

| Parameter | Value |
|-----------|-------|
| **Origin airports** | ORD (O'Hare) AND MDW (Midway) — searches both |
| **Destinations** | All US airports |
| **Date range** | Tomorrow through 30 days from today |
| **Trip type** | One-way |
| **Max price** | $100 (default for one-way) |
| **Stops** | Nonstop only |
| **Results limit** | Top 20 cheapest |
| **Backend** | RapidAPI Flight Scanner |

## What Gets Notified to Telegram

A Telegram message is sent when **any flights are found** under the $100 threshold. The message includes:

- Total number of flights found
- Top 5 cheapest deals with: price, route (e.g., ORD→LAX), date, departure time, airline
- Link to the full results in GitHub Actions

If no flights are found under $100, a "no flights found" message is sent instead.

## Pipeline Steps

1. **Checkout** — pulls latest code from the repo
2. **Setup Node.js** — installs Node.js 20
3. **Install dependencies** — runs `npm ci`
4. **Build** — compiles TypeScript (`npm run build`)
5. **Search flights** — runs the CLI with RapidAPI backend:
   ```
   node dist/cli.js --backend rapidapi --from BOTH --nonstop --limit 20 --export results/flights_DATE_TIME.csv
   ```
6. **Display results summary** — writes output to the GitHub Actions summary page
7. **Commit results** — saves the CSV to the `results/` folder in the repo (builds price history)
8. **Send Telegram notification** — sends top deals to your Telegram

## Required GitHub Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `RAPIDAPI_KEY` | ✅ Yes | Free API key from [RapidAPI Flight Scanner](https://rapidapi.com/apiheya/api/flight-scanner10) |
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ✅ Yes | Your chat ID from [@userinfobot](https://t.me/userinfobot) |

## Output Files

Results are saved as CSV files in the `results/` directory:

```
results/
├── flights_2026-08-01_1100.csv
├── flights_2026-08-01_1700.csv
├── flights_2026-08-01_2300.csv
├── flights_2026-08-02_1100.csv
└── ...
```

Each CSV contains columns: price, origin, destination, departure_date, departure_time, arrival_time, airline, duration_minutes, stops, booking_url

## Cost

- **GitHub Actions**: Free (uses ~1.5 min/run × 3 runs/day = ~135 min/month of the 2,000 free minutes)
- **RapidAPI**: Free tier (Basic plan, $0/month)
- **Telegram Bot API**: Free

**Total cost: $0/month**

## Customization

To change the search criteria, edit `.github/workflows/flight-search.yml` and modify the `node dist/cli.js` command. Available options:

```
--from ORD              # Search only O'Hare (default: BOTH)
--max-price 75          # Lower the price threshold
--round-trip            # Search round-trip instead of one-way
--return-days 3-5       # Return window for round-trips
--destination LAX       # Search specific destination
--airline UA,AA         # Filter by airline
--departure-after 08:00 # Only morning+ flights
--seat business         # Business class deals
```
