/**
 * Search Service
 * Orchestrates flight searches across multiple airports and merges results.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 5.1, 5.2, 5.3, 5.5
 * - Transform SearchParams to Kiwi API request format
 * - Set price_to based on trip type (100 one-way, 200 round-trip)
 * - Set max_stopovers=0 when nonstopOnly is true
 * - Handle fly_to=US for all destinations or specific airport code
 * - Make parallel API calls when searching multiple origins
 * - Merge results from multiple origins and remove duplicates
 * - Transform KiwiFlight[] to FlightResult[] with normalized fields
 * - Apply client-side price and airline filtering
 */

import { format, parseISO } from 'date-fns';
import type { SearchParams, SearchResult, FlightResult, OriginAirport } from '../types.js';
import type { IFlightAdapter, SkyscannerSearchRequest as KiwiSearchRequest, SkyscannerFlight as KiwiFlight } from '../adapters/skyscanner.js';

/**
 * Default price thresholds based on trip type.
 * These values are used when maxPrice is not explicitly specified.
 */
const DEFAULT_PRICE_ONEWAY = 100;
const DEFAULT_PRICE_ROUNDTRIP = 200;

/**
 * Interface for the search service.
 * Provides flight search functionality with parameter transformation.
 */
export interface ISearchService {
  /**
   * Execute flight search across specified origins.
   * Makes parallel API calls if multiple origins, merges and sorts results.
   *
   * @param params - Search parameters from the CLI
   * @returns Search result with flights and metadata
   */
  search(params: SearchParams): Promise<SearchResult>;
}

/**
 * Default return window for round-trip searches (2-7 days).
 * Used when no return window is explicitly specified.
 * Validates: Requirement 2.4
 */
const DEFAULT_RETURN_DAYS_MIN = 2;
const DEFAULT_RETURN_DAYS_MAX = 7;

/**
 * Transforms SearchParams into a KiwiSearchRequest format.
 * This function handles the mapping between our internal domain model
 * and the Kiwi API's expected request format.
 *
 * Key transformations:
 * - Date objects → DD/MM/YYYY strings
 * - tripType → flight_type
 * - nonstopOnly → max_stopovers = 0
 * - maxPrice → price_to (with defaults based on trip type)
 * - destination → fly_to ('US' or specific IATA code)
 * - returnDaysMin/Max → nights_in_dst_from/to (round-trip only)
 *
 * @param params - Internal search parameters
 * @param origin - The specific origin airport for this request
 * @returns KiwiSearchRequest formatted for the API
 */
export function transformToKiwiRequest(
  params: SearchParams,
  origin: string
): KiwiSearchRequest {
  // Determine price_to based on trip type and maxPrice
  // If maxPrice is explicitly set, use it; otherwise use defaults
  const priceTo = params.maxPrice > 0
    ? params.maxPrice
    : (params.tripType === 'round' ? DEFAULT_PRICE_ROUNDTRIP : DEFAULT_PRICE_ONEWAY);

  // Build the base request
  const request: KiwiSearchRequest = {
    fly_from: origin,
    fly_to: params.destination, // 'US' for all destinations or specific IATA code
    date_from: formatDateForKiwi(params.dateFrom),
    date_to: formatDateForKiwi(params.dateTo),
    flight_type: params.tripType,
    price_to: priceTo,
    curr: 'USD',
    limit: params.limit,
    sort: 'price',
  };

  // Set max_stopovers=0 when nonstopOnly is true
  // Validates: Requirement 5.1
  if (params.nonstopOnly) {
    request.max_stopovers = 0;
  }

  // Set nights_in_dst_from and nights_in_dst_to for round-trip searches
  // Validates: Requirements 2.1, 2.3, 2.4
  if (params.tripType === 'round') {
    // Use specified return window or defaults (2-7 days)
    request.nights_in_dst_from = params.returnDaysMin ?? DEFAULT_RETURN_DAYS_MIN;
    request.nights_in_dst_to = params.returnDaysMax ?? DEFAULT_RETURN_DAYS_MAX;
  }

  return request;
}

/**
 * Formats a Date object to YYYY-MM-DD format for the Flight Scanner API.
 *
 * @param date - Date to format
 * @returns Date string in YYYY-MM-DD format
 */
