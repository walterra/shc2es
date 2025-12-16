/**
 * Bulk import of NDJSON files to Elasticsearch.
 *
 * Handles batch processing of event files with streaming and bulk API.
 */

import type { Client } from '@elastic/elasticsearch';
import { createReadStream } from 'fs';
import { glob } from 'glob';
import split from 'split2';
import { getDataDir } from '../config';
import { createLogger } from '../logger';
import { withSpan, SpanAttributes } from '../instrumentation';

import { generateDocId } from '../transforms';
import { extractDateFromFilename, getIndexName, parseLine } from './utils';
import type { TransformedEvent } from './transform';
import { transformEvent } from './transform';

const log = createLogger('ingest:bulk-import');

/**
 * Imports single NDJSON file to Elasticsearch using bulk API.
 *
 * Streams file line-by-line, transforms events, and bulk indexes in batches.
 *
 * @param client - Elasticsearch client
 * @param filePath - Path to NDJSON file
 * @param indexPrefix - Index name prefix
 * @returns Number of documents indexed
 */
export async function importFile(
  client: Client,
  filePath: string,
  indexPrefix: string,
): Promise<number> {
  return withSpan(
    'bulk_import_file',
    {
      [SpanAttributes.FILE_PATH]: filePath,
    },
    async () => {
      const dateStr = extractDateFromFilename(filePath);
      const indexName = getIndexName(indexPrefix, dateStr);
      log.info(
        { 'file.path': filePath, 'elasticsearch.index': indexName },
        `Importing ${filePath} to index ${indexName}`,
      );

      const documents: { doc: TransformedEvent; id: string }[] = [];

      return new Promise<number>((resolve, reject) => {
        createReadStream(filePath)
          .pipe(split())
          .on('data', (line: string) => {
            const doc = parseLine(line);
            if (doc) {
              documents.push({
                doc: transformEvent(doc),
                id: generateDocId(doc),
              });
            }
          })
          .on('end', () => {
            if (documents.length === 0) {
              resolve(0);
              return;
            }

            const operations = documents.flatMap(({ doc, id }) => [
              { index: { _index: indexName, _id: id } },
              doc,
            ]);

            client
              .bulk({ operations, refresh: true })
              .then((result) => {
                if (result.errors) {
                  const errors = result.items.filter((item) => item.index?.error);
                  log.error(
                    {
                      'error.count': errors.length,
                      'elasticsearch.index': indexName,
                      errors: errors.slice(0, 3).map((item) => item.index?.error),
                    },
                    `Failed to index ${String(errors.length)} documents to ${indexName}`,
                  );
                }

                const indexed = result.items.filter((item) => !item.index?.error).length;
                log.info(
                  {
                    'document.count': indexed,
                    'elasticsearch.index': indexName,
                    [SpanAttributes.DOCUMENTS_COUNT]: documents.length,
                    [SpanAttributes.INDEX_NAME]: indexName,
                  },
                  `Indexed ${String(indexed)} documents to ${indexName}`,
                );
                resolve(indexed);
              })
              .catch((err: unknown) => {
                reject(err instanceof Error ? err : new Error(String(err)));
              });
          })
          .on('error', reject);
      });
    },
  );
}

/**
 * Imports multiple NDJSON files matching pattern.
 *
 * Finds files using glob pattern and processes them sequentially.
 *
 * @param client - Elasticsearch client
 * @param indexPrefix - Index name prefix
 * @param pattern - Glob pattern (optional, defaults to all events-*.ndjson files)
 */
export async function importFiles(
  client: Client,
  indexPrefix: string,
  pattern?: string,
): Promise<void> {
  const globPattern = pattern
    ? pattern.includes('/')
      ? pattern
      : `${getDataDir()}/${pattern}`
    : `${getDataDir()}/events-*.ndjson`;

  log.info({ 'file.pattern': globPattern }, `Starting batch import with pattern: ${globPattern}`);

  const files = await glob(globPattern);

  if (files.length === 0) {
    log.info(
      { 'file.path': getDataDir() },
      `No NDJSON files found in data directory: ${getDataDir()}`,
    );
    return;
  }

  log.info({ 'file.count': files.length }, `Found ${String(files.length)} files to import`);

  let totalIndexed = 0;
  for (const file of files.sort()) {
    const indexed = await importFile(client, file, indexPrefix);
    totalIndexed += indexed;
  }

  log.info(
    { 'document.count': totalIndexed },
    `Batch import complete: indexed ${String(totalIndexed)} documents`,
  );
}
