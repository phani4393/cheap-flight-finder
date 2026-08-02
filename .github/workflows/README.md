# Flight Search Pipeline Documentation

## What This Pipeline Does

Automatically searches for cheap flights from Chicago (ORD + MDW) using 3 search profiles, detects price drops, scores deals, and sends a comprehensive Telegram report 3x daily.

## Schedule

Runs **3 times daily** (Chicago time):
- 🌅 6:00 AM CT
- ☀️ 12:00 PM CT
- 🌆 6:00 PM CT

Can also be triggered manually from the GitHub Actions tab.

## Search Profiles

### Profile A: 👨‍👩‍👧 Family Round-Trip (primary)

| Parameter | Value |
|-----------|-------|
| Origin | ORD + MDW (both) |
| Destinations | All US airports |
| Trip type | Round-trip |
| Return window | 3-4 days |
| Max price | $200 per person |
| Passengers | 2 adults |
| Stops | Any (for better deals) |
| Date range | Next 30 days |
| Results | Top 15 cheapest |

### Profile B: 🏖️ Weekend Getaway

| Parameter | Value |
|-----------|-------|
| Origin | ORD + MDW (both) |
| Destinations | All US airports |
| Trip type | Round-trip |
| Return window | 2-3 days |
| Max price | $150 per person |
| Passengers | 2 adults |
| Stops | Nonstop only |
| Date range | Next 2 Fridays |
| Results | Top 10 cheapest |

### Profile C: 💸 Ultra-Cheap One-Way

| Parameter | Value |
|-----------|-------|
| Origin | ORD + MDW (both) |
| Destinations | All US airports |
| Trip type | One-way |
| Max price | $60 |
| Passengers | 1 adult |
| Stops | Nonstop only |
| Date range | Next 30 days |
| Results | Top 10 cheapest |

## Deal Scoring

Each deal gets a fire rating based on price:

| Score | Family Trip | Weekend |
|-------|-------------|---------|
| 🔥🔥🔥 | ≤ $100 | ≤ $80 |
| 🔥🔥 | ≤ $150 | ≤ $120 |
| 🔥 | ≤ $200 | ≤ $150 |

## Price Drop Detection

Compares today's family search results against yesterday's data. If a route dropped **20% or more**, it's flagged:

```
🚨 PRICE DROPS DETECTED!
📉 ORD→FLL: $180→$120 (-33%)
📉 MDW→DEN: $150→$95 (-37%)
```

## Telegram Notification Format

```
✈️ Flight Deals Report
━━━━━━━━━━━━━━━━━━

🚨 PRICE DROPS DETECTED!
📉 ORD→FLL: $180→$120 (-33%)

👨‍👩‍👧 Family Trips (3-4 days, round-trip)
🔥🔥🔥 $89 ORD→FLL 2026-08-15 (Spirit)
🔥🔥 $120 MDW→DEN 2026-08-18 (Southwest)
🔥 $175 ORD→LAX 2026-08-20 (United)

🏖️ Weekend Getaways (nonstop)
🔥🔥🔥 $75 ORD→MCO 2026-08-22 (Frontier)
🔥🔥 $110 MDW→LAS 2026-08-29 (Spirit)

💸 Ultra-Cheap (under $60, one-way)
🔥🔥🔥 $39 MDW→FLL 2026-08-16 (Spirit)
🔥🔥🔥 $47 ORD→MCO 2026-08-19 (Frontier)

🔗 Full results
```

## Required GitHub Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `RAPIDAPI_KEY` | ✅ Yes | Free key from [RapidAPI Flight Scanner](https://rapidapi.com/apiheya/api/flight-scanner10) |
| `TELEGRAM_BOT_TOKEN` | ✅ Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | ✅ Yes | Your chat ID from [@userinfobot](https://t.me/userinfobot) |

## Output Files

```
results/
├── family_2026-08-01_1100.csv     # Family round-trip results
├── weekend_2026-08-01_1100.csv    # Weekend getaway results
├── budget_2026-08-01_1100.csv     # Ultra-cheap one-way results
└── ...
```

## Cost

**$0/month total:**
- GitHub Actions: ~3 min/run × 3 runs/day = ~270 min/month (of 2,000 free)
- RapidAPI Flight Scanner: Free tier (Basic plan)
- Telegram Bot API: Free

## Customization

Edit the CLI commands in `.github/workflows/flight-search.yml`:

```bash
# Change return window to 5-7 days
--return-days 5-7

# Lower budget
--max-price 150

# Only O'Hare
--from ORD

# Specific destination
--destination LAX

# Add airline filter
--airline UA,AA,WN

# Morning flights only
--departure-after 06:00 --departure-before 12:00
```
