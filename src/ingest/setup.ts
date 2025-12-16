/**
 * Elasticsearch index template and ingest pipeline setup.
 *
 * Configures index templates with field mappings and ingest pipelines
 * for automatic timestamp enrichment.
 */

import type { Client } from '@elastic/elasticsearch';
import { createLogger } from '../logger';
import { withSpan, SpanAttributes } from '../instrumentation';

const log = createLogger('ingest:setup');

/**
 * Creates ingest pipeline for timestamp enrichment.
 *
 * @param client - Elasticsearch client
 * @param pipelineName - Pipeline identifier
 */
async function createIngestPipeline(client: Client, pipelineName: string): Promise<void> {
  log.info(
    { 'elasticsearch.pipeline': pipelineName },
    `Creating ingest pipeline '${pipelineName}'`,
  );

  await client.ingest.putPipeline({
    id: pipelineName,
    description: 'Add event.ingested timestamp to smart home events',
    processors: [
      {
        set: {
          field: 'event.ingested',
          value: '{{{_ingest.timestamp}}}',
        },
      },
    ],
  });

  log.info(
    { 'elasticsearch.pipeline': pipelineName },
    `Ingest pipeline '${pipelineName}' created successfully`,
  );
}

/**
 * Creates index template with field mappings.
 *
 * @param client - Elasticsearch client
 * @param templateName - Template identifier
 * @param indexPattern - Index pattern (e.g., "smart-home-events-*")
 * @param pipelineName - Default pipeline for indices
 */
async function createIndexTemplate(
  client: Client,
  templateName: string,
  indexPattern: string,
  pipelineName: string,
): Promise<void> {
  log.info(
    { 'elasticsearch.template': templateName, 'elasticsearch.index_pattern': indexPattern },
    `Creating index template '${templateName}' for pattern '${indexPattern}'`,
  );

  await client.indices.putIndexTemplate({
    name: templateName,
    index_patterns: [indexPattern],
    priority: 100,
    template: {
      settings: {
        index: {
          default_pipeline: pipelineName,
        },
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          event: {
            properties: {
              ingested: { type: 'date' },
            },
          },
          '@type': { type: 'keyword' },
          id: { type: 'keyword' },
          deviceId: { type: 'keyword' },
          path: { type: 'keyword' },
          device: {
            properties: {
              name: { type: 'keyword' },
              type: { type: 'keyword' },
            },
          },
          room: {
            properties: {
              id: { type: 'keyword' },
              name: { type: 'keyword' },
            },
          },
          metric: {
            properties: {
              name: { type: 'keyword' },
              value: { type: 'float' },
            },
          },
        },
      },
    },
  });

  log.info(
    { 'elasticsearch.index_pattern': indexPattern, 'elasticsearch.template': templateName },
    `Index template '${templateName}' created successfully. New indices matching '${indexPattern}' will automatically use this template.`,
  );
}

/**
 * Sets up Elasticsearch infrastructure for smart home events.
 *
 * Creates:
 * - Ingest pipeline for timestamp enrichment
 * - Index template with field mappings for daily indices
 *
 * @param client - Elasticsearch client
 * @param indexPrefix - Index name prefix (e.g., "smart-home-events")
 * @returns Promise that resolves when setup completes
 */
export async function setupElasticsearch(client: Client, indexPrefix: string): Promise<void> {
  return withSpan('setup', { [SpanAttributes.INDEX_NAME]: indexPrefix }, async () => {
    log.info('Setting up Elasticsearch ingest pipeline and index template');

    const pipelineName = `${indexPrefix}-pipeline`;
    const templateName = `${indexPrefix}-template`;
    const indexPattern = `${indexPrefix}-*`;

    await createIngestPipeline(client, pipelineName);
    await createIndexTemplate(client, templateName, indexPattern, pipelineName);
  });
}
