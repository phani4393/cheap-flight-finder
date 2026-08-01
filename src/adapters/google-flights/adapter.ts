/**
 * Google Flights Adapter
 * Implements the IFlightAdapter interface by scraping Google Flights directly.
 * No API key required — constructs Protobuf-encoded URL parameters and parses
 * embedded JavaScript data from the response.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2, 4.3, 4.4, 11.1, 11.2, 11.3, 11.4
 */

import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import {
  IFlightAdapter,
  SkyscannerSearchRequest,
  SkyscannerFlight,
  SkyscannerRouteSegment,
} from '../skyscanner.js';
import {
  IProtobufEncoder,
  ProtobufEncoder,
  GoogleFlightsQueryParams,
} from './protobuf-encoder.js';
import {
  IFlightResponseParser,
  FlightResponseParser,
  ParsedFlight,
} from './response-parser.js';
import { IRetryHandler } from '../../utils/retry.js';
import { ApiError } from '../../errors.js';

/**
 * Detects if the response body indicates a CAPTCHA challenge or block page.
 */
function isCaptchaResponse(body: string): boolean {
  return body.includes('recaptcha') || body.includes('captcha') || body.includes('/sorry/index');
}

/**
 * Google Flights adapter that scrapes flight data directly.
 * No API key required.
 *
 * Implements the IFlightAdapter interface as a drop-in replacement for the
 * RapidAPI-based SkyscannerAdapter.
 */
export class GoogleFlightsAdapter implements IFlightAdapter {
  private static readonly GOOGLE_FLIGHTS_URL = 'https://www.google.com/travel/flights';

  constructor(
    private readonly retryHandler: IRetryHandler,
    private readonly encoder: IProtobufEncoder = new ProtobufEncoder(),
    private readonly parser: IFlightResponseParser = new FlightResponseParser(),
    private readonly requestTimeoutMs: number = 15000
  ) {}

