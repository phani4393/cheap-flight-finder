/**
 * Skyscanner API Adapter (via RapidAPI Flight Scanner)
 * Handles communication with the Flight Scanner API on RapidAPI for flight searches.
 * This replaces the Kiwi Tequila adapter which is no longer available for personal use.
 *
 * API: https://rapidapi.com/apiheya/api/flight-scanner10
 *
 * Validates: Requirements 1.1, 1.5, 1.6, 2.1
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { IRetryHandler } from '../utils/retry.js';
import { createApiErrorFromStatus, createNetworkError, ApiError } from '../errors.js';

/**
 * Entity ID mapping for Chicago airports (origin airports).
 * These are the Skyscanner entityIds for our supported origin airports.
 * Note: These are used as a fast lookup; if they become stale, resolveAirportEntityId
 * will be used as a fallback via the searchAirport endpoint.
 */
const AIRPORT_ENTITY_IDS: Record<string, string> = {
  ORD: '95565059', // Chicago O'Hare
  MDW: '95565060', // Chicago Midway
  // Popular US destinations (hardcoded to avoid searchAirport rate limiting)
  LAX: '95565058',
  JFK: '95565071',
  MIA: '95565077',
  LAS: '95565057',
  DEN: '95565050',
  MCO: '95565074',
  SFO: '95565083',
  ATL: '95565040',
  PHX: '95565079',
  SEA: '95565082',
  FLL: '95565053',
  SAN: '95565081',
  AUS: '95565042',
  BNA: '95565044',
  MSP: '95565076',
  DTW: '95565051',
  TPA: '95565085',
  DFW: '95565049',
  IAH: '95565055',
  SLC: '95565084',
};

/**
 * Destination entity IDs with city name metadata.
 * Used for country-level searches to avoid calling searchAirport API (rate limit protection).
 */
const DESTINATION_ENTITY_IDS: Record<string, { entityId: string; city: string }> = {
  LAX: { entityId: '95565058', city: 'Los Angeles' },
  JFK: { entityId: '95565071', city: 'New York' },
  MIA: { entityId: '95565077', city: 'Miami' },
  LAS: { entityId: '95565057', city: 'Las Vegas' },
  DEN: { entityId: '95565050', city: 'Denver' },
  MCO: { entityId: '95565074', city: 'Orlando' },
  SFO: { entityId: '95565083', city: 'San Francisco' },
  ATL: { entityId: '95565040', city: 'Atlanta' },
  PHX: { entityId: '95565079', city: 'Phoenix' },
  SEA: { entityId: '95565082', city: 'Seattle' },
  FLL: { entityId: '95565053', city: 'Fort Lauderdale' },
  SAN: { entityId: '95565081', city: 'San Diego' },
  AUS: { entityId: '95565042', city: 'Austin' },
  BNA: { entityId: '95565044', city: 'Nashville' },
  MSP: { entityId: '95565076', city: 'Minneapolis' },
  DTW: { entityId: '95565051', city: 'Detroit' },
  TPA: { entityId: '95565085', city: 'Tampa' },
  DFW: { entityId: '95565049', city: 'Dallas' },
  IAH: { entityId: '95565055', city: 'Houston' },
  SLC: { entityId: '95565084', city: 'Salt Lake City' },
};

/**
 * Popular US destination IATA codes used for country-level "fly_to=US" searches.
 * Limited to top 10 to stay within RapidAPI free tier rate limits (~5 req/sec).
 */
const POPULAR_US_DESTINATIONS: string[] = [
  'LAX', 'MIA', 'LAS', 'DEN', 'MCO', 'ATL', 'FLL', 'DFW', 'TPA', 'SFO',
];

/**
 * Request parameters for our flight search adapter.
 * Maps to what the search service provides.
 */
