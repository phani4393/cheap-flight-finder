/**
 * Protobuf Encoder for Google Flights tfs URL parameter.
 * Implements manual Protobuf wire format construction (varint + length-delimited fields)
 * and URL-safe Base64 encoding/decoding.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

/**
 * Query parameters for a Google Flights search.
 */
export interface GoogleFlightsQueryParams {
  /** Origin airport IATA code (e.g., "ORD") */
  origin: string;
  /** Destination airport IATA code (e.g., "LAX"), or empty for "everywhere" */
  destination: string;
  /** Departure date in YYYY-MM-DD format */
  departureDate: string;
  /** Return date in YYYY-MM-DD format (round-trip only) */
  returnDate?: string;
  /** Trip type: 1 = round-trip, 2 = one-way */
  tripType: 1 | 2;
  /** Seat class: 1 = economy, 2 = premium economy, 3 = business, 4 = first */
  seatClass: 1 | 2 | 3 | 4;
  /** Number of adult passengers (1-9) */
  adults: number;
}

/**
 * Encodes flight search parameters into the Google Flights tfs URL parameter.
 * Uses manual Protobuf wire format construction (varint + length-delimited fields).
 */
export interface IProtobufEncoder {
  /**
   * Encode search parameters into a URL-safe Base64 string for the tfs parameter.
   */
  encode(params: GoogleFlightsQueryParams): string;

  /**
   * Decode a tfs parameter back into search parameters (for testing/validation).
   */
  decode(tfs: string): GoogleFlightsQueryParams;
}

/**
 * Protobuf wire types used in encoding.
 */
const WIRE_TYPE_VARINT = 0;
const WIRE_TYPE_LENGTH_DELIMITED = 2;

/**
 * ProtobufEncoder implements manual Protobuf wire format construction
 * for the Google Flights tfs URL parameter.
 *
 * Protobuf schema (reverse-engineered):
 *
 * message FlightSearch {
 *   repeated FlightLeg legs = 1;    // field 1, one for one-way, two for round-trip
 *   int32 passengers = 2;           // field 2, adult count
 *   int32 seat_class = 3;           // field 3, 1-4
 *   int32 trip_type = 4;            // field 4, 1=round-trip, 2=one-way
 * }
 * message FlightLeg {
 *   string origin = 1;              // field 1, IATA code
 *   string destination = 2;         // field 2, IATA code
 *   FlightDate date = 3;            // field 3, sub-message
 * }
 * message FlightDate {
 *   int32 year = 1;
 *   int32 month = 2;
 *   int32 day = 3;
 * }
 */
export class ProtobufEncoder implements IProtobufEncoder {
  /**
   * Encode search parameters into a URL-safe Base64 string for the tfs parameter.
   */
  encode(params: GoogleFlightsQueryParams): string {
    const buffer = this.encodeFlightSearch(params);
    return this.toUrlSafeBase64(buffer);
  }

  /**
   * Decode a tfs parameter back into search parameters (for testing/validation).
   */
  decode(tfs: string): GoogleFlightsQueryParams {
    const buffer = this.fromUrlSafeBase64(tfs);
    return this.decodeFlightSearch(buffer);
  }

  // --- Encoding Methods ---

  private encodeFlightSearch(params: GoogleFlightsQueryParams): Buffer {
    const parts: Buffer[] = [];

    // Field 1: outbound leg (length-delimited sub-message)
    const outboundLeg = this.encodeFlightLeg(
      params.origin,
      params.destination,
      params.departureDate
    );
    parts.push(this.encodeLengthDelimitedField(1, outboundLeg));

    // Field 1: return leg (repeated, only for round-trip)
    if (params.tripType === 1 && params.returnDate) {
      const returnLeg = this.encodeFlightLeg(
        params.destination,
        params.origin,
        params.returnDate
      );
      parts.push(this.encodeLengthDelimitedField(1, returnLeg));
    }

    // Field 2: passengers (varint)
    parts.push(this.encodeVarintField(2, params.adults));

    // Field 3: seat_class (varint)
    parts.push(this.encodeVarintField(3, params.seatClass));

    // Field 4: trip_type (varint)
    parts.push(this.encodeVarintField(4, params.tripType));

    return Buffer.concat(parts);
  }

  private encodeFlightLeg(origin: string, destination: string, date: string): Buffer {
    const parts: Buffer[] = [];

    // Field 1: origin (length-delimited string)
    parts.push(this.encodeLengthDelimitedField(1, Buffer.from(origin, 'utf-8')));

    // Field 2: destination (length-delimited string)
    parts.push(this.encodeLengthDelimitedField(2, Buffer.from(destination, 'utf-8')));

    // Field 3: date (length-delimited sub-message)
    const dateMessage = this.encodeFlightDate(date);
    parts.push(this.encodeLengthDelimitedField(3, dateMessage));

    return Buffer.concat(parts);
  }

  private encodeFlightDate(dateStr: string): Buffer {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr!, 10);
    const month = parseInt(monthStr!, 10);
    const day = parseInt(dayStr!, 10);

    const parts: Buffer[] = [];

    // Field 1: year (varint)
    parts.push(this.encodeVarintField(1, year));

    // Field 2: month (varint)
    parts.push(this.encodeVarintField(2, month));

    // Field 3: day (varint)
    parts.push(this.encodeVarintField(3, day));

