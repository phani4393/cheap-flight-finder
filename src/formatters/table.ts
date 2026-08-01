/**
 * Table Formatter
 * Formats flight results as terminal tables for display.
 * 
 * Implements:
 * - Formatted table with columns: Price, Route, Date, Time, Airline, Duration, Stops
 * - Round-trip display with outbound and return on two lines
 * - Summary line showing total results and price range
 * - Booking URL display when --show-links is enabled
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 8.1, 8.3
 */

import Table from 'cli-table3';
import { FlightResult, SearchParams } from '../types.js';
import { formatForDisplay, formatTime, formatDuration } from '../utils/dates.js';

/**
 * Options for formatting flight results table.
 */
export interface FormatOptions {
  /** Whether to display booking URLs */
  showLinks: boolean;
  /** Whether results are round-trip flights */
  isRoundTrip: boolean;
}

/**
 * A single row in the flight results table.
 */
export interface TableRow {
  price: string;
  route: string;
  date: string;
  time: string;
  airline: string;
  duration: string;
  stops: string;
}

/**
 * Interface for the result formatter.
 */
export interface IResultFormatter {
  /**
   * Format flight results as terminal table
   */
  formatTable(results: FlightResult[], options: FormatOptions): string;

  /**
   * Format single flight for display
   */
  formatFlight(flight: FlightResult): TableRow;

  /**
   * Format summary line (e.g., "Found 15 flights from $47 to $98")
   */
  formatSummary(results: FlightResult[], params: SearchParams): string;
}

/**
 * Format price as "$XX" (e.g., "$67")
 * Validates: Requirement 4.2
 */
export function formatPrice(price: number): string {
  return `$${Math.round(price)}`;
}

/**
 * Format route as "ORD → LAX" (origin → destination)
 * Validates: Requirement 4.3
 */
export function formatRoute(origin: string, destination: string): string {
  return `${origin} → ${destination}`;
}

/**
 * Format stops as "Nonstop", "1 stop", or "2 stops"
 * Validates: Requirement 4.7
 */
export function formatStops(stops: number): string {
  if (stops === 0) {
    return 'Nonstop';
  } else if (stops === 1) {
    return '1 stop';
  } else {
    return `${stops} stops`;
  }
}

/**
 * Result formatter implementation.
 */
export class ResultFormatter implements IResultFormatter {
  /**
   * Format a single flight for display as a table row.
   * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
   */
  formatFlight(flight: FlightResult): TableRow {
    return {
      price: formatPrice(flight.price),
      route: formatRoute(flight.origin, flight.destination),
      date: formatForDisplay(flight.departureDate),
      time: formatTime(flight.departureTime),
      airline: flight.airlines.join(', '),
      duration: formatDuration(flight.durationMinutes),
      stops: formatStops(flight.stops),
    };
  }

  /**
   * Format return flight portion for round-trip display.
   */
  private formatReturnFlight(flight: FlightResult): TableRow | null {
    if (
      !flight.returnDepartureDate ||
      !flight.returnDepartureTime ||
      flight.returnDurationMinutes === undefined ||
      flight.returnStops === undefined
    ) {
      return null;
    }

    return {
      price: '', // Empty for return leg (price shown on outbound only)
      route: formatRoute(flight.destination, flight.origin),
      date: formatForDisplay(flight.returnDepartureDate),
      time: formatTime(flight.returnDepartureTime),
      airline: flight.airlines.join(', '),
      duration: formatDuration(flight.returnDurationMinutes),
      stops: formatStops(flight.returnStops),
    };
  }

  /**
   * Format flight results as a terminal table.
   * Validates: Requirements 4.1, 4.10
   */
  formatTable(results: FlightResult[], options: FormatOptions): string {
    if (results.length === 0) {
      return '';
    }

    // Define table columns
    const head = ['Price', 'Route', 'Date', 'Time', 'Airline', 'Duration', 'Stops'];
    if (options.showLinks) {
      head.push('Booking URL');
    }

    const table = new Table({
      head,
      style: {
        head: [],
        border: [],
      },
    });

    for (let i = 0; i < results.length; i++) {
      const flight = results[i];
      if (!flight) continue;

      const row = this.formatFlight(flight);
      const rowArray = [
        row.price,
        row.route,
        row.date,
        row.time,
        row.airline,
        row.duration,
        row.stops,
      ];

      if (options.showLinks) {
        rowArray.push(flight.bookingUrl);
      }

      table.push(rowArray);

      // For round-trip flights, add return flight row
      // Validates: Requirement 4.10
      if (options.isRoundTrip) {
        const returnRow = this.formatReturnFlight(flight);
        if (returnRow) {
          const returnRowArray = [
            returnRow.price,
            returnRow.route,
            returnRow.date,
            returnRow.time,
            returnRow.airline,
            returnRow.duration,
            returnRow.stops,
          ];

          if (options.showLinks) {
            returnRowArray.push(''); // No separate URL for return leg
          }

          table.push(returnRowArray);

          // Add visual separator between flight pairs (except after the last one)
          if (i < results.length - 1) {
            const separatorRow = head.map(() => '');
            // Use horizontal rule style for separator
            table.push(separatorRow.map(() => ({ content: '', hAlign: 'center' as const })));
          }
        }
      }
    }

    return table.toString();
  }

  /**
   * Format summary line showing total results and price range.
   * Validates: Requirement 4.9
   */
  formatSummary(results: FlightResult[], _params: SearchParams): string {
    if (results.length === 0) {
      return '';
    }

    const prices = results.map((f) => f.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return `Found ${results.length} flights from ${formatPrice(minPrice)} to ${formatPrice(maxPrice)}`;
  }
}

/**
 * Format the complete output including summary, table, and disclaimer.
 * Validates: Requirements 4.1, 4.9, 8.1, 8.3
 */
export function formatOutput(
  results: FlightResult[],
  params: SearchParams,
  options: FormatOptions
): string {
  const formatter = new ResultFormatter();
  const lines: string[] = [];

  // Summary line
  // Validates: Requirement 4.9
  const summary = formatter.formatSummary(results, params);
  if (summary) {
    lines.push(summary);
    lines.push(''); // Empty line after summary
  }

  // Table
  // Validates: Requirement 4.1
  const table = formatter.formatTable(results, options);
  if (table) {
    lines.push(table);
  }

  // Booking URLs displayed inline when --show-links is enabled
  // Validates: Requirement 8.1

  // Disclaimer
  // Validates: Requirement 8.3
  if (results.length > 0) {
    lines.push('');
    lines.push('Note: Prices may differ on booking site');
  }

  return lines.join('\n');
}

/**
 * Format "no results" message.
 * Validates: Requirements 6.1, 6.2
 */
export function formatNoResults(maxPrice: number): string {
  const lines = [
    `No flights found under ${formatPrice(maxPrice)} for your search criteria`,
    '',
    'Try expanding your date range, increasing max price, or searching from both airports',
  ];
  return lines.join('\n');
}

// Default export for convenience
export default ResultFormatter;
