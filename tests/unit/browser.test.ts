/**
 * Unit Tests for Browser Utility
 * Tests for src/utils/browser.ts
 * 
 * Validates: Requirements 8.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openInBrowser } from '../../src/utils/browser';

// Mock the 'open' package
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined)
}));

describe('openInBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should call open with the provided URL', async () => {
    const open = (await import('open')).default;
    const url = 'https://www.kiwi.com/booking?token=abc123';
    
    await openInBrowser(url);
    
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(url);
  });

  it('should handle various valid URL formats', async () => {
    const open = (await import('open')).default;
    
    const urls = [
      'https://www.kiwi.com/booking',
      'http://localhost:3000',
      'https://example.com/path/to/page?query=value',
      'https://subdomain.example.org:8080/path'
    ];

    for (const url of urls) {
      vi.clearAllMocks();
      await openInBrowser(url);
      expect(open).toHaveBeenCalledWith(url);
    }
  });

  it('should throw error for empty URL', async () => {
    await expect(openInBrowser('')).rejects.toThrow('Invalid URL: URL must be a non-empty string');
  });

  it('should throw error for null URL', async () => {
    // @ts-expect-error Testing invalid input
    await expect(openInBrowser(null)).rejects.toThrow('Invalid URL: URL must be a non-empty string');
  });

  it('should throw error for undefined URL', async () => {
    // @ts-expect-error Testing invalid input
    await expect(openInBrowser(undefined)).rejects.toThrow('Invalid URL: URL must be a non-empty string');
  });

  it('should throw error for invalid URL format', async () => {
    await expect(openInBrowser('not-a-valid-url')).rejects.toThrow('Invalid URL format: not-a-valid-url');
  });

  it('should throw error for URL without protocol', async () => {
    await expect(openInBrowser('www.example.com')).rejects.toThrow('Invalid URL format: www.example.com');
  });

  it('should propagate errors from open package', async () => {
    const open = (await import('open')).default;
    const error = new Error('Failed to open browser');
    vi.mocked(open).mockRejectedValueOnce(error);

    await expect(openInBrowser('https://example.com')).rejects.toThrow('Failed to open browser');
  });
});
