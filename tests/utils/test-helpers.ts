/**
 * Test helper utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Create a temporary directory for test fixtures
 * @param prefix - Directory name prefix (default: 'shc2es-test-')
 * @returns Path to the created temporary directory
 */
export function createTempDir(prefix = 'shc2es-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Clean up a temporary directory
 * @param dir - Path to the directory to remove
 * @returns void
 */
export function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Suppress console output during a test
 * @returns void
 */
export function suppressConsole(): void {
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(console, 'info').mockImplementation();
  jest.spyOn(console, 'debug').mockImplementation();
}
