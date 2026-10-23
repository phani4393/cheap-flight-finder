#!/usr/bin/env node
/**
 * ChicaGoWhere Flight Analyzer
 * 
 * Analyzes flight search results and generates enhanced insights:
 * - Price history tracking and trends
 * - Best day to fly analysis
 * - Deal quality scoring
 * - Airline and duration info
 * - Booking links
 * 
 * Usage: node scripts/chicagowhere-analyze.js <csv_file> [history_file]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_FILE = join(__dirname, '..', 'data', 'chicagowhere-history.json');

// City name mapping
const CITY_NAMES = {
  SEA: 'Seattle',
  PDX: 'Portland', 
  SLC: 'Salt Lake City',
  LAS: 'Las Vegas',
  LAX: 'Los Angeles',
  DEN: 'Denver',
  PHX: 'Phoenix',
  SFO: 'San Francisco'
};

/**
 * Parse CSV file into array of flight objects
 */
function parseCSV(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  const flights = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const flight = {};
    headers.forEach((header, idx) => {
      flight[header.trim()] = values[idx]?.trim() || '';
    });
    // Parse numeric fields
    flight.price = parseFloat(flight.price) || 0;
    flight.duration_minutes = parseInt(flight.duration_minutes) || 0;
    flight.stops = parseInt(flight.stops) || 0;
    flights.push(flight);
  }
  
  return flights;
}

/**
 * Load price history from JSON file
 */
function loadHistory() {
  if (existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    } catch (e) {
      console.error('Failed to parse history file, starting fresh');
    }
  }
  return { searches: [], lastUpdated: null };
}

/**
 * Save price history to JSON file
 */