  /**
   * Search flights via Google Flights scraping.
   * Maps the SkyscannerSearchRequest to Google Flights query params, fetches results,
   * and transforms them back to SkyscannerFlight format.
   */
  async searchFlights(request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> {
    // 1. Map SkyscannerSearchRequest to GoogleFlightsQueryParams
    const queryParams = this.mapRequestToQueryParams(request);

    // 2. Encode to tfs parameter
    const tfsParam = this.encoder.encode(queryParams);

    // 3. Construct URL
    const url = `${GoogleFlightsAdapter.GOOGLE_FLIGHTS_URL}?tfs=${tfsParam}&curr=USD&hl=en`;

    // 4. Fetch with retry for retryable errors
    const responseBody = await this.fetchWithErrorHandling(url);

    // 5. Parse response
    const parsedFlights = this.parser.parse(responseBody);

    // 6. Handle empty parse result (format may have changed)
    if (parsedFlights.length === 0) {
      console.warn(
        '[GoogleFlightsAdapter] Warning: No flight data extracted from response. ' +
        'The response format may have changed.'
      );
      return [];
    }

    // 7. Map ParsedFlight[] to SkyscannerFlight[]
    const flights = parsedFlights.map((parsed) => this.mapParsedToSkyscanner(parsed, tfsParam));

    // 8. Apply price filter and limit
    const filtered = flights
      .filter((f) => f.price <= request.price_to)
      .sort((a, b) => a.price - b.price)
      .slice(0, request.limit);

    return filtered;
  }

  /**
   * Maps a SkyscannerSearchRequest to GoogleFlightsQueryParams.
   */
  private mapRequestToQueryParams(request: SkyscannerSearchRequest): GoogleFlightsQueryParams {
    // Map flight_type to tripType: 'oneway' → 2, 'round' → 1
    const tripType: 1 | 2 = request.flight_type === 'round' ? 1 : 2;

    // seat_class maps directly (1=economy, 2=premium, 3=business, 4=first)
    const seatClass = (request.seat_class ?? 1) as 1 | 2 | 3 | 4;

    const params: GoogleFlightsQueryParams = {
      origin: request.fly_from,
      destination: request.fly_to,
      departureDate: request.date_from,
      tripType,
      seatClass,
      adults: request.adults ?? 1,
    };

    // Add return date for round-trip
    if (tripType === 1 && request.nights_in_dst_from !== undefined) {
      const depDate = new Date(request.date_from);
      const returnDate = new Date(depDate);
      returnDate.setDate(depDate.getDate() + (request.nights_in_dst_from ?? 2));
      params.returnDate = this.formatDate(returnDate);
    }

    return params;
  }

  /**
   * Fetches the Google Flights page with error handling and retry logic.
   * - On 429/5xx: delegates to RetryHandler
   * - On 403/CAPTCHA: throws ApiError with blocked message
   * - On network error: throws ApiError with cause
   */
  private async fetchWithErrorHandling(url: string): Promise<string> {
    try {
      const responseBody = await this.retryHandler.withRetry(
        () => this.makeHttpRequest(url),
        { maxAttempts: 3, baseDelayMs: 1000 }
      );
      return responseBody;
    } catch (error) {
      // Re-throw ApiErrors as-is (blocking, CAPTCHA, network errors)
      if (error instanceof ApiError) {
        throw error;
      }

      // Wrap unknown errors
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(`Google Flights request failed: ${message}`, undefined, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Makes a single HTTP GET request to Google Flights with browser-like headers.
   * Throws appropriate errors based on response status.
   */
  private async makeHttpRequest(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: this.requestTimeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        // Don't throw on non-2xx so we can handle status codes ourselves
        validateStatus: () => true,
        responseType: 'text',
      });

      const statusCode = response.status;
      const body = typeof response.data === 'string' ? response.data : String(response.data ?? '');

      // HTTP 200: check for CAPTCHA in body, otherwise return
      if (statusCode === 200) {
        if (isCaptchaResponse(body)) {
          throw new ApiError(
            'Google Flights request blocked: CAPTCHA detected. Please wait a few minutes before retrying.',
            403
          );
        }
        return body;
      }

      // HTTP 403: blocked
      if (statusCode === 403) {
        throw new ApiError(
          'Google Flights request blocked (HTTP 403). The request was detected as automated. Please wait before retrying.',
          403
        );
      }

      // HTTP 429 or 5xx: retryable — throw with statusCode so RetryHandler recognizes it
      if (statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) {
        const retryableError = new ApiError(
          `Google Flights returned HTTP ${statusCode}`,
          statusCode
        );
        throw retryableError;
      }

      // Other non-200 status codes
      throw new ApiError(
        `Google Flights request failed with HTTP ${statusCode}`,
        statusCode
      );
    } catch (error) {
      // Re-throw ApiErrors (already handled above)
      if (error instanceof ApiError) {
        throw error;
      }

      // Axios network errors (timeout, DNS, connection refused, etc.)
      if (this.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new ApiError(
            'Google Flights request timed out. Please check your internet connection and try again.',
            undefined,
            error
          );
        }
        throw new ApiError(
          `Network error while connecting to Google Flights: ${error.message}`,
          undefined,
          error
        );
      }

      // Unknown errors
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(
        `Unexpected error during Google Flights request: ${message}`,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Maps a ParsedFlight to a SkyscannerFlight.
   * Generates a SHA-256 based ID, constructs route segments, and maps duration.
   */
  private mapParsedToSkyscanner(parsed: ParsedFlight, tfsParam: string): SkyscannerFlight {
    // Generate SHA-256 id from composite key
    const compositeKey = `${parsed.origin}-${parsed.destination}-${parsed.departureTime}-${parsed.price}`;
    const id = crypto.createHash('sha256').update(compositeKey).digest('hex').substring(0, 16);

    // Map duration from minutes to seconds
    const durationSeconds = parsed.durationMinutes * 60;

    // Construct route segments from parsed segments
    const route: SkyscannerRouteSegment[] = parsed.segments.map((seg) => ({
      flyFrom: seg.origin,
      flyTo: seg.destination,
      local_departure: seg.departureTime,
      local_arrival: seg.arrivalTime,
      airline: seg.airline,
      flight_no: this.parseFlightNumber(seg.flightNumber),
      operating_carrier: seg.airline,
    }));

    // If no segments available, create a single segment from the flight data
    if (route.length === 0) {
      route.push({
        flyFrom: parsed.origin,
        flyTo: parsed.destination,
        local_departure: parsed.departureTime,
        local_arrival: parsed.arrivalTime,
        airline: parsed.airlines[0] ?? 'Unknown',
        flight_no: 0,
        operating_carrier: parsed.airlines[0] ?? 'Unknown',
      });
    }

    // Generate deep link
    const deepLink = FlightResponseParser.generateDeepLink(parsed, tfsParam);

    return {
      id,
      price: parsed.price,
      deep_link: deepLink,
      flyFrom: parsed.origin,
      flyTo: parsed.destination,
      cityFrom: parsed.origin, // Google Flights doesn't provide city names separately
      cityTo: parsed.destination,
      local_departure: parsed.departureTime,
      local_arrival: parsed.arrivalTime,
      duration: {
        departure: durationSeconds,
        return: 0,
        total: durationSeconds,
      },
      airlines: parsed.airlines,
      route,
      availability: { seats: null },
    };
  }

  /**
   * Parses a flight number string to an integer.
   */
  private parseFlightNumber(flightNumber: string): number {
    const numericPart = flightNumber.replace(/[^0-9]/g, '');
    return numericPart ? parseInt(numericPart, 10) : 0;
  }

  /**
   * Formats a Date as YYYY-MM-DD string.
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Type guard for AxiosError.
   */
  private isAxiosError(error: unknown): error is AxiosError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'isAxiosError' in error &&
      (error as AxiosError).isAxiosError === true
    );
  }
}
