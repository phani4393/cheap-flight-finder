/**
 * Flight Response Parser for Google Flights HTML responses.
 * Extracts flight data from AF_initDataCallback JavaScript payloads containing nested arrays.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */

/**
 * A single flight segment within a multi-leg journey.
 */
export interface ParsedSegment {
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Departure time in ISO 8601 format */
  departureTime: string;
  /** Arrival time in ISO 8601 format */
  arrivalTime: string;
  /** Marketing airline name or code */
  airline: string;
  /** Flight number (e.g., "UA1234") */
  flightNumber: string;
  /** Segment duration in minutes */
  durationMinutes: number;
}

/**
 * A parsed flight offer extracted from Google Flights response data.
 */
export interface ParsedFlight {
  /** Total price in the specified currency */
  price: number;
  /** Currency code (e.g., "USD") */
  currency: string;
  /** Origin airport IATA code */
  origin: string;
  /** Destination airport IATA code */
  destination: string;
  /** Departure time in ISO 8601 format */
  departureTime: string;
  /** Arrival time in ISO 8601 format */
  arrivalTime: string;
  /** Total flight duration in minutes */
  durationMinutes: number;
  /** Number of stops (0 = nonstop) */
  stops: number;
  /** Array of airline names/codes */
  airlines: string[];
  /** Array of flight numbers */
  flightNumbers: string[];
  /** Individual flight segments */
  segments: ParsedSegment[];
  /** Whether this is a basic economy fare */
  isBasicEconomy: boolean;
  /** Booking token for deep link construction */
  bookingToken?: string;
}

/**
 * Parses Google Flights response HTML to extract flight data.
 * Targets AF_initDataCallback JavaScript payloads containing nested arrays.
 */
export interface IFlightResponseParser {
  /**
   * Parse the response body and extract flight results.
   * Returns empty array if no flight data can be extracted.
   */
  parse(responseBody: string): ParsedFlight[];
}

/**
 * Implementation of the flight response parser.
 * Uses regex extraction of AF_initDataCallback blocks and navigates nested array structures
 * to find and extract flight offer data.
 */
export class FlightResponseParser implements IFlightResponseParser {
  private static readonly GOOGLE_FLIGHTS_BASE_URL = 'https://www.google.com/travel/flights';

  /**
   * Parse the response body and extract flight results.
   * Returns empty array if no flight data can be extracted.
   */
  parse(responseBody: string): ParsedFlight[] {
    try {
      const dataBlocks = this.extractDataBlocks(responseBody);
      if (dataBlocks.length === 0) {
        return [];
      }

      const flights: ParsedFlight[] = [];

      for (const block of dataBlocks) {
        try {
          const extracted = this.extractFlightsFromBlock(block);
          flights.push(...extracted);
        } catch {
          // Skip blocks that can't be parsed — best effort
          continue;
        }
      }

      return flights;
    } catch {
      // Return empty array on any top-level failure
      return [];
    }
  }

  /**
   * Extract all AF_initDataCallback data blocks from the HTML response.
   * These blocks contain JSON arrays with flight data.
   */
  private extractDataBlocks(html: string): unknown[] {
    const blocks: unknown[] = [];

    // Match AF_initDataCallback({key: '...', hash: '...', data: [...]})
    // The data field contains a JSON array
    const callbackRegex = /AF_initDataCallback\(\{[^}]*data:([\s\S]*?)\}\s*\)/g;
    let match: RegExpExecArray | null;

    while ((match = callbackRegex.exec(html)) !== null) {
      const dataStr = match[1]?.trim();
      if (!dataStr) continue;

      try {
        // Try to parse the JSON array data
        const parsed = JSON.parse(dataStr);
        if (Array.isArray(parsed)) {
          blocks.push(parsed);
        }
      } catch {
        // Try a more lenient extraction — find the array boundary
        const arrayData = this.extractJsonArray(dataStr);
        if (arrayData !== null) {
          blocks.push(arrayData);
        }
      }
    }

