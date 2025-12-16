/**
 * Real-time file watching and tailing for live event ingestion.
 *
 * Monitors daily event files and streams new events to Elasticsearch as they arrive.
 */

import type { Client } from '@elastic/elasticsearch';
import chokidar, { type FSWatcher } from 'chokidar';
import { Tail } from 'tail';
import * as path from 'path';
import { getDataDir } from '../config';
import { createLogger, serializeError } from '../logger';
import type { SmartHomeEvent, GenericEvent } from '../types/smart-home-events';
import { isKnownEventType } from '../types/smart-home-events';
import { generateDocId } from '../transforms';
import { getIndexName, parseLine } from './utils';
import { transformEvent } from './transform';

const log = createLogger('ingest:watch');

/**
 * Indexes single event to Elasticsearch.
 *
 * @param client - Elasticsearch client
 * @param doc - Parsed event
 * @param indexName - Target index name
 */
function indexSingleEvent(client: Client, doc: GenericEvent, indexName: string): void {
  const transformed = transformEvent(doc);
  client
    .index({
      index: indexName,
      id: generateDocId(doc),
      document: transformed,
    })
    .then(() => {
      let deviceId: string | undefined;
      if (isKnownEventType(doc)) {
        const knownDoc = doc as unknown as SmartHomeEvent;
        deviceId = knownDoc['@type'] === 'DeviceServiceData' ? knownDoc.deviceId : undefined;
      } else if ('deviceId' in doc && typeof doc.deviceId === 'string') {
        deviceId = doc.deviceId;
      }
      log.debug(
        { 'event.type': doc['@type'], 'device.id': deviceId, 'elasticsearch.index': indexName },
        `Indexed ${doc['@type']} event${deviceId ? ` from device ${deviceId}` : ''} to ${indexName}`,
      );
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(serializeError(err), `Failed to index event: ${message}`);
    });
}

/**
 * Starts tailing file and indexing new events.
 *
 * @param client - Elasticsearch client
 * @param filePath - Path to NDJSON file
 * @param indexName - Target index name
 * @returns Tail instance
 */
function startTailing(client: Client, filePath: string, indexName: string): Tail {
  log.info(
    { 'file.path': filePath, 'elasticsearch.index': indexName },
    `Tailing ${filePath} to index ${indexName}`,
  );

  const tail = new Tail(filePath, { fromBeginning: false, follow: true });

  tail.on('line', (line: string) => {
    const doc = parseLine(line);
    if (doc) {
      indexSingleEvent(client, doc, indexName);
    }
  });

  tail.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error(
      { ...serializeError(err), 'file.path': filePath },
      `Tail error for ${filePath}: ${message}`,
    );
  });

  return tail;
}

/**
 * Starts file watcher for daily events file.
 *
 * Watches for file creation/deletion and manages tail lifecycle.
 * Handles daily rotation by stopping old tail and starting new one.
 *
 * @param client - Elasticsearch client
 * @param filePath - Path to file to watch
 * @param indexName - Target index name
 * @returns Watcher instance and tail reference
 */
function startFileWatcher(
  client: Client,
  filePath: string,
  indexName: string,
): { watcher: FSWatcher; tailRef: { current: Tail | null } } {
  const tailRef = { current: null as Tail | null };

  const watcher = chokidar.watch(filePath, {
    persistent: true,
    ignoreInitial: false,
  });

  watcher.on('ready', () => {
    log.info(`File watcher ready, monitoring ${filePath}`);
  });

  watcher.on('error', (err) => {
    const message = err instanceof Error ? err.message : String(err);
    log.error(serializeError(err), `File watcher error: ${message}`);
  });

  watcher.on('add', (addedPath) => {
    tailRef.current = startTailing(client, addedPath, indexName);
  });

  watcher.on('unlink', (unlinkedPath) => {
    if (tailRef.current) {
      tailRef.current.unwatch();
      tailRef.current = null;
      log.info(
        { 'file.path': unlinkedPath },
        `Stopped tailing ${unlinkedPath} (file removed or rotated)`,
      );
    }
  });

  return { watcher, tailRef };
}

/**
 * Starts watch mode for real-time event ingestion.
 *
 * Monitors current day's event file and tails new events to Elasticsearch.
 * Handles graceful shutdown on SIGINT (Ctrl+C).
 *
 * @param client - Elasticsearch client
 * @param indexPrefix - Index name prefix
 */
export function startWatchMode(client: Client, indexPrefix: string): void {
  // Get current day's file
  const today = new Date().toISOString().split('T')[0] ?? '';
  const todayFile = path.join(getDataDir(), `events-${today}.ndjson`);
  const indexName = getIndexName(indexPrefix, today);

  log.info(
    { 'file.path': todayFile, 'elasticsearch.index': indexName },
    `Starting watch mode for ${todayFile} → ${indexName}`,
  );

  const { watcher, tailRef } = startFileWatcher(client, todayFile, indexName);

  // Graceful shutdown
  process.on('SIGINT', () => {
    log.info('Shutting down watch mode');
    void watcher.close();
    if (tailRef.current) {
      tailRef.current.unwatch();
    }
    process.exit(0);
  });

  log.info('Watch mode active for real-time ingestion. Press Ctrl+C to stop.');
}
