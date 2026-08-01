/**
 * Date Utilities
 * Date formatting and validation helpers for the Cheap Flight Finder.
 * 
 * Implements date formatting for:
 * - Kiwi API requests (DD/MM/YYYY)
 * - Display output (Mar 15)
 * - Time formatting (6:30am)
 * - Duration formatting (4h 15m)
 * - Date validation
 */

import { format, startOfDay, isBefore } from 'date-fns';

/**
 * Format a Date object for the Kiwi API.
 * Kiwi Tequila API requires dates in DD/MM/YYYY format.
 * 
 * @param date - The date to format
 * @returns Date string in DD/MM/YYYY format
 * 
 * @example
 * formatForKiwiApi(new Date(2024, 2, 15)) // "15/03/2024"
 * 
 * Validates: Requirement 3.6
 */
export function formatForKiwiApi(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

/**
 * Format a Date for display in the terminal output.
 * Uses abbreviated month and day format.
 * 
 * @param date - The date to format
 * @returns Date string in "Mar 15" format
 * 
 * @example
 * formatForDisplay(new Date(2024, 2, 15)) // "Mar 15"
 * 
 * Validates: Requirement 4.4
 */
export function formatForDisplay(date: Date): string {
  return format(date, 'MMM d');
}

/**
 * Format a time string to 12-hour format.
 * Converts "HH:mm" (24-hour) to "h:mmam/pm" format.
 * 
 * @param timeStr - Time string in HH:mm format (e.g., "06:30", "18:45")
 * @returns Time string in 12-hour format (e.g., "6:30am", "6:45pm")
 * 
 * @example
 * formatTime("06:30") // "6:30am"
 * formatTime("18:45") // "6:45pm"
 * formatTime("00:15") // "12:15am"
 * formatTime("12:00") // "12:00pm"
 * 
 * Validates: Requirement 4.5
 */
export function formatTime(timeStr: string): string {
  const parts = timeStr.split(':');
  const hoursStr = parts[0] ?? '0';
  const minutesStr = parts[1] ?? '00';
  const hours = parseInt(hoursStr, 10);
  const minutes = minutesStr;
  
  if (hours === 0) {
    return `12:${minutes}am`;
  } else if (hours < 12) {
    return `${hours}:${minutes}am`;
  } else if (hours === 12) {
    return `12:${minutes}pm`;
  } else {
    return `${hours - 12}:${minutes}pm`;
  }
}

/**
 * Check if a date is in the past.
 * Compares the date (ignoring time) against today's date.
 * 
 * @param date - The date to check
 * @returns true if the date is before today, false otherwise
 * 
 * @example
 * // If today is March 15, 2024:
 * isDateInPast(new Date(2024, 2, 14)) // true
 * isDateInPast(new Date(2024, 2, 15)) // false (today is not in the past)
 * isDateInPast(new Date(2024, 2, 16)) // false
 * 
 * Validates: Requirement 3.4
 */
export function isDateInPast(date: Date): boolean {
  const today = startOfDay(new Date());
  const checkDate = startOfDay(date);
  return isBefore(checkDate, today);
}

/**
 * Format a duration in minutes to a human-readable string.
 * 
 * @param minutes - Total duration in minutes
 * @returns Duration string in "Xh Ym" format
 * 
 * @example
 * formatDuration(255) // "4h 15m"
 * formatDuration(60)  // "1h 0m"
 * formatDuration(45)  // "0h 45m"
 * 
 * Validates: Requirement 4.6
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