function saveHistory(history) {
  const dataDir = dirname(HISTORY_FILE);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

/**
 * Calculate deal quality score (0-100)
 * Based on: price vs history, nonstop bonus, time of day, duration
 */
function calculateDealScore(flight, historicalAvg) {
  let score = 50; // Base score
  
  // Price vs historical average (biggest factor)
  if (historicalAvg > 0) {
    const priceDiff = (historicalAvg - flight.price) / historicalAvg;
    score += priceDiff * 100; // +/- based on how much cheaper/expensive
  }
  
  // Nonstop bonus
  if (flight.stops === 0) {
    score += 15;
  } else if (flight.stops === 1) {
    score += 5;
  } else {
    score -= 10;
  }
  
  // Duration penalty for long flights
  const expectedDuration = flight.stops === 0 ? 240 : 360; // 4h nonstop, 6h with stops
  if (flight.duration_minutes > expectedDuration * 1.5) {
    score -= 10;
  }
  
  // Departure time preference (avoid red-eyes)
  const depTime = flight.departure_time || '';
  const hour = parseInt(depTime.split(':')[0]) || 12;
  if (hour >= 6 && hour <= 10) score += 5;  // Morning flights
  if (hour >= 11 && hour <= 18) score += 3; // Daytime
  if (hour < 6 || hour > 22) score -= 10;   // Red-eye penalty
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Get trend emoji based on price change
 */
function getTrendEmoji(currentPrice, historicalAvg) {
  if (!historicalAvg || historicalAvg === 0) return '🆕';
  const diff = ((currentPrice - historicalAvg) / historicalAvg) * 100;
  if (diff < -15) return '🔥'; // Hot deal
  if (diff < -5) return '↘️';  // Dropping
  if (diff > 15) return '📈';  // Expensive
  if (diff > 5) return '↗️';   // Rising
  return '➡️'; // Stable
}

/**
 * Format duration in human readable form
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Get stop description
 */
function getStopDesc(stops) {
  if (stops === 0) return 'nonstop';
  if (stops === 1) return '1 stop';
  return `${stops} stops`;
}

/**
 * Analyze flights and generate report
 */
function analyzeFlights(flights, destination) {
  const history = loadHistory();
  const today = new Date().toISOString().split('T')[0];
  
  // Get historical data for this destination
  const destHistory = history.searches
    .filter(s => s.destination === destination)
    .slice(-10); // Last 10 searches
  
  const historicalPrices = destHistory.map(s => s.cheapestPrice).filter(p => p > 0);
  const historicalAvg = historicalPrices.length > 0 
    ? historicalPrices.reduce((a, b) => a + b, 0) / historicalPrices.length 
    : 0;
  
  // Find cheapest flight
  const sortedByPrice = [...flights].sort((a, b) => a.price - b.price);
  const cheapest = sortedByPrice[0];
  
  if (!cheapest) {
    return { destination, error: 'No flights found' };
  }
  
  // Calculate deal score
  const dealScore = calculateDealScore(cheapest, historicalAvg);
  const trend = getTrendEmoji(cheapest.price, historicalAvg);
  
  // Analyze best days
  const dayPrices = {};
  flights.forEach(f => {
    const date = new Date(f.departure_date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    if (!dayPrices[dayName]) dayPrices[dayName] = [];
    dayPrices[dayName].push(f.price);
  });
  
  const dayAverages = Object.entries(dayPrices).map(([day, prices]) => ({
    day,
    avg: prices.reduce((a, b) => a + b, 0) / prices.length
  })).sort((a, b) => a.avg - b.avg);
  
  const bestDay = dayAverages[0]?.day || 'N/A';
  
  // Price change from last search
  const lastSearch = destHistory[destHistory.length - 1];
  const priceChange = lastSearch ? cheapest.price - lastSearch.cheapestPrice : 0;
  const priceChangeStr = priceChange === 0 ? '' : 
    priceChange < 0 ? `↓$${Math.abs(priceChange).toFixed(0)}` : `↑$${priceChange.toFixed(0)}`;
  
  // Update history
  history.searches.push({
    date: today,
    destination,
    cheapestPrice: cheapest.price,
    origin: cheapest.origin,
    airline: cheapest.airline,
    stops: cheapest.stops
  });
  
  // Keep only last 30 searches per destination
  const grouped = {};
  history.searches.forEach(s => {
    if (!grouped[s.destination]) grouped[s.destination] = [];
    grouped[s.destination].push(s);
  });
  Object.keys(grouped).forEach(dest => {
    grouped[dest] = grouped[dest].slice(-30);
  });
  history.searches = Object.values(grouped).flat();
  history.lastUpdated = today;
  
  saveHistory(history);
  
  return {
    destination,
    cityName: CITY_NAMES[destination] || destination,
    cheapest: {
      price: cheapest.price,
      origin: cheapest.origin,
      departureDate: cheapest.departure_date,
      departureTime: cheapest.departure_time,
      airline: cheapest.airline,
      duration: formatDuration(cheapest.duration_minutes),
      stops: getStopDesc(cheapest.stops),
      bookingUrl: cheapest.booking_url
    },
    analysis: {
      dealScore,
      trend,
      historicalAvg: historicalAvg.toFixed(0),
      priceChange: priceChangeStr,
      bestDay,
      totalFlights: flights.length
    }
  };
}

/**
 * Generate Telegram message from analysis results
 */
function generateTelegramMessage(results, maxPrice) {
  const dealsUnderThreshold = results.filter(r => r.cheapest && r.cheapest.price < maxPrice);
  const hasDeals = dealsUnderThreshold.length > 0;
  
  let message = hasDeals 
    ? `✈️ *ChicaGoWhere Alert!*\n\n🎉 *${dealsUnderThreshold.length} destinations under $${maxPrice}!*\n\n`
    : `✈️ *ChicaGoWhere Report*\n\nNo deals under $${maxPrice} today.\n\n`;
  
  message += `*Flight Deals Summary:*\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Sort by deal score
  const sorted = [...results].sort((a, b) => 
    (b.analysis?.dealScore || 0) - (a.analysis?.dealScore || 0)
  );
  
  for (const r of sorted) {
    if (r.error) {
      message += `❌ *${r.cityName || r.destination}*: ${r.error}\n\n`;
      continue;
    }
    
    const c = r.cheapest;
    const a = r.analysis;
    const isDeal = c.price < maxPrice;
    const emoji = isDeal ? '✅' : '•';
    const scoreEmoji = a.dealScore >= 70 ? '🔥' : a.dealScore >= 50 ? '👍' : '😐';
    
    message += `${emoji} *${r.cityName}* ${a.trend}\n`;
    message += `   💰 *$${c.price}* from ${c.origin}`;
    if (a.priceChange) message += ` (${a.priceChange})`;
    message += `\n`;
    message += `   📅 ${c.departureDate} @ ${c.departureTime}\n`;
    message += `   🛫 ${c.airline} • ${c.duration} • ${c.stops}\n`;
    message += `   📊 Deal Score: ${a.dealScore}/100 ${scoreEmoji}\n`;
    if (a.historicalAvg > 0) {
      message += `   📈 Avg: $${a.historicalAvg} • Best day: ${a.bestDay}\n`;
    }
    message += `\n`;
  }
  
  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💡 _Score 70+ = great deal, 50+ = good, <50 = wait_`;
  
  return message;
}

/**
 * Generate booking links message
 */
function generateBookingLinks(results, maxPrice) {
  const deals = results.filter(r => r.cheapest && r.cheapest.price < maxPrice);
  if (deals.length === 0) return null;
  
  let message = `🔗 *Quick Book Links:*\n\n`;
  for (const r of deals) {
    if (r.cheapest?.bookingUrl) {
      message += `• [${r.cityName} $${r.cheapest.price}](${r.cheapest.bookingUrl})\n`;
    }
  }
  return message;
}

// Main execution
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node chicagowhere-analyze.js <csv_files...>');
  console.log('Example: node chicagowhere-analyze.js results/chicagowhere_SEA_*.csv');
  process.exit(1);
}

const maxPrice = parseInt(process.env.MAX_PRICE) || 200;
const results = [];

for (const csvFile of args) {
  try {
    const flights = parseCSV(csvFile);
    if (flights.length === 0) continue;
    
    const destination = flights[0]?.destination || 'UNK';
    const analysis = analyzeFlights(flights, destination);
    results.push(analysis);
  } catch (err) {
    console.error(`Error processing ${csvFile}: ${err.message}`);
  }
}

if (results.length === 0) {
  console.log('No results to analyze');
  process.exit(0);
}

// Output as JSON for the workflow to consume
const output = {
  results,
  message: generateTelegramMessage(results, maxPrice),
  bookingLinks: generateBookingLinks(results, maxPrice),
  summary: {
    totalDestinations: results.length,
    dealsFound: results.filter(r => r.cheapest && r.cheapest.price < maxPrice).length,
    bestDeal: results.reduce((best, r) => 
      (!best || (r.cheapest && r.cheapest.price < best.price)) 
        ? { dest: r.cityName, price: r.cheapest?.price } 
        : best
    , null)
  }
};

console.log(JSON.stringify(output, null, 2));
