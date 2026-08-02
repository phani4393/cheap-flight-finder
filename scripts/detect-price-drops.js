#!/usr/bin/env node
/**
 * detect-price-drops.js
 *
 * Compares the current flight search CSV against the most recent previous CSV
 * for the same search profile. Reports significant price drops.
 *
 * Usage:
 *   node scripts/detect-price-drops.js \
 *     --current results/family_2024-01-15_1200.csv \
 *     --profile family \
 *     --output price_drops.txt
 *
 * A "significant" drop is defined as:
 *   - At least 15% decrease AND
 *   - At least $20 absolute decrease
 * This avoids noise from small $2–$5 fluctuations.
 *
 * Comparison is done on: same route (origin→destination) + same departure date.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse a CSV file into an array of row objects.
 * Handles quoted fields with commas inside them.
 */
function parseCsv(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, respecting quoted fields.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Find the most recent previous CSV file for the given profile.
 * Looks in the results/ directory for files matching the profile prefix
 * that are older than the current file.
 */
function findPreviousFile(currentFile, profile) {
  const resultsDir = path.dirname(currentFile);
  const currentBasename = path.basename(currentFile);

  let files;
  try {
    files = fs.readdirSync(resultsDir);
  } catch {
    return null;
  }

  // Filter to files matching the profile pattern, excluding the current file
  const profilePattern = new RegExp(`^${profile}_\\d{4}-\\d{2}-\\d{2}_\\d{4}\\.csv$`);
  const candidates = files
    .filter(f => profilePattern.test(f) && f !== currentBasename)
    .sort()
    .reverse(); // Most recent first (lexicographic sort works for YYYY-MM-DD_HHMM)

  if (candidates.length === 0) return null;

  return path.join(resultsDir, candidates[0]);
}

/**
 * Create a lookup key for route + departure date comparison.
 */
function routeKey(row) {
  return `${row.origin}→${row.destination}|${row.departure_date}`;
}

/**
 * Build a price map from CSV rows: routeKey → cheapest price.
 */
function buildPriceMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = routeKey(row);
    const price = parseFloat(row.price);
    if (isNaN(price)) continue;

    const existing = map.get(key);
    if (!existing || price < existing.price) {
      map.set(key, { price, row });
    }
  }
  return map;
}

/**
 * Detect significant price drops between previous and current data.
 * Significant = at least 15% decrease AND at least $20 absolute.
 */
function detectDrops(previousRows, currentRows) {
  const prevMap = buildPriceMap(previousRows);
  const currMap = buildPriceMap(currentRows);
  const drops = [];

  for (const [key, currEntry] of currMap.entries()) {
    const prevEntry = prevMap.get(key);
    if (!prevEntry) continue;

    const prevPrice = prevEntry.price;
    const currPrice = currEntry.price;

    if (currPrice >= prevPrice) continue;

    const absoluteDrop = prevPrice - currPrice;
    const percentDrop = (absoluteDrop / prevPrice) * 100;

    // Only report significant drops: ≥15% AND ≥$20
    if (percentDrop >= 15 && absoluteDrop >= 20) {
      drops.push({
        origin: currEntry.row.origin,
        destination: currEntry.row.destination,
        departureDate: currEntry.row.departure_date,
        prevPrice: Math.round(prevPrice),
        currPrice: Math.round(currPrice),
        percentDrop: Math.round(percentDrop),
      });
    }
  }

  // Sort by percentage drop descending
  drops.sort((a, b) => b.percentDrop - a.percentDrop);
  return drops;
}

/**
 * Format drops for Telegram display.
 */
function formatDrops(drops) {
  return drops.map(d =>
    `📉 ${d.origin}→${d.destination}: $${d.prevPrice}→$${d.currPrice} (-${d.percentDrop}%) ${d.departureDate}`
  ).join('\n');
}

/**
 * Parse command-line arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--current':
        options.current = args[++i];
        break;
      case '--profile':
        options.profile = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      default:
        break;
    }
  }

  return options;
}

function main() {
  const options = parseArgs();

  if (!options.current) {
    console.error('Usage: node detect-price-drops.js --current <file> --profile <name> [--output <file>]');
    process.exit(1);
  }

  const profile = options.profile || 'family';

  // Read current file
  let currentContent;
  try {
    currentContent = fs.readFileSync(options.current, 'utf-8');
  } catch (err) {
    console.error(`Cannot read current file: ${options.current}`);
    process.exit(0); // Not a fatal error for the workflow
  }

  // Find and read previous file
  const prevFile = findPreviousFile(options.current, profile);
  if (!prevFile) {
    // No previous data to compare — normal for first run
    if (options.output) {
      // Write empty file so the workflow can check easily
      fs.writeFileSync(options.output, '', 'utf-8');
    }
    process.exit(0);
  }

  let prevContent;
  try {
    prevContent = fs.readFileSync(prevFile, 'utf-8');
  } catch {
    process.exit(0);
  }

  const currentRows = parseCsv(currentContent);
  const previousRows = parseCsv(prevContent);
  const drops = detectDrops(previousRows, currentRows);

  if (drops.length === 0) {
    if (options.output) {
      fs.writeFileSync(options.output, '', 'utf-8');
    }
    process.exit(0);
  }

  const formatted = formatDrops(drops);

  if (options.output) {
    fs.writeFileSync(options.output, formatted, 'utf-8');
  }

  // Also print to stdout for logging
  console.log(`Found ${drops.length} significant price drop(s):`);
  console.log(formatted);
}

main();
