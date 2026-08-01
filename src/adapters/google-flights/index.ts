/**
 * Google Flights Adapter - Barrel Export
 *
 * Re-exports all public types and classes for the Google Flights scraping adapter.
 */

export {
  GoogleFlightsQueryParams,
  IProtobufEncoder,
  ProtobufEncoder,
} from './protobuf-encoder.js';

export {
  ParsedFlight,
  ParsedSegment,
  IFlightResponseParser,
  FlightResponseParser,
} from './response-parser.js';

export { GoogleFlightsAdapter } from './adapter.js';
