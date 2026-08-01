/**
 * Unit Tests for Date Utilities
 * Tests for src/utils/dates.ts
 */

import { describe, it, expect } from 'vitest';
import { 
  formatForKiwiApi, 
  formatForDisplay, 
  formatTime, 
  isDateInPast, 
  formatDuration 
} from '../../src/utils/dates';

describe('formatForKiwiApi', () => {
  it('should format date as DD/MM/YYYY', () => {
    // March 15, 2024
    const date = new Date(2024, 2, 15);
    expect(formatForKiwiApi(date)).toBe('15/03/2024');
  });

  it('should pad single digit day with leading zero', () => {
    // January 5, 2024
    const date = new Date(2024, 0, 5);
    expect(formatForKiwiApi(date)).toBe('05/01/2024');
  });

  it('should pad single digit month with leading zero', () => {
    // May 22, 2024
    const date = new Date(2024, 4, 22);
    expect(formatForKiwiApi(date)).toBe('22/05/2024');
  });

  it('should handle end of year dates', () => {
    // December 31, 2024
    const date = new Date(2024, 11, 31);
    expect(formatForKiwiApi(date)).toBe('31/12/2024');
  });
});

describe('formatForDisplay', () => {
  it('should format date as abbreviated month and day', () => {
    // March 15, 2024
    const date = new Date(2024, 2, 15);
    expect(formatForDisplay(date)).toBe('Mar 15');
  });

  it('should not pad single digit day', () => {
    // January 5, 2024
    const date = new Date(2024, 0, 5);
    expect(formatForDisplay(date)).toBe('Jan 5');
  });

  it('should handle different months correctly', () => {
    expect(formatForDisplay(new Date(2024, 0, 1))).toBe('Jan 1');
    expect(formatForDisplay(new Date(2024, 5, 15))).toBe('Jun 15');
    expect(formatForDisplay(new Date(2024, 11, 25))).toBe('Dec 25');
  });
});

describe('formatTime', () => {
  it('should format morning time correctly', () => {
    expect(formatTime('06:30')).toBe('6:30am');
    expect(formatTime('09:15')).toBe('9:15am');
  });

  it('should format afternoon/evening time correctly', () => {
    expect(formatTime('18:45')).toBe('6:45pm');
    expect(formatTime('14:00')).toBe('2:00pm');
    expect(formatTime('23:59')).toBe('11:59pm');
  });

  it('should handle midnight correctly', () => {
    expect(formatTime('00:00')).toBe('12:00am');
    expect(formatTime('00:15')).toBe('12:15am');
  });

  it('should handle noon correctly', () => {
    expect(formatTime('12:00')).toBe('12:00pm');
    expect(formatTime('12:30')).toBe('12:30pm');
  });

  it('should preserve minutes exactly', () => {
    expect(formatTime('07:05')).toBe('7:05am');
    expect(formatTime('15:00')).toBe('3:00pm');
  });
});

describe('isDateInPast', () => {
  it('should return true for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isDateInPast(yesterday)).toBe(true);
  });

  it('should return false for tomorrow', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isDateInPast(tomorrow)).toBe(false);
  });

  it('should return false for today', () => {
    const today = new Date();
    expect(isDateInPast(today)).toBe(false);
  });

  it('should return true for dates far in the past', () => {
    const pastDate = new Date(2020, 0, 1);
    expect(isDateInPast(pastDate)).toBe(true);
  });

  it('should return false for dates far in the future', () => {
    const futureDate = new Date(2030, 11, 31);
    expect(isDateInPast(futureDate)).toBe(false);
  });
});

describe('formatDuration', () => {
  it('should format duration in hours and minutes', () => {
    expect(formatDuration(255)).toBe('4h 15m');
    expect(formatDuration(150)).toBe('2h 30m');
  });

  it('should handle exact hours', () => {
    expect(formatDuration(60)).toBe('1h 0m');
    expect(formatDuration(120)).toBe('2h 0m');
  });

  it('should handle less than an hour', () => {
    expect(formatDuration(45)).toBe('0h 45m');
    expect(formatDuration(30)).toBe('0h 30m');
  });

  it('should handle zero minutes', () => {
    expect(formatDuration(0)).toBe('0h 0m');
  });

  it('should handle long durations', () => {
    expect(formatDuration(600)).toBe('10h 0m');
    expect(formatDuration(615)).toBe('10h 15m');
  });
});
