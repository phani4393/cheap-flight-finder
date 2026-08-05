# Verified Skyscanner Entity IDs

Discovered from the Flight Scanner API (RapidAPI) via `searchAirport` endpoint.
Last verified: 2026-08-05

## Origin Airports (Chicago)

| Code | Entity ID | Type | Name |
|------|-----------|------|------|
| CHIA | 27544891 | CITY | Chicago (Any) |
| ORD | 95673392 | AIRPORT | Chicago O'Hare International |
| MDW | 95673391 | AIRPORT | Chicago Midway |

## Destination Airports (verified)

| Code | Entity ID | Type | City Entity ID | City Name |
|------|-----------|------|----------------|-----------|
| LAX | 95673368 | AIRPORT | 27536211 | Los Angeles |
| MIA | 95673821 | AIRPORT | 27536644 | Miami |
| LAS | 95673753 | AIRPORT | 27542715 | Las Vegas |
| DEN | 95673705 | AIRPORT | 27536589 | Denver |
| MCO | 95674009 | AIRPORT | 27542899 | Orlando |
| SFO | 95673577 | AIRPORT | 27546320 | San Francisco |
| ATL | — | CITY | 27541735 | Atlanta |
| PHX | 95673480 | AIRPORT | 27540837 | Phoenix |
| FLL | 104120241 | AIRPORT | 27541669 | Fort Lauderdale |
| DFW | 95673499 | AIRPORT | 27536457 | Dallas |
| TPA | 95673870 | AIRPORT | 27544873 | Tampa |

## Notes

- These IDs are used in `src/adapters/skyscanner.ts` as hardcoded lookups
- The `searchFlights` endpoint accepts both CITY and AIRPORT entityIds
- Using AIRPORT entity IDs is more specific; CITY IDs search all airports in that city
- Atlanta only returned a city-level result from the search query
