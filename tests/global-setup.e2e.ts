/**
 * Jest global setup for E2E tests
 * Starts Docker containers once before all tests
 *
 * Note: Mock controller is NOT started here - tests use MockBoschController
 * class directly for flexibility (different events per test)
 */

/* eslint-disable no-console */
import { startElasticsearchContainer, startKibanaContainer } from './utils/containers';
import type { StartedTestContainer } from 'testcontainers';

// Store container references globally
declare global {
  var __E2E_CONTAINERS__:
    | {
        elasticsearch?: StartedTestContainer;
        kibana?: StartedTestContainer;
        elasticsearchUrl?: string;
        kibanaUrl?: string;
      }
    | undefined;
}

/**
 * Start shared containers once before test suite
 * Elasticsearch and Kibana take longest to start (~12 min first run)
 */
export default async function globalSetup(): Promise<void> {
  console.log('[E2E Global Setup] Starting containers...');

  global.__E2E_CONTAINERS__ = {};

  // Start Elasticsearch
  const {
    container: esContainer,
    url: esUrl,
    containerUrl: esContainerUrl,
    client: esClient,
  } = await startElasticsearchContainer();
  global.__E2E_CONTAINERS__.elasticsearch = esContainer;
  global.__E2E_CONTAINERS__.elasticsearchUrl = esUrl;

  // Start Kibana (use containerUrl for inter-container communication)
  const { container: kibanaContainer, url: kibanaUrl } = await startKibanaContainer(esContainerUrl);
  global.__E2E_CONTAINERS__.kibana = kibanaContainer;
  global.__E2E_CONTAINERS__.kibanaUrl = kibanaUrl;

  console.log('[E2E Global Setup] Containers started, verifying readiness...');

  // Verify Elasticsearch is ready
  try {
    const esHealth = await esClient.cluster.health();
    console.log(`  Elasticsearch: ${esUrl} (status: ${esHealth.status})`);
  } catch (error: unknown) {
    console.error('  Elasticsearch health check failed:', error);
    throw new Error('Elasticsearch not ready after container start');
  } finally {
    await esClient.close();
  }

  // Verify Kibana is ready with explicit status check
  try {
    const kibanaResponse = await fetch(`${kibanaUrl}/api/status`);
    if (!kibanaResponse.ok) {
      const statusCode = String(kibanaResponse.status);
      throw new Error(`Kibana status check returned ${statusCode}`);
    }

    const status = (await kibanaResponse.json()) as {
      status?: { overall?: { level?: string } };
    };
    const level = status.status?.overall?.level ?? 'unknown';

    console.log(`  Kibana: ${kibanaUrl} (status: ${level})`);

    // Expect 'available' or 'degraded' (matches container wait strategy)
    if (level !== 'available' && level !== 'degraded') {
      throw new Error(`Kibana status is '${level}', expected 'available' or 'degraded'`);
    }
  } catch (error: unknown) {
    console.error('  Kibana health check failed:', error);
    throw new Error('Kibana not ready after container start');
  }

  console.log('[E2E Global Setup] All containers ready for testing');
}
