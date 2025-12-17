/**
 * Test helper utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { vi } from 'vitest';

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
  const noop = (): void => undefined;
  vi.spyOn(console, 'log').mockImplementation(noop);
  vi.spyOn(console, 'error').mockImplementation(noop);
  vi.spyOn(console, 'warn').mockImplementation(noop);
  vi.spyOn(console, 'info').mockImplementation(noop);
  vi.spyOn(console, 'debug').mockImplementation(noop);
}
