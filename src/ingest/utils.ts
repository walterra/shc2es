/**
 * Pure utility functions for ingestion pipeline.
 *
 * Contains stateless transformation functions with no side effects.
 * All functions are deterministic and can be safely cached/memoized.
 */

import * as path from 'path';
import { createLogger, serializeError } from '../logger';
import type { GenericEvent } from '../types/smart-home-events';

const log = createLogger('ingest:utils');

/**
 * Extracts date from NDJSON filename.
 *
 * Parses filenames like "events-2025-12-10.ndjson" to extract ISO date.
 * Falls back to current date if pattern doesn't match.
 *
 * @param filePath - Path to NDJSON file
 * @returns ISO date string (YYYY-MM-DD)
 */
export function extractDateFromFilename(filePath: string): string {
  const match = /events-(\d{4}-\d{2}-\d{2})\.ndjson/.exec(path.basename(filePath));
  if (match?.[1]) {
    return match[1];
  }
  const isoDate = new Date().toISOString().split('T')[0];
  return isoDate ?? '1970-01-01'; // Fallback should never happen
}

/**
 * Generates Elasticsearch index name for a specific date.
 *
 * Creates daily index names using configured prefix.
 *
 * @param indexPrefix - Index name prefix (e.g., "smart-home-events")
 * @param date - ISO date string (YYYY-MM-DD)
 * @returns Full index name (e.g., "smart-home-events-2025-12-10")
 */
export function getIndexName(indexPrefix: string, date: string): string {
  return `${indexPrefix}-${date}`;
}

/**
 * Parses NDJSON line into event object.
 *
 * Handles Pino's leading comma issue in NDJSON output.
 * Returns null for empty lines or parse errors.
 *
 * @param line - Raw NDJSON line
 * @returns Parsed event or null if invalid
 */
export function parseLine(line: string): GenericEvent | null {
  if (!line || line.trim() === '') return null;
  try {
    // Handle pino's leading comma in output
    const cleanLine = line.startsWith('{,') ? '{' + line.slice(2) : line;
    return JSON.parse(cleanLine) as GenericEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { ...serializeError(err), linePreview: line.slice(0, 100) },
      `Failed to parse NDJSON line: ${message}`,
    );
    return null;
  }
}
