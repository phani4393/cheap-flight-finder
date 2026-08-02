#!/usr/bin/env node
/**
 * format-telegram.js
 * 
 * Formats flight search CSV results into a Telegram-ready Markdown message.
 * Replaces brittle bash CSV parsing in the GitHub Actions workflow.
 *
 * Usage:
 *   node scripts/format-telegram.js \
 *     --family results/family_2024-01-15_0600.csv \
 *     --weekend results/weekend_2024-01-15_0600.csv \
 *     --budget results/budget_2024-01-15_0600.csv \
 *     --drops price_drops.txt \
 *     --run-url https://github.com/user/repo/actions/runs/12345
 *
 * Outputs a properly formatted Telegram message (Markdown) to stdout.
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
        // Check for escaped quote ""
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
 * Get deal score emoji based on price and type.
 */
function getDealScore(price, type) {
  if (type === 'family') {
    if (price <= 100) return '🔥🔥🔥';
    if (price <= 150) return '🔥🔥';
    return '🔥';
  } else if (type === 'weekend') {
    if (price <= 80) return '🔥🔥🔥';
    if (price <= 120) return '🔥🔥';
    return '🔥';
  } else {
    // budget — everything under $60 is a great deal
    return '🔥🔥🔥';
  }
}

/**
 * Format a section of flight deals for Telegram.
 * For family type, shows estimated family total (price × 3 for 2 adults + 1 child).
 */
function formatSection(rows, type, maxRows = 3) {
  // Sort by price ascending
  rows.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

  const topRows = rows.slice(0, maxRows);
  const lines = [];

  for (const row of topRows) {
    const price = parseInt(row.price, 10);
    const origin = row.origin || '';
    const dest = row.destination || '';
    const depDate = row.departure_date || '';
    const airline = row.airline || '';
    const score = getDealScore(price, type);

    if (type === 'family') {
      // Show per-person price and estimated family total (2 adults + 1 child ≈ ×3)
      const familyTotal = price * 3;
      lines.push(`${score} $${price}/person ${origin}→${dest} (~$${familyTotal} family) ${depDate} (${airline})`);
    } else {
      lines.push(`${score} $${price} ${origin}→${dest} ${depDate} (${airline})`);
    }
  }

  return lines.join('\n');
}

/**
 * Parse command-line arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--family':
        options.family = args[++i];
        break;
      case '--weekend':
        options.weekend = args[++i];
        break;
      case '--budget':
        options.budget = args[++i];
        break;
      case '--drops':
        options.drops = args[++i];
        break;
      case '--run-url':
        options.runUrl = args[++i];
        break;
      default:
        // Ignore unknown args
        break;
    }
  }

  return options;
}

/**
 * Safely read a file, returning null if it doesn't exist.
 */
function readFileSafe(filePath) {
  if (!filePath) return null;
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function main() {
  const options = parseArgs();
  const parts = [];

  // --- PRICE DROPS (highest priority) ---
  const dropsContent = readFileSafe(options.drops);
  if (dropsContent && dropsContent.trim()) {
    parts.push('🚨 *PRICE DROPS DETECTED!*\n' + dropsContent.trim());
  }

  // --- FAMILY ROUND-TRIP DEALS ---
  const familyContent = readFileSafe(options.family);
  if (familyContent) {
    const rows = parseCsv(familyContent);
    if (rows.length > 0) {
      parts.push(
        '👨‍👩‍👧 *Family Trips (3-4 days, round-trip)*\n' +
        formatSection(rows, 'family')
      );
    }
  }

  // --- WEEKEND GETAWAY DEALS ---
  const weekendContent = readFileSafe(options.weekend);
  if (weekendContent) {
    const rows = parseCsv(weekendContent);
    if (rows.length > 0) {
      parts.push(
        '🏖️ *Weekend Getaways (nonstop)*\n' +
        formatSection(rows, 'weekend')
      );
    }
  }

  // --- ULTRA-CHEAP DEALS ---
  const budgetContent = readFileSafe(options.budget);
  if (budgetContent) {
    const rows = parseCsv(budgetContent);
    if (rows.length > 0) {
      parts.push(
        '💸 *Ultra-Cheap (under $60, one-way)*\n' +
        formatSection(rows, 'budget')
      );
    }
  }

  // Build final message
  if (parts.length === 0) {
    console.log('✈️ No cheap flights found this run. Will check again later.');
    return;
  }

  let message = '✈️ *Flight Deals Report*\n━━━━━━━━━━━━━━━━━━\n\n';
  message += parts.join('\n\n');

  if (options.runUrl) {
    message += `\n\n🔗 [Full results](${options.runUrl})`;
  }

  console.log(message);
}

main();
