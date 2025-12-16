/**
 * Jest global setup for E2E tests
 * Starts Docker containers once before all tests
 *
 * Note: Mock controller is NOT started here - tests use MockBoschController
 * class directly for flexibility (different events per test)
 */

import {
  startElasticsearchContainer,
  startKibanaContainer,
} from './utils/containers';
import type { StartedTestContainer } from 'testcontainers';

// Store container references globally
declare global {
  // eslint-disable-next-line no-var
  var __E2E_CONTAINERS__: {
    elasticsearch?: StartedTestContainer;
    kibana?: StartedTestContainer;
    elasticsearchUrl?: string;
    kibanaUrl?: string;
  };
}

/**
 * Start shared containers once before test suite
 * Elasticsearch and Kibana take longest to start (~12 min first run)
 */
export default async function globalSetup(): Promise<void> {
  console.log('[E2E Global Setup] Starting containers...');

  global.__E2E_CONTAINERS__ = {};

  // Start Elasticsearch
  const { container: esContainer, url: esUrl, containerUrl: esContainerUrl } =
    await startElasticsearchContainer();
  global.__E2E_CONTAINERS__.elasticsearch = esContainer;
  global.__E2E_CONTAINERS__.elasticsearchUrl = esUrl;

  // Start Kibana (use containerUrl for inter-container communication)
  const { container: kibanaContainer, url: kibanaUrl } =
    await startKibanaContainer(esContainerUrl);
  global.__E2E_CONTAINERS__.kibana = kibanaContainer;
  global.__E2E_CONTAINERS__.kibanaUrl = kibanaUrl;

  console.log('[E2E Global Setup] Containers ready');
  console.log(`  Elasticsearch: ${esUrl}`);
  console.log(`  Kibana: ${kibanaUrl}`);
}
