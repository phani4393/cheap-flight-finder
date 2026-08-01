/**
 * Shared TypeScript Interfaces
 * Contains all type definitions used across the application.
 */

/**
 * Chicago origin airports supported by the application.
 * ORD: O'Hare International Airport
 * MDW: Midway International Airport
 */
export type OriginAirport = 'ORD' | 'MDW';

/**
 * Represents a single flight result with all display and booking information.
 * Used for both one-way and round-trip flights.
 */
export interface FlightResult {
  /** Unique identifier from the API */
  id: string;
  
  /** Total price in USD */
  price: number;
  
  /** Departure airport (ORD or MDW) */
  origin: OriginAirport;
  
  /** Destination airport IATA code */
  destination: string;
  
  /** Destination city name for display */
  destinationCity: string;
  
  /** Outbound departure date */
  departureDate: Date;
  
  /** Outbound departure time in HH:mm format */
  departureTime: string;
  
  /** Outbound arrival time in HH:mm format */
  arrivalTime: string;
  
  /** Outbound flight duration in minutes */
  durationMinutes: number;
  
  /** Number of stops (0 = nonstop) */
  stops: number;
  
  /** Array of airline IATA codes */
  airlines: string[];
  
  /** Kiwi deep link for booking */
  bookingUrl: string;
  
  // Round-trip specific fields (optional)
  
  /** Return flight departure date */
  returnDepartureDate?: Date;
  
  /** Return flight departure time in HH:mm format */
  returnDepartureTime?: string;
  
  /** Return flight arrival time in HH:mm format */
  returnArrivalTime?: string;
  
  /** Return flight duration in minutes */
  returnDurationMinutes?: number;
  
  /** Number of stops on return flight */
  returnStops?: number;
}

/**
 * Parameters for initiating a flight search.
 * Captures all user preferences from CLI arguments.
 */
export interface SearchParams {
  /** Origin airports to search from */
  origins: OriginAirport[];
  
  /** Destination - 'US' for all US airports or specific IATA code */
  destination: string;
  
  /** Start of departure date range */
  dateFrom: Date;
  
  /** End of departure date range */
  dateTo: Date;
  
  /** Type of trip - one-way or round-trip */
  tripType: 'oneway' | 'round';
  
  /** Minimum nights at destination (round-trip only) */
  returnDaysMin?: number;
  
  /** Maximum nights at destination (round-trip only) */
  returnDaysMax?: number;
  
  /** Maximum price filter in USD */
  maxPrice: number;
  
  /** Filter to nonstop flights only */
  nonstopOnly: boolean;
  
  /** Filter to specific airlines (IATA codes) */
  airlineFilter?: string[];
  
  /** Maximum number of results to return */
  limit: number;
}

/**
 * Result of a flight search operation.
 * Contains the flights found plus metadata about the search.
 */
export interface SearchResult {
  /** Array of flight results, sorted by price ascending */
  flights: FlightResult[];
  
  /** The search parameters used */
  searchParams: SearchParams;
  
  /** Number of API calls made (1 per origin airport) */
  apiCallCount: number;
  
  /** Total number of results returned from API before client-side filtering */
  totalResultsFromApi: number;
}