    return Buffer.concat(parts);
  }

  // --- Decoding Methods ---

  private decodeFlightSearch(buffer: Buffer): GoogleFlightsQueryParams {
    const fields = this.decodeMessage(buffer);

    const legs: Array<{ origin: string; destination: string; date: string }> = [];
    let passengers = 1;
    let seatClass: 1 | 2 | 3 | 4 = 1;
    let tripType: 1 | 2 = 2;

    for (const field of fields) {
      switch (field.fieldNumber) {
        case 1: {
          // FlightLeg sub-message
          const leg = this.decodeFlightLeg(field.value as Buffer);
          legs.push(leg);
          break;
        }
        case 2:
          passengers = field.value as number;
          break;
        case 3:
          seatClass = field.value as 1 | 2 | 3 | 4;
          break;
        case 4:
          tripType = field.value as 1 | 2;
          break;
      }
    }

    const outboundLeg = legs[0];
    if (!outboundLeg) {
      throw new Error('Invalid tfs: no outbound leg found');
    }

    const result: GoogleFlightsQueryParams = {
      origin: outboundLeg.origin,
      destination: outboundLeg.destination,
      departureDate: outboundLeg.date,
      tripType,
      seatClass,
      adults: passengers,
    };

    // For round-trip, extract return date from second leg
    if (tripType === 1 && legs.length > 1) {
      result.returnDate = legs[1]!.date;
    }

    return result;
  }

  private decodeFlightLeg(buffer: Buffer): { origin: string; destination: string; date: string } {
    const fields = this.decodeMessage(buffer);

    let origin = '';
    let destination = '';
    let date = '';

    for (const field of fields) {
      switch (field.fieldNumber) {
        case 1:
          origin = (field.value as Buffer).toString('utf-8');
          break;
        case 2:
          destination = (field.value as Buffer).toString('utf-8');
          break;
        case 3:
          date = this.decodeFlightDate(field.value as Buffer);
          break;
      }
    }

    return { origin, destination, date };
  }

  private decodeFlightDate(buffer: Buffer): string {
    const fields = this.decodeMessage(buffer);

    let year = 0;
    let month = 0;
    let day = 0;

    for (const field of fields) {
      switch (field.fieldNumber) {
        case 1:
          year = field.value as number;
          break;
        case 2:
          month = field.value as number;
          break;
        case 3:
          day = field.value as number;
          break;
      }
    }

    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    return `${year}-${monthStr}-${dayStr}`;
  }

  // --- Low-Level Protobuf Wire Format ---

  /**
   * Encode a varint field (field key + varint value).
   */
  private encodeVarintField(fieldNumber: number, value: number): Buffer {
    const key = (fieldNumber << 3) | WIRE_TYPE_VARINT;
    const keyBytes = this.encodeVarint(key);
    const valueBytes = this.encodeVarint(value);
    return Buffer.concat([keyBytes, valueBytes]);
  }

  /**
   * Encode a length-delimited field (field key + length + bytes).
   */
  private encodeLengthDelimitedField(fieldNumber: number, data: Buffer): Buffer {
    const key = (fieldNumber << 3) | WIRE_TYPE_LENGTH_DELIMITED;
    const keyBytes = this.encodeVarint(key);
    const lengthBytes = this.encodeVarint(data.length);
    return Buffer.concat([keyBytes, lengthBytes, data]);
  }

  /**
   * Encode an unsigned integer as a varint (7 bits per byte, MSB as continuation bit).
   */
  private encodeVarint(value: number): Buffer {
    const bytes: number[] = [];
    let v = value >>> 0; // Ensure unsigned 32-bit

    while (v > 0x7f) {
      bytes.push((v & 0x7f) | 0x80);
      v = v >>> 7;
    }
    bytes.push(v & 0x7f);

    return Buffer.from(bytes);
  }

  /**
   * Decode a varint from a buffer at the given offset.
   * Returns the decoded value and the new offset.
   */
  private decodeVarint(buffer: Buffer, offset: number): { value: number; newOffset: number } {
    let result = 0;
    let shift = 0;
    let pos = offset;

    while (pos < buffer.length) {
      const byte = buffer[pos]!;
      result |= (byte & 0x7f) << shift;
      pos++;

      if ((byte & 0x80) === 0) {
        return { value: result >>> 0, newOffset: pos };
      }

      shift += 7;
      if (shift >= 35) {
        throw new Error('Varint too long');
      }
    }

    throw new Error('Unexpected end of buffer while decoding varint');
  }

  /**
   * Decode all fields from a Protobuf message buffer.
   */
  private decodeMessage(buffer: Buffer): Array<{ fieldNumber: number; wireType: number; value: number | Buffer }> {
    const fields: Array<{ fieldNumber: number; wireType: number; value: number | Buffer }> = [];
    let offset = 0;

    while (offset < buffer.length) {
      const { value: key, newOffset: keyEnd } = this.decodeVarint(buffer, offset);
      const wireType = key & 0x07;
      const fieldNumber = key >>> 3;
      offset = keyEnd;

      if (wireType === WIRE_TYPE_VARINT) {
        const { value, newOffset } = this.decodeVarint(buffer, offset);
        fields.push({ fieldNumber, wireType, value });
        offset = newOffset;
      } else if (wireType === WIRE_TYPE_LENGTH_DELIMITED) {
        const { value: length, newOffset: lengthEnd } = this.decodeVarint(buffer, offset);
        offset = lengthEnd;
        const data = buffer.subarray(offset, offset + length);
        fields.push({ fieldNumber, wireType, value: data });
        offset += length;
      } else {
        throw new Error(`Unsupported wire type: ${wireType}`);
      }
    }

    return fields;
  }

  // --- Base64 Encoding ---

  /**
   * Convert a buffer to URL-safe Base64 (replace + → -, / → _, remove = padding).
   */
  private toUrlSafeBase64(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  /**
   * Convert a URL-safe Base64 string back to a buffer.
   */
  private fromUrlSafeBase64(str: string): Buffer {
    // Restore standard Base64 characters
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding if needed
    const paddingNeeded = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(paddingNeeded);

    return Buffer.from(base64, 'base64');
  }
}
