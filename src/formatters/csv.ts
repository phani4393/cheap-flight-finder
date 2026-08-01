/**
 * CSV Exporter
 * Exports flight results to CSV format.
 */

import { stringify } from 'csv-stringify/sync';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { FlightResult, SearchParams } from '../types.js';

/**
 * Interface for CSV export service
 */
export interface IExportService {
  /**
   * Export results to CSV file
   * @param results - Flight results to export
   * @param filePath - Path to write the CSV file
   * @param params - Search parameters (for context)
   * @returns number of rows written
   */
  exportToCsv(
    results: FlightResult[],
    filePath: string,
    params: SearchParams
  ): Promise<number>;
}

/**
 * CSV column structure matching requirements 10.2
 */
interface CsvRow {
  price: number;
  origin: string;
  destination: string;
  departure_date: string;
  departure_time: string;
  arrival_time: string;
  airline: string;
  duration_minutes: number;
  stops: number;
  booking_url: string;
}

/**
 * Format a Date object to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Transform a FlightResult into a CSV row
 */
function flightToCsvRow(flight: FlightResult): CsvRow {
  return {
    price: flight.price,
    origin: flight.origin,
    destination: flight.destination,
    departure_date: formatDate(flight.departureDate),
    departure_time: flight.departureTime,
    arrival_time: flight.arrivalTime,
    airline: flight.airlines.join(','),
    duration_minutes: flight.durationMinutes,
    stops: flight.stops,
    booking_url: flight.bookingUrl
  };
}

/**
 * CSV Export Service implementation
 */
export class CsvExportService implements IExportService {
  /**
   * Export flight results to a CSV file
   * 
   * @param results - Array of flight results to export
   * @param filePath - Path to write the CSV file
   * @param params - Search parameters (unused but part of interface)
   * @returns Number of data rows written (excluding header)
   * @throws Error if file cannot be written
   */
  async exportToCsv(
    results: FlightResult[],
    filePath: string,
    _params: SearchParams
  ): Promise<number> {
    // Transform flight results to CSV rows
    const rows: CsvRow[] = results.map(flightToCsvRow);

    // Generate CSV with header row (requirement 10.3)
    const csvContent = stringify(rows, {
      header: true,
      columns: [
        'price',
        'origin',
        'destination',
        'departure_date',
        'departure_time',
        'arrival_time',
        'airline',
        'duration_minutes',
        'stops',
        'booking_url'
      ]
    });

    try {
      // Ensure the directory exists
      const dir = dirname(filePath);
      if (dir && dir !== '.') {
        await mkdir(dir, { recursive: true });
      }

      // Write the CSV file
      await writeFile(filePath, csvContent, 'utf-8');

      return results.length;
    } catch (error) {
      // Re-throw with more context for proper error handling
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to write CSV file: ${message}`);
    }
  }
}

/**
 * Default export service instance
 */
export const csvExportService = new CsvExportService();