export function formatDateForKiwi(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Transforms an array of KiwiFlight objects to FlightResult objects.
 * Handles the mapping between API response format and our internal domain model.
 *
 * Key transformations:
 * - KiwiFlight.id → FlightResult.id
 * - KiwiFlight.price → FlightResult.price
 * - KiwiFlight.flyFrom → FlightResult.origin (cast to OriginAirport)
 * - KiwiFlight.flyTo → FlightResult.destination
 * - KiwiFlight.cityTo → FlightResult.destinationCity
 * - KiwiFlight.local_departure → FlightResult.departureDate + departureTime
 * - KiwiFlight.local_arrival → FlightResult.arrivalTime
 * - KiwiFlight.duration.departure (seconds) → FlightResult.durationMinutes (minutes)
 * - KiwiFlight.route.length - 1 → FlightResult.stops
 * - KiwiFlight.airlines → FlightResult.airlines
 * - KiwiFlight.deep_link → FlightResult.bookingUrl
 *
 * @param kiwiFlights - Array of flights from Kiwi API
 * @returns Array of transformed FlightResult objects
 */
export function transformKiwiFlights(kiwiFlights: KiwiFlight[]): FlightResult[] {
  return kiwiFlights.map((kiwiFlight) => transformSingleFlight(kiwiFlight));
}

/**
 * Transforms a single KiwiFlight to a FlightResult.
 * Handles both one-way and round-trip flights.
 *
 * For round-trip flights, the Kiwi API includes:
 * - duration.return: Return flight duration in seconds
 * - Route segments that include return journey (destination → origin)
 *
 * Validates: Requirement 2.5
 *
 * @param kiwiFlight - Single flight from Kiwi API
 * @returns Transformed FlightResult
 */
function transformSingleFlight(kiwiFlight: KiwiFlight): FlightResult {
  // Parse departure datetime to extract date and time
  const departureDateTime = parseISO(kiwiFlight.local_departure);
  const arrivalDateTime = parseISO(kiwiFlight.local_arrival);

  // Calculate duration in minutes from seconds
  const durationMinutes = Math.round(kiwiFlight.duration.departure / 60);

  // Extract time in HH:mm format
  const departureTime = format(departureDateTime, 'HH:mm');
  const arrivalTime = format(arrivalDateTime, 'HH:mm');

  // Build base result
  const result: FlightResult = {
    id: kiwiFlight.id,
    price: kiwiFlight.price,
    origin: kiwiFlight.flyFrom as OriginAirport,
    destination: kiwiFlight.flyTo,
    destinationCity: kiwiFlight.cityTo,
    departureDate: departureDateTime,
    departureTime,
    arrivalTime,
    durationMinutes,
    stops: 0, // Will be calculated below
    airlines: kiwiFlight.airlines,
    bookingUrl: kiwiFlight.deep_link,
  };

  // Analyze route segments to separate outbound and return flights
  const { outboundStops, returnInfo } = analyzeRouteSegments(
    kiwiFlight.route,
    kiwiFlight.flyFrom,
    kiwiFlight.flyTo
  );

  result.stops = outboundStops;

  // Add return flight details if this is a round-trip
  // Validates: Requirement 2.5
  if (kiwiFlight.duration.return > 0 && returnInfo) {
    result.returnDepartureDate = returnInfo.departureDate;
    result.returnDepartureTime = returnInfo.departureTime;
    result.returnArrivalTime = returnInfo.arrivalTime;
    result.returnDurationMinutes = Math.round(kiwiFlight.duration.return / 60);
    result.returnStops = returnInfo.stops;
  }

  return result;
}

/**
 * Return flight information extracted from route segments.
 */
interface ReturnFlightInfo {
  departureDate: Date;
  departureTime: string;
  arrivalTime: string;
  stops: number;
}

/**
 * Analyzes route segments to determine outbound/return flight details.
 *
 * For round-trip flights, the route array contains both:
 * 1. Outbound segments: origin → destination
 * 2. Return segments: destination → origin
 *
 * We identify the return journey by finding segments that depart from
 * the destination and arrive at the origin.
 *
 * @param route - Array of route segments from Kiwi API
 * @param _origin - Original departure airport code (unused, kept for clarity)
 * @param destination - Final destination airport code
 * @returns Outbound stops count and optional return flight info
 */
function analyzeRouteSegments(
  route: import('../adapters/skyscanner.js').SkyscannerRouteSegment[],
  _origin: string,
  destination: string
): { outboundStops: number; returnInfo: ReturnFlightInfo | null } {
  if (!route || route.length === 0) {
    return { outboundStops: 0, returnInfo: null };
  }

  // Find the index where return journey starts
  // Return journey starts with a segment departing from the destination
  let returnStartIndex = -1;

  for (let i = 1; i < route.length; i++) {
    const segment = route[i];
    const prevSegment = route[i - 1];

    // Return journey starts when we see a segment departing from the destination
    // after we've already arrived there (indicated by previous segment's flyTo)
    if (prevSegment && segment && prevSegment.flyTo === destination && segment.flyFrom === destination) {
      returnStartIndex = i;
      break;
    }
  }

  // If no return journey found, treat all segments as outbound
  if (returnStartIndex === -1) {
    return {
      outboundStops: Math.max(0, route.length - 1),
      returnInfo: null,
    };
  }

  // Split into outbound and return segments
  const outboundSegments = route.slice(0, returnStartIndex);
  const returnSegments = route.slice(returnStartIndex);

  // Calculate stops (stops = segments - 1)
  const outboundStops = Math.max(0, outboundSegments.length - 1);
  const returnStops = Math.max(0, returnSegments.length - 1);

  // Extract return flight info from first and last return segments
  const firstReturnSegment = returnSegments[0];
  const lastReturnSegment = returnSegments[returnSegments.length - 1];

  // Ensure we have valid return segments
  if (!firstReturnSegment || !lastReturnSegment) {
    return {
      outboundStops,
      returnInfo: null,
    };
  }

  const returnDepartureDateTime = parseISO(firstReturnSegment.local_departure);
  const returnArrivalDateTime = parseISO(lastReturnSegment.local_arrival);

  return {
    outboundStops,
    returnInfo: {
      departureDate: returnDepartureDateTime,
      departureTime: format(returnDepartureDateTime, 'HH:mm'),
      arrivalTime: format(returnArrivalDateTime, 'HH:mm'),
      stops: returnStops,
    },
  };
}

/**
 * Filters flight results to only include flights below the specified price threshold.
 * This is used for client-side filtering when the user specifies --max-price.
 *
 * Validates: Requirement 5.3
 * - WHEN `--max-price 75` is provided, THE Flight_Finder SHALL override the default price threshold
 *
 * @param flights - Array of flight results to filter
 * @param maxPrice - Maximum price threshold (exclusive)
 * @returns Array of flights with price < maxPrice
 */
export function filterByPrice(flights: FlightResult[], maxPrice: number): FlightResult[] {
  return flights.filter((flight) => flight.price < maxPrice);
}

/**
 * Filters flight results to only include flights from specified airlines.
 * A flight matches if ANY of its airlines are in the filter list.
 *
 * Validates: Requirement 5.2
 * - WHEN `--airline UA,AA` is provided, THE Flight_Finder SHALL filter results 
 *   client-side to only show flights from specified airlines
 *
 * @param flights - Array of flight results to filter
 * @param airlineCodes - Array of airline IATA codes to match (e.g., ['UA', 'AA'])
 * @returns Array of flights where at least one airline is in the filter list
 */
export function filterByAirlines(flights: FlightResult[], airlineCodes: string[]): FlightResult[] {
  // Convert filter codes to uppercase for case-insensitive matching
  const normalizedCodes = new Set(airlineCodes.map((code) => code.toUpperCase()));
  
  return flights.filter((flight) => {
    // Flight matches if any of its airlines are in the filter set
    return flight.airlines.some((airline) => normalizedCodes.has(airline.toUpperCase()));
  });
}

/**
 * Sorts flight results by price ascending (cheapest first).
 * Creates a new array to avoid mutating the input.
 *
 * Validates: Requirement 4.8
 * - WHEN results are displayed, THE Flight_Finder SHALL sort by price ascending (cheapest first)
 *
 * @param flights - Array of flight results to sort
 * @returns New array of flights sorted by price ascending
 */
export function sortByPrice(flights: FlightResult[]): FlightResult[] {
  // Create a copy to avoid mutating the input array
  return [...flights].sort((a, b) => a.price - b.price);
}

/**
 * Applies a limit to restrict the number of results returned.
 * Returns the first N items from the array.
 *
 * Validates: Requirement 5.4
 * - WHEN `--limit 10` is provided, THE Flight_Finder SHALL display only the top N results (default: 20)
 *
 * @param flights - Array of flight results to limit
 * @param limit - Maximum number of results to return
 * @returns Array containing at most `limit` flights
 */
export function applyLimit(flights: FlightResult[], limit: number): FlightResult[] {
  // Handle edge cases: if limit is 0 or negative, return empty array
  if (limit <= 0) {
    return [];
  }
  // Return the first `limit` items (or all items if fewer than limit)
  return flights.slice(0, limit);
}

/**
 * Search service implementation.
 * Handles flight searches by transforming parameters and calling the Kiwi API.
 */
export class SearchService implements ISearchService {
  /**
   * Creates a new SearchService instance.
   *
   * @param kiwiAdapter - The flight API adapter for making flight searches
   */
  constructor(private readonly kiwiAdapter: IFlightAdapter) {}

  /**
   * Execute flight search across specified origins.
   * Makes parallel API calls if multiple origins, merges and sorts results.
   *
   * Validates: Requirements 1.3, 1.4, 5.2, 5.3
   * - When no Origin_Airport preference is specified, make two API calls (one for ORD, one for MDW) and merge the results
   * - When an Origin_Airport preference is specified, search only from that airport
   * - Apply client-side airline filtering when airlineFilter is specified
   * - Apply client-side price filtering based on maxPrice
   *
   * @param params - Search parameters
   * @returns Search result with flights and metadata
   */
  async search(params: SearchParams): Promise<SearchResult> {
    // Validate that we have at least one origin
    if (params.origins.length === 0) {
      return {
        flights: [],
        searchParams: params,
        apiCallCount: 0,
        totalResultsFromApi: 0,
      };
    }

    // Make parallel API calls for all origins using Promise.all()
    const searchPromises = params.origins.map((origin) => {
      const request = transformToKiwiRequest(params, origin);
      return this.kiwiAdapter.searchFlights(request).then((flights) => ({
        origin,
        flights,
      }));
    });

    // Wait for all API calls to complete in parallel
    const results = await Promise.all(searchPromises);

    // Merge all flight results into a single array and track total count
    const allKiwiFlights: KiwiFlight[] = [];
    let totalResultsFromApi = 0;

    for (const result of results) {
      allKiwiFlights.push(...result.flights);
      totalResultsFromApi += result.flights.length;
    }

    // Remove duplicates based on flight ID (same flight from same origin)
    const uniqueKiwiFlights = this.removeDuplicates(allKiwiFlights);

    // Transform KiwiFlight[] to FlightResult[]
    let flightResults = transformKiwiFlights(uniqueKiwiFlights);

    // Apply client-side price filtering
    // Validates: Requirement 5.3
    if (params.maxPrice > 0) {
      flightResults = filterByPrice(flightResults, params.maxPrice);
    }

    // Apply client-side airline filtering
    // Validates: Requirement 5.2
    if (params.airlineFilter && params.airlineFilter.length > 0) {
      flightResults = filterByAirlines(flightResults, params.airlineFilter);
    }

    // Sort results by price ascending (cheapest first)
    // Validates: Requirement 4.8
    flightResults = sortByPrice(flightResults);

    // Apply limit to restrict number of results
    // Validates: Requirement 5.4
    flightResults = applyLimit(flightResults, params.limit);

    return {
      flights: flightResults,
      searchParams: params,
      apiCallCount: params.origins.length,
      totalResultsFromApi,
    };
  }

  /**
   * Remove duplicate flights based on flight ID.
   * When the same flight appears from multiple origin searches, keep only one.
   *
   * @param flights - Array of flights that may contain duplicates
   * @returns Array of unique flights
   */
  private removeDuplicates(flights: KiwiFlight[]): KiwiFlight[] {
    const seenIds = new Set<string>();
    const uniqueFlights: KiwiFlight[] = [];

    for (const flight of flights) {
      if (!seenIds.has(flight.id)) {
        seenIds.add(flight.id);
        uniqueFlights.push(flight);
      }
    }

    return uniqueFlights;
  }
}
