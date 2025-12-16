/**
 * Helper to access globally started E2E test containers
 * Containers are started once in global-setup.e2e.ts
 */

import { Client } from '@elastic/elasticsearch';

/**
 * Container URLs from global setup
 */
export interface GlobalContainers {
  elasticsearchUrl: string;
  kibanaUrl: string;
}

/**
 * Gets container URLs from global state
 * Throws if containers not started (indicates setup issue)
 */
export function getGlobalContainers(): GlobalContainers {
  const containers = global.__E2E_CONTAINERS__;

  if (!containers) {
    throw new Error(
      'E2E containers not initialized. Ensure globalSetup is configured.'
    );
  }

  if (!containers.elasticsearchUrl || !containers.kibanaUrl) {
    throw new Error('E2E container URLs not available');
  }

  return {
    elasticsearchUrl: containers.elasticsearchUrl,
    kibanaUrl: containers.kibanaUrl,
  };
}

/**
 * Creates Elasticsearch client for global container
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