    // Fallback: look for data arrays in script tags with different patterns
    if (blocks.length === 0) {
      const scriptRegex = /AF_initDataCallback\(({[\s\S]*?})\)/g;
      while ((match = scriptRegex.exec(html)) !== null) {
        try {
          // Try to extract just the data field with a more flexible regex
          const objStr = match[1]!;
          const dataMatch = objStr.match(/data:\s*(\[[\s\S]*\])/);
          if (dataMatch?.[1]) {
            const parsed = JSON.parse(dataMatch[1]);
            if (Array.isArray(parsed)) {
              blocks.push(parsed);
            }
          }
        } catch {
          continue;
        }
      }
    }

    return blocks;
  }

  /**
   * Attempt to extract a JSON array from a string that may have trailing content.
   */
  private extractJsonArray(str: string): unknown | null {
    // Find the start of the array
    const startIdx = str.indexOf('[');
    if (startIdx === -1) return null;

    // Track bracket depth to find the matching end
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < str.length; i++) {
      const ch = str[i]!;

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          const jsonStr = str.substring(startIdx, i + 1);
          try {
            return JSON.parse(jsonStr);
          } catch {
            return null;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract flight offers from a parsed data block.
   * Google Flights uses deeply nested arrays where flight data is at specific indices.
   */
  private extractFlightsFromBlock(block: unknown): ParsedFlight[] {
    const flights: ParsedFlight[] = [];

    if (!Array.isArray(block)) return flights;

    // Strategy: recursively search for arrays that look like flight offer lists.
    // A flight offer array typically contains sub-arrays where:
    // - One element has a price (number)
    // - Other elements contain airport codes (3-letter strings)
    // - Date/time info as arrays of numbers [year, month, day, hour, minute]
    this.findFlightOffers(block, flights);

    return flights;
  }

  /**
   * Recursively search nested arrays for flight offer structures.
   * Google Flights embeds flight data at varying depths depending on the callback.
   */
  private findFlightOffers(data: unknown, flights: ParsedFlight[]): void {
    if (!Array.isArray(data)) return;

    // Check if this array contains flight offer entries (arrays with price and airport data)
    const potentialOffers = this.tryParseAsOfferList(data);
    if (potentialOffers.length > 0) {
      flights.push(...potentialOffers);
      return;
    }

    // Recurse into sub-arrays to find flight data deeper in the structure
    for (const item of data) {
      if (Array.isArray(item)) {
        this.findFlightOffers(item, flights);
        // Stop recursing if we've found flights to avoid duplicates
        if (flights.length > 0) return;
      }
    }
  }

  /**
   * Try to interpret an array as a list of flight offers.
   * Returns parsed flights if the structure matches expected patterns.
   */
  private tryParseAsOfferList(data: unknown[]): ParsedFlight[] {
    const flights: ParsedFlight[] = [];

    for (const entry of data) {
      if (!Array.isArray(entry)) continue;

      const flight = this.tryParseFlightEntry(entry);
      if (flight) {
        flights.push(flight);
      }
    }

    // Only consider this a valid offer list if we found at least one flight
    // and at least 20% of entries parsed successfully (heuristic to avoid false positives)
    const arrayEntries = data.filter((e) => Array.isArray(e)).length;
    if (flights.length > 0 && arrayEntries > 0 && flights.length >= arrayEntries * 0.1) {
      return flights;
    }

    return [];
  }

  /**
   * Try to parse a single array entry as a flight offer.
   * Returns null if required fields are missing.
   *
   * Common Google Flights nested array structure for a flight offer:
   * [
   *   [segments_array],    // index 0: flight segments
   *   price_info,          // varies: price data
   *   ...
   * ]
   *
   * Segment structure (approximate):
   * [
   *   [dep_airport, dep_city, ...],   // departure info
   *   [arr_airport, arr_city, ...],   // arrival info
   *   [year, month, day, hour, min],  // departure time
   *   [year, month, day, hour, min],  // arrival time
   *   airline_info,                    // airline name/code
   *   flight_number,                  // flight number
   *   duration_minutes,               // duration
   *   ...
   * ]
   */
  private tryParseFlightEntry(entry: unknown[]): ParsedFlight | null {
    try {
      // Look for price - typically a number at various positions
      const price = this.findPrice(entry);
      if (price === null || price <= 0) return null;

      // Look for segments data
      const segments = this.findSegments(entry);
      if (segments.length === 0) return null;

      const firstSegment = segments[0]!;
      const lastSegment = segments[segments.length - 1]!;

      // Validate required fields
      if (!firstSegment.origin || !lastSegment.destination || !firstSegment.departureTime) {
        return null;
      }

      // Calculate total duration
      const totalDuration = segments.reduce((sum, seg) => sum + seg.durationMinutes, 0);

      // Collect airlines and flight numbers
      const airlines = [...new Set(segments.map((s) => s.airline).filter(Boolean))];
      const flightNumbers = segments.map((s) => s.flightNumber).filter(Boolean);

      // Detect basic economy (heuristic: look for markers in the data)
      const isBasicEconomy = this.detectBasicEconomy(entry);

      // Generate booking token from entry data
      const bookingToken = this.extractBookingToken(entry);

      const flight: ParsedFlight = {
        price,
        currency: 'USD',
        origin: firstSegment.origin,
        destination: lastSegment.destination,
        departureTime: firstSegment.departureTime,
        arrivalTime: lastSegment.arrivalTime,
        durationMinutes: totalDuration > 0 ? totalDuration : this.calculateDurationFromTimes(firstSegment.departureTime, lastSegment.arrivalTime),
        stops: segments.length - 1,
        airlines: airlines.length > 0 ? airlines : ['Unknown'],
        flightNumbers,
        segments,
        isBasicEconomy,
        bookingToken,
      };

      return flight;
    } catch {
      return null;
    }
  }

  /**
   * Search for a price value in the flight entry array.
   * Price is typically a number found at specific nested positions.
   */
  private findPrice(entry: unknown[]): number | null {
    // Strategy 1: Look for a number in common price positions
    // Google Flights often has price at entry[1], entry[1][0], or deeper
    for (let i = 0; i < Math.min(entry.length, 10); i++) {
      const item = entry[i];

      // Direct number at top level (rare but possible)
      if (typeof item === 'number' && item > 0 && item < 100000) {
        return item;
      }

      // Array containing price: [amount, currency_code]
      if (Array.isArray(item)) {
        const price = this.findPriceInArray(item);
        if (price !== null) return price;
      }
    }

    return null;
  }

  /**
   * Recursively search an array for a price-like value.
   * Limits depth to avoid performance issues.
   */
  private findPriceInArray(arr: unknown[], depth: number = 0): number | null {
    if (depth > 4) return null;

    for (const item of arr) {
      if (typeof item === 'number' && item > 0 && item < 100000 && Number.isInteger(item)) {
        // Heuristic: prices are usually > $20 and < $50000
        if (item >= 20 && item <= 50000) {
          return item;
        }
      }

      if (Array.isArray(item) && item.length > 0) {
        // Check for [amount, "USD"] pattern
        if (typeof item[0] === 'number' && item[0] >= 20 && item[0] <= 50000) {
          if (item.length >= 2 && typeof item[1] === 'string' && item[1].length === 3) {
            return item[0];
          }
        }

        const nested = this.findPriceInArray(item, depth + 1);
        if (nested !== null) return nested;
      }
    }

    return null;
  }

  /**
   * Find and parse flight segments from the entry data.
   */
  private findSegments(entry: unknown[]): ParsedSegment[] {
    // Segments are typically in the first element of the entry
    // Look for arrays that contain flight segment data
    for (let i = 0; i < Math.min(entry.length, 5); i++) {
      const item = entry[i];
      if (!Array.isArray(item)) continue;

      const segments = this.tryParseSegmentList(item);
      if (segments.length > 0) return segments;

      // Try one level deeper
      for (const subItem of item) {
        if (Array.isArray(subItem)) {
          const deepSegments = this.tryParseSegmentList(subItem);
          if (deepSegments.length > 0) return deepSegments;
        }
      }
    }

    return [];
  }

  /**
   * Try to parse an array as a list of flight segments.
   */
  private tryParseSegmentList(data: unknown[]): ParsedSegment[] {
    const segments: ParsedSegment[] = [];

    for (const item of data) {
      if (!Array.isArray(item)) continue;

      const segment = this.tryParseSegment(item);
      if (segment) {
        segments.push(segment);
      }
    }

    return segments;
  }

  /**
   * Try to parse a single array as a flight segment.
   * Expected structure (approximate):
   * [
   *   [dep_airport_code, dep_city?, ...],  // index 0 or nested
   *   [arr_airport_code, arr_city?, ...],  // index 1 or nested
   *   [year, month, day, hour, minute],    // departure datetime
   *   [year, month, day, hour, minute],    // arrival datetime
   *   airline_code_or_name,                // airline
   *   flight_number,                       // flight number
   *   duration,                            // duration in minutes
   *   ...
   * ]
   */
  private tryParseSegment(data: unknown[]): ParsedSegment | null {
    if (data.length < 4) return null;

    try {
      // Look for airport codes (3-letter uppercase strings)
      const origin = this.findAirportCode(data, 0);
      const destination = this.findAirportCode(data, 1);

      if (!origin || !destination) return null;

      // Look for datetime arrays [year, month, day, hour, minute]
      const departureTime = this.findDateTime(data, 2);
      const arrivalTime = this.findDateTime(data, 3);

      if (!departureTime) return null;

      // Look for airline info
      const airline = this.findAirline(data);

      // Look for flight number
      const flightNumber = this.findFlightNumber(data);

      // Look for duration
      const durationMinutes = this.findDuration(data);

      return {
        origin,
        destination,
        departureTime,
        arrivalTime: arrivalTime || departureTime,
        airline: airline || 'Unknown',
        flightNumber: flightNumber || '',
        durationMinutes: durationMinutes || 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find an airport code (3-letter IATA code) at or near the given position.
   */
  private findAirportCode(data: unknown[], preferredIndex: number): string | null {
    // Check at preferred index first
    const atIndex = data[preferredIndex];
    const code = this.extractIataCode(atIndex);
    if (code) return code;

    // Check in nearby array elements
    for (let i = Math.max(0, preferredIndex - 1); i < Math.min(data.length, preferredIndex + 3); i++) {
      const item = data[i];
      const found = this.extractIataCode(item);
      if (found && i !== preferredIndex) return found;
    }

    return null;
  }

  /**
   * Extract a 3-letter IATA airport code from a value.
   */
  private extractIataCode(value: unknown): string | null {
    if (typeof value === 'string' && /^[A-Z]{3}$/.test(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      // Airport info might be [code, city_name, ...]
      for (const item of value) {
        if (typeof item === 'string' && /^[A-Z]{3}$/.test(item)) {
          return item;
        }
      }
    }

    return null;
  }

  /**
   * Find a datetime from a data array at or near the given position.
   * Looks for arrays like [year, month, day, hour, minute].
   */
  private findDateTime(data: unknown[], preferredIndex: number): string | null {
    // Check at preferred index
    for (let i = Math.max(0, preferredIndex - 1); i < Math.min(data.length, preferredIndex + 4); i++) {
      const item = data[i];
      const datetime = this.parseDateTime(item);
      if (datetime) return datetime;
    }

    return null;
  }

  /**
   * Parse a value as a datetime array [year, month, day, hour, minute].
   */
  private parseDateTime(value: unknown): string | null {
    if (!Array.isArray(value) || value.length < 5) return null;

    const [year, month, day, hour, minute] = value;

    if (
      typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number' ||
      typeof hour !== 'number' || typeof minute !== 'number'
    ) {
      return null;
    }

    // Validate ranges
    if (year < 2020 || year > 2030) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;

    // Format as ISO 8601
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hourStr = String(hour).padStart(2, '0');
    const minuteStr = String(minute).padStart(2, '0');

    return `${year}-${monthStr}-${dayStr}T${hourStr}:${minuteStr}:00`;
  }

  /**
   * Find airline name or code in the segment data.
   */
  private findAirline(data: unknown[]): string | null {
    for (let i = 4; i < Math.min(data.length, 10); i++) {
      const item = data[i];

      // Airline as a string (code or name)
      if (typeof item === 'string' && item.length >= 2 && item.length <= 30) {
        // Skip if it looks like a flight number
        if (/^\d+$/.test(item)) continue;
        // Skip if it looks like a datetime
        if (/^\d{4}-/.test(item)) continue;
        return item;
      }

      // Airline in sub-array
      if (Array.isArray(item)) {
        for (const sub of item) {
          if (typeof sub === 'string' && sub.length >= 2 && sub.length <= 30) {
            if (/^\d+$/.test(sub)) continue;
            return sub;
          }
        }
      }
    }

    // Also check first few positions for 2-letter airline codes
    for (let i = 0; i < Math.min(data.length, 8); i++) {
      const item = data[i];
      if (typeof item === 'string' && /^[A-Z0-9]{2}$/.test(item)) {
        return item;
      }
    }

    return null;
  }

  /**
   * Find a flight number in the segment data.
   */
  private findFlightNumber(data: unknown[]): string | null {
    for (let i = 3; i < Math.min(data.length, 10); i++) {
      const item = data[i];

      // Flight number as a number
      if (typeof item === 'number' && item > 0 && item < 10000 && Number.isInteger(item)) {
        return String(item);
      }

      // Flight number as a string like "1234" or "UA1234"
      if (typeof item === 'string') {
        if (/^[A-Z]{1,2}\d{1,4}$/.test(item)) {
          return item;
        }
        if (/^\d{1,4}$/.test(item) && parseInt(item, 10) > 0) {
          return item;
        }
      }
    }

    return null;
  }

  /**
   * Find flight duration (in minutes) in the segment data.
   */
  private findDuration(data: unknown[]): number | null {
    // Duration is usually a number representing minutes, typically > 30 and < 2000
    for (let i = 4; i < Math.min(data.length, 12); i++) {
      const item = data[i];
      if (typeof item === 'number' && item >= 30 && item <= 2000 && Number.isInteger(item)) {
        return item;
      }
    }

    return null;
  }

  /**
   * Detect if a flight entry represents a basic economy fare.
   * Heuristic: look for "Basic" or "BASIC" strings or specific flag values in the data.
   */
  private detectBasicEconomy(entry: unknown[]): boolean {
    const entryStr = JSON.stringify(entry).toLowerCase();
    return entryStr.includes('basic economy') || entryStr.includes('basic_economy');
  }

  /**
   * Extract a booking token from the entry data if available.
   */
  private extractBookingToken(entry: unknown[]): string | undefined {
    // Look for long base64-like strings that could be booking tokens
    const entryStr = JSON.stringify(entry);
    const tokenMatch = entryStr.match(/"([A-Za-z0-9_-]{40,})"/);
    return tokenMatch?.[1] || undefined;
  }

  /**
   * Calculate duration in minutes from departure and arrival ISO time strings.
   */
  private calculateDurationFromTimes(departure: string, arrival: string): number {
    try {
      const depDate = new Date(departure);
      const arrDate = new Date(arrival);
      const diffMs = arrDate.getTime() - depDate.getTime();
      if (diffMs > 0) {
        return Math.round(diffMs / 60000);
      }
    } catch {
      // Fall through
    }
    return 0;
  }

  /**
   * Generate a Google Flights booking URL for a flight.
   * This creates a deep link to the Google Flights booking page.
   */
  static generateDeepLink(flight: ParsedFlight, tfsParam?: string): string {
    if (tfsParam) {
      return `${FlightResponseParser.GOOGLE_FLIGHTS_BASE_URL}/booking?tfs=${tfsParam}&curr=${flight.currency}`;
    }

    // Construct a search URL as fallback
    const params = new URLSearchParams();
    if (flight.bookingToken) {
      params.set('tfs', flight.bookingToken);
    }
    params.set('curr', flight.currency);

    const queryStr = params.toString();
    return queryStr
      ? `${FlightResponseParser.GOOGLE_FLIGHTS_BASE_URL}?${queryStr}`
      : `${FlightResponseParser.GOOGLE_FLIGHTS_BASE_URL}`;
  }
}
