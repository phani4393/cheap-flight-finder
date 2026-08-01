/**
 * Browser Utility
 * Opens URLs in the default browser.
 * 
 * Uses the 'open' package to launch URLs in the system's default browser.
 * This is used for the --open flag to open booking URLs directly.
 */

import open from 'open';

/**
 * Opens the specified URL in the user's default browser.
 * 
 * @param url - The URL to open (typically a booking URL)
 * @throws Error if the URL cannot be opened
 * 
 * @example
 * // Open a flight booking URL
 * await openInBrowser('https://www.kiwi.com/booking?token=abc123');
 * 
 * Validates: Requirements 8.2
 */
export async function openInBrowser(url: string): Promise<void> {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL: URL must be a non-empty string');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }

  await open(url);
}