export interface SkyscannerSearchRequest {
  /** Origin airport IATA code (e.g., "ORD", "MDW") */
  fly_from: string;
  /** Destination - airport code or country code (e.g., "US") */
  fly_to: string;
  /** Start of date range in YYYY-MM-DD format */
  date_from: string;
  /** End of date range in YYYY-MM-DD format */
  date_to: string;
  /** Type of trip */
  flight_type: 'oneway' | 'round';
  /** Minimum nights at destination (round-trip only) */
  nights_in_dst_from?: number;
  /** Maximum nights at destination (round-trip only) */
  nights_in_dst_to?: number;
  /** Maximum price filter in USD */
  price_to: number;
  /** Currency code */
  curr: 'USD';
  /** Maximum number of stopovers (0 = nonstop only) */
  max_stopovers?: number;
  /** Maximum number of results to return */
  limit: number;
  /** Sort order */
  sort: 'price';
  /** Cabin class (1=economy, 2=premium-economy, 3=business, 4=first) */
  seat_class?: number;
  /** Number of adult passengers (1–9) */
  adults?: number;
}

/**
 * Individual flight segment within a route (normalized from Skyscanner response).
 */
export interface SkyscannerRouteSegment {
  /** Departure airport IATA code */
  flyFrom: string;
  /** Arrival airport IATA code */
  flyTo: string;
  /** Local departure datetime in ISO format */
  local_departure: string;
  /** Local arrival datetime in ISO format */
  local_arrival: string;
  /** Marketing airline IATA code */
  airline: string;
  /** Flight number */
  flight_no: number;
  /** Operating carrier IATA code */
  operating_carrier: string;
}

/**
 * Single flight result normalized to match what the search service expects.
 * This mimics the KiwiFlight interface shape for backward compatibility.
 */
export interface SkyscannerFlight {
  /** Unique flight identifier */
  id: string;
  /** Total price in USD */
  price: number;
  /** Booking URL */
  deep_link: string;
  /** Origin airport IATA code */
  flyFrom: string;
  /** Destination airport IATA code */
  flyTo: string;
  /** Origin city name */
  cityFrom: string;
  /** Destination city name */
  cityTo: string;
  /** Local departure datetime in ISO format */
  local_departure: string;
  /** Local arrival datetime in ISO format */
  local_arrival: string;
  /** Flight duration information */
  duration: {
    /** Outbound flight duration in seconds */
    departure: number;
    /** Return flight duration in seconds */
    return: number;
    /** Total trip duration in seconds */
    total: number;
  };
  /** Array of airline IATA codes */
  airlines: string[];
  /** Individual flight segments */
  route: SkyscannerRouteSegment[];
  /** Seat availability information */
  availability: {
    seats: number | null;
  };
}

/**
 * Interface for the Skyscanner adapter (same contract as old Kiwi adapter).
 */
export interface IFlightAdapter {
  searchFlights(request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]>;
}

/**
 * Raw leg from Skyscanner searchFlights response.
 */
interface RawSkyscannerLeg {
  origin: { id: string; name?: string; city?: string };
  destination: { id: string; name?: string; city?: string };
  departure: string;
  arrival: string;
  durationInMinutes: number;
  stopCount: number;
  carriers?: { marketing?: Array<{ id?: number; name?: string; alternateId?: string }> };
  segments?: Array<{
    origin?: { flightPlaceId?: string };
    destination?: { flightPlaceId?: string };
    departure?: string;
    arrival?: string;
    marketingCarrier?: { alternateId?: string; name?: string };
    flightNumber?: string;
    operatingCarrier?: { alternateId?: string };
  }>;
}

/**
 * Raw itinerary from Skyscanner searchFlights response.
 */
interface RawSkyscannerItinerary {
  id: string;
  price: { raw: number; formatted?: string };
  legs: RawSkyscannerLeg[];
}

/**
 * Skyscanner Flight Scanner API adapter via RapidAPI.
 */
export class SkyscannerAdapter implements IFlightAdapter {
  private readonly axiosInstance: AxiosInstance;
  /** Cache resolved entity IDs to avoid repeated searchAirport calls */
  private readonly entityIdCache: Map<string, string> = new Map();

