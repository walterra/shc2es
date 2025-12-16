/**
 * Ingest configuration management.
 *
 * Handles lazy configuration loading, TLS setup for Elasticsearch and Kibana,
 * and client creation with proper authentication.
 */

import { Client } from '@elastic/elasticsearch';
import { Agent, fetch as undiciFetch } from 'undici';
import { readFileSync } from 'fs';
import { createLogger, logErrorAndExit } from '../logger';
import { validateIngestConfig } from '../validation';
import type { IngestConfig } from '../validation';

const log = createLogger('ingest:config');

/**
 * TLS configuration for secure connections.
 */
export interface TlsConfig {
  rejectUnauthorized?: boolean;
  ca?: Buffer;
}

// Lazy config loading - singleton pattern
let _config: IngestConfig | null = null;

/**
 * Gets validated ingest configuration with lazy loading.
 *
 * Loads and validates configuration on first call, then caches for subsequent calls.
 * Exits process if validation fails.
 *
 * @param requireKibana - Whether Kibana configuration is required
 * @returns Validated ingest configuration
 */
export function getIngestConfig(requireKibana = false): IngestConfig {
  if (_config) {
    return _config;
  }
  const configResult = validateIngestConfig({ requireKibana });
  if (configResult.isErr()) {
    logErrorAndExit(
      configResult.error,
      `Configuration validation failed: ${configResult.error.message}`,
    );
  }
  _config = configResult.value;
  return _config;
}

/**
 * Builds TLS configuration based on environment settings.
 *
 * Checks ES_TLS_VERIFY and ES_CA_CERT environment variables to configure
 * certificate verification and custom CA certificates.
 *
 * @param config - Validated ingest configuration
 * @returns TLS configuration for HTTP clients
 */
export function buildTlsConfig(config: IngestConfig): TlsConfig {
  if (!config.esTlsVerify) {
    log.debug('TLS verification disabled via ES_TLS_VERIFY=false (development mode)');
    return { rejectUnauthorized: false };
  }

  if (config.esCaCert) {
    log.debug(
      { 'file.path': config.esCaCert },
      `Using custom CA certificate from ${config.esCaCert}`,
    );
    return { ca: readFileSync(config.esCaCert) };
  }

  return {};
}

/**
 * Creates Elasticsearch client with authentication and TLS configuration.
 *
 * @param config - Validated ingest configuration
 * @returns Configured Elasticsearch client
 */
export function createElasticsearchClient(config: IngestConfig): Client {
  return new Client({
    node: config.esNode,
    auth: {
      username: config.esUser,
      password: config.esPassword,
    },
    tls: buildTlsConfig(config),
  });
}

/**
 * Creates fetch function with custom TLS settings for Kibana requests.
 *
 * Uses undici's Agent to configure TLS certificate verification and custom CA certificates.
 * Falls back to global fetch if no custom TLS configuration is needed.
 *
 * @param config - Validated ingest configuration
 * @returns Fetch function with TLS configuration
 */
export function createKibanaFetch(config: IngestConfig): typeof globalThis.fetch {
  const tlsConfig = buildTlsConfig(config);

  // If no custom TLS config needed, use global fetch
  if (Object.keys(tlsConfig).length === 0) {
    return globalThis.fetch;
  }

  const agent = new Agent({
    connect: {
      rejectUnauthorized: tlsConfig.rejectUnauthorized ?? true,
      ca: tlsConfig.ca,
    },
  });

  return ((url, options) =>
    undiciFetch(url, {
      ...options,
      dispatcher: agent,
    })) as typeof globalThis.fetch;
}
