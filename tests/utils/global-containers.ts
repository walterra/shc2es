/**
 * Helper to access globally started E2E test containers
 * Containers are started once in global-setup.e2e.ts
 * Uses Vitest 3+ inject() API to access provided values
 */

import { inject } from 'vitest';
import { Client } from '@elastic/elasticsearch';

/**
 * Container URLs from global setup
 */
export interface GlobalContainers {
  elasticsearchUrl: string;
  kibanaUrl: string;
}

/**
 * Gets container URLs from Vitest's provided context
 * Throws if containers not started (indicates setup issue)
 * @returns Container URLs
 */
export function getGlobalContainers(): GlobalContainers {
  const elasticsearchUrl = inject('elasticsearchUrl');
  const kibanaUrl = inject('kibanaUrl');

  if (!elasticsearchUrl || !kibanaUrl) {
    throw new Error(
      'E2E containers not initialized. Ensure globalSetup is configured and provides elasticsearchUrl/kibanaUrl',
    );
  }

  return {
    elasticsearchUrl,
    kibanaUrl,
  };
}

/**
 * Creates Elasticsearch client for global container
 * @returns Elasticsearch client
 */
export function createElasticsearchClient(): Client {
  const { elasticsearchUrl } = getGlobalContainers();

  return new Client({
    node: elasticsearchUrl,
    auth: {
      username: 'elastic',
      password: 'changeme',
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}