  /**
   * Creates a new SkyscannerAdapter instance.
   *
   * @param apiKey - RapidAPI key (X-RapidAPI-Key)
   * @param retryHandler - Retry handler for resilient API calls
   * @param baseUrl - Base URL for the API
   */
  constructor(
    private readonly apiKey: string,
    private readonly retryHandler: IRetryHandler,
    baseUrl: string = 'https://flight-scanner10.p.rapidapi.com'
  ) {
    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'flight-scanner10.p.rapidapi.com',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Search flights via the Skyscanner Flight Scanner API.
   * Translates our request format to the API's format and normalizes the response.
   */
  async searchFlights(request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> {
    const flights = await this.retryHandler.withRetry(
      () => this.makeRequest(request),
      { maxAttempts: 3, baseDelayMs: 1000 }
    );
    return flights;
  }

  /**
   * Makes the actual HTTP request to the Flight Scanner API.
   */
  private async makeRequest(request: SkyscannerSearchRequest): Promise<SkyscannerFlight[]> {
    try {
      // Resolve origin entity ID
      const originEntityId = await this.resolveAirportEntityId(request.fly_from);

      // Determine if this is a country-level search (fly_to=US)
      const isCountrySearch = request.fly_to === 'US';

      if (isCountrySearch) {
        // For country-level search, resolve and search popular US destinations
        return await this.searchCountryDestinations(request, originEntityId);
      }

      // Resolve destination entity ID via searchAirport
      const destinationEntityId = await this.resolveAirportEntityId(request.fly_to);

      // Build the searchFlights request body
      const body: Record<string, unknown> = {
        originEntityId,
        destinationEntityId,
        departureDate: request.date_from, // YYYY-MM-DD
        adults: 1,
        currencyCode: 'USD',
        locale: 'en-US',
        market: 'US',
      };

      // Add return date for round-trip
      if (request.flight_type === 'round' && request.nights_in_dst_from !== undefined) {
        // For round-trip, we need a return date. Calculate from departure + nights
        const depDate = new Date(request.date_from);
        const returnDate = new Date(depDate);
        returnDate.setDate(depDate.getDate() + (request.nights_in_dst_from ?? 2));
        body.returnDate = this.formatDate(returnDate);
      }

      // Add filter for nonstop
      if (request.max_stopovers === 0) {
        body.filterType = 'direct';
      } else {
        body.filterType = 'cheapest';
      }

      const response = await this.axiosInstance.post('/api/v3/flights/searchFlights', body);

      if (!response.data?.status || !response.data?.data?.itineraries) {
        return [];
      }

      const itineraries: RawSkyscannerItinerary[] = response.data.data.itineraries;

      // If status is incomplete, poll for complete results
      const sessionId = response.data.data.context?.sessionId;
      let allItineraries = itineraries;

      if (response.data.data.context?.status === 'incomplete' && sessionId) {
        const completeResults = await this.pollForComplete(sessionId);
        if (completeResults.length > 0) {
          allItineraries = completeResults;
        }
      }

      // Transform and filter results
      return this.transformItineraries(allItineraries, request);
    } catch (error) {
      if (this.isAxiosError(error)) {
        if (error.response) {
          throw createApiErrorFromStatus(error.response.status, error);
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          const timeoutError = new Error('Request timeout');
          (timeoutError as Error & { code?: string }).code = error.code;
          throw timeoutError;
        } else {
          throw createNetworkError(error);
        }
      }
      throw error;
    }
  }

  /**
   * Searches US destinations by resolving IATA codes to entity IDs via hardcoded map,
   * then searching flights for each destination.
   * Uses small batch sizes and delays to stay within RapidAPI free tier rate limits.
   */
  private async searchCountryDestinations(
    request: SkyscannerSearchRequest,
    originEntityId: string
  ): Promise<SkyscannerFlight[]> {
    const flights: SkyscannerFlight[] = [];
    const batchSize = 2; // Only 2 concurrent requests to avoid rate limiting

    // Filter out the origin airport from the destination list (max 10 destinations)
    const destinations = POPULAR_US_DESTINATIONS.filter(
      (iata) => iata !== request.fly_from
    ).slice(0, 10);

    for (let i = 0; i < destinations.length; i += batchSize) {
      // Add delay between batches to respect rate limits
      if (i > 0) {
        await this.delay(1000);
      }

      const batch = destinations.slice(i, i + batchSize);
      const batchPromises = batch.map(async (iataCode) => {
        try {
          // Resolve the IATA code to a real entity ID
          const destEntityId = await this.resolveAirportEntityId(iataCode);

          const body: Record<string, unknown> = {
            originEntityId,
            destinationEntityId: destEntityId,
            departureDate: request.date_from,
            adults: request.adults ?? 1,
            currencyCode: 'USD',
            locale: 'en-US',
            market: 'US',
            filterType: request.max_stopovers === 0 ? 'direct' : 'cheapest',
          };

          if (request.flight_type === 'round' && request.nights_in_dst_from !== undefined) {
            const depDate = new Date(request.date_from);
            const returnDate = new Date(depDate);
            returnDate.setDate(depDate.getDate() + (request.nights_in_dst_from ?? 2));
            body.returnDate = this.formatDate(returnDate);
          }

          const resp = await this.axiosInstance.post('/api/v3/flights/searchFlights', body);
          if (resp.data?.status && resp.data?.data?.itineraries) {
            return this.transformItineraries(resp.data.data.itineraries, request);
          }
          return [];
        } catch (err) {
          console.error(`[SkyscannerAdapter] Failed to search ${iataCode}:`, err instanceof Error ? err.message : err);
          return []; // Skip failed individual searches
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        flights.push(...result);
      }
    }

    // Sort all results by price and apply limit
    flights.sort((a, b) => a.price - b.price);
    return flights.slice(0, request.limit);
  }

  /**
   * Polls the searchIncomplete endpoint until results are complete.
   */
  private async pollForComplete(sessionId: string, maxPolls: number = 3): Promise<RawSkyscannerItinerary[]> {
    for (let i = 0; i < maxPolls; i++) {
      await this.delay(1500); // Wait 1.5s between polls

      try {
        const response = await this.axiosInstance.get('/api/v3/flights/searchIncomplete', {
          params: { sessionId },
        });

        if (response.data?.status && response.data?.data) {
          const status = response.data.data.context?.status;
          const itineraries = response.data.data.itineraries ?? [];

          if (status === 'complete' || itineraries.length > 0) {
            return itineraries;
          }
        }
      } catch {
        break; // Stop polling on error
      }
    }
    return [];
  }

  /**
   * Resolves an IATA airport code to a Skyscanner entity ID.
   * Checks hardcoded maps first, only calls searchAirport API as a last resort.
   * Results are cached to avoid repeated lookups for the same code.
   */
  private async resolveAirportEntityId(iataCode: string): Promise<string> {
    // Check the in-memory cache first
    const cached = this.entityIdCache.get(iataCode);
    if (cached) {
      return cached;
    }

    // Check our known static origin mapping
    if (AIRPORT_ENTITY_IDS[iataCode]) {
      const id = AIRPORT_ENTITY_IDS[iataCode]!;
      this.entityIdCache.set(iataCode, id);
      return id;
    }

    // Check destination map
    if (DESTINATION_ENTITY_IDS[iataCode]) {
      const id = DESTINATION_ENTITY_IDS[iataCode]!.entityId;
      this.entityIdCache.set(iataCode, id);
      return id;
    }

    // Only call API as last resort (with delay to avoid rate limiting)
    await this.delay(200);

    try {
      const response = await this.axiosInstance.get('/api/v3/flights/searchAirport', {
        params: { query: iataCode },
      });

      if (response.data?.status && response.data?.data?.length > 0) {
        // Find the best match (prefer airport type)
        const results = response.data.data;
        for (const result of results) {
          if (result.navigation?.entityType === 'AIRPORT' && result.navigation?.entityId) {
            const entityId = result.navigation.entityId;
            this.entityIdCache.set(iataCode, entityId);
            return entityId;
          }
        }
        // Fallback to first result with an entityId
        if (results[0]?.navigation?.entityId) {
          const entityId = results[0].navigation.entityId;
          this.entityIdCache.set(iataCode, entityId);
          return entityId;
        }
      }
    } catch (err) {
      console.error(`[SkyscannerAdapter] Failed to resolve entity ID for ${iataCode}:`, err instanceof Error ? err.message : err);
      // Fall through to error
    }

    throw new ApiError(`Could not resolve airport code: ${iataCode}`);
  }

  /**
   * Transforms raw Skyscanner itineraries into our normalized SkyscannerFlight format.
   */
  private transformItineraries(
    itineraries: RawSkyscannerItinerary[],
    request: SkyscannerSearchRequest
  ): SkyscannerFlight[] {
    const flights: SkyscannerFlight[] = [];

    for (const itinerary of itineraries) {
      if (!itinerary.legs || itinerary.legs.length === 0) continue;

      const price = itinerary.price?.raw;
      if (price === undefined || price > request.price_to) continue;

      const outboundLeg = itinerary.legs[0]!;
      const returnLeg = itinerary.legs.length > 1 ? itinerary.legs[1] : null;

      // Extract airlines from carriers
      const airlines: string[] = [];
      if (outboundLeg.carriers?.marketing) {
        for (const carrier of outboundLeg.carriers.marketing) {
          if (carrier.alternateId) {
            airlines.push(carrier.alternateId);
          }
        }
      }

      // Build route segments from leg segments
      const route: SkyscannerRouteSegment[] = [];
      if (outboundLeg.segments) {
        for (const seg of outboundLeg.segments) {
          route.push({
            flyFrom: seg.origin?.flightPlaceId ?? outboundLeg.origin.id,
            flyTo: seg.destination?.flightPlaceId ?? outboundLeg.destination.id,
            local_departure: seg.departure ?? outboundLeg.departure,
            local_arrival: seg.arrival ?? outboundLeg.arrival,
            airline: seg.marketingCarrier?.alternateId ?? airlines[0] ?? '',
            flight_no: parseInt(seg.flightNumber ?? '0', 10),
            operating_carrier: seg.operatingCarrier?.alternateId ?? seg.marketingCarrier?.alternateId ?? '',
          });
        }
      } else {
        // No segments detail — create a single segment from the leg
        route.push({
          flyFrom: outboundLeg.origin.id,
          flyTo: outboundLeg.destination.id,
          local_departure: outboundLeg.departure,
          local_arrival: outboundLeg.arrival,
          airline: airlines[0] ?? '',
          flight_no: 0,
          operating_carrier: airlines[0] ?? '',
        });
      }

      // Handle return leg segments
      if (returnLeg) {
        if (returnLeg.segments) {
          for (const seg of returnLeg.segments) {
            route.push({
              flyFrom: seg.origin?.flightPlaceId ?? returnLeg.origin.id,
              flyTo: seg.destination?.flightPlaceId ?? returnLeg.destination.id,
              local_departure: seg.departure ?? returnLeg.departure,
              local_arrival: seg.arrival ?? returnLeg.arrival,
              airline: seg.marketingCarrier?.alternateId ?? airlines[0] ?? '',
              flight_no: parseInt(seg.flightNumber ?? '0', 10),
              operating_carrier: seg.operatingCarrier?.alternateId ?? '',
            });
          }
        } else {
          route.push({
            flyFrom: returnLeg.origin.id,
            flyTo: returnLeg.destination.id,
            local_departure: returnLeg.departure,
            local_arrival: returnLeg.arrival,
            airline: airlines[0] ?? '',
            flight_no: 0,
            operating_carrier: airlines[0] ?? '',
          });
        }
      }

      // Determine origin IATA
      const originIata = outboundLeg.origin.id;

      // Calculate durations in seconds (API provides minutes)
      const outboundDurationSec = outboundLeg.durationInMinutes * 60;
      const returnDurationSec = returnLeg ? returnLeg.durationInMinutes * 60 : 0;

      const flight: SkyscannerFlight = {
        id: itinerary.id,
        price,
        deep_link: `https://www.skyscanner.com/transport/flights/${originIata}/${outboundLeg.destination.id}/`,
        flyFrom: originIata,
        flyTo: outboundLeg.destination.id,
        cityFrom: outboundLeg.origin.city ?? outboundLeg.origin.name ?? originIata,
        cityTo: outboundLeg.destination.city ?? outboundLeg.destination.name ?? outboundLeg.destination.id,
        local_departure: outboundLeg.departure,
        local_arrival: outboundLeg.arrival,
        duration: {
          departure: outboundDurationSec,
          return: returnDurationSec,
          total: outboundDurationSec + returnDurationSec,
        },
        airlines: airlines.length > 0 ? airlines : ['Unknown'],
        route,
        availability: { seats: null },
      };

      // Filter by nonstop if needed
      if (request.max_stopovers === 0 && outboundLeg.stopCount > 0) {
        continue;
      }

      flights.push(flight);
    }

    // Sort by price and limit
    flights.sort((a, b) => a.price - b.price);
    return flights.slice(0, request.limit);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'isAxiosError' in error &&
      (error as AxiosError).isAxiosError === true
    );
  }
}
