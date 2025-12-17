/**
 * Vitest global setup for E2E tests
 * Starts Docker containers once before all tests
 *
 * Uses Vitest 3+ provide/inject API to share container URLs with tests
 *
 * Note: Mock controller is NOT started here - tests use MockBoschController
 * class directly for flexibility (different events per test)
 */

/* eslint-disable no-console */
import type { GlobalSetupContext } from 'vitest/node';
import { startElasticsearchContainer, startKibanaContainer } from './utils/containers';
import type { StartedTestContainer } from 'testcontainers';

// Augment Vitest's ProvidedContext with our container data
declare module 'vitest' {
  export interface ProvidedContext {
    elasticsearchUrl: string;
    kibanaUrl: string;
  }
}

// Store actual container instances for teardown (not accessible to tests)
let esContainer: StartedTestContainer | undefined;
let kibanaContainer: StartedTestContainer | undefined;

/**
 * Start shared containers once before test suite
 * Elasticsearch and Kibana take longest to start (~12 min first run)
 *
 * Vitest requires setup to return a teardown function
 */
export default async function globalSetup({
  provide,
}: GlobalSetupContext): Promise<() => Promise<void>> {
  console.log('[E2E Global Setup] Starting containers...');

  // Start Elasticsearch
  const {
    container,
    url: esUrl,
    containerUrl: esContainerUrl,
    client: esClient,
  } = await startElasticsearchContainer();

  // Store container reference for teardown (module-level, not accessible to tests)
  esContainer = container;

  // Start Kibana (use containerUrl for inter-container communication)
  const { container: kContainer, url: kibanaUrl } = await startKibanaContainer(esContainerUrl);

  // Store container reference for teardown
  kibanaContainer = kContainer;

  console.log('[E2E Global Setup] Containers started, verifying readiness...');

  // Verify Elasticsearch is ready
  try {
    const esHealth = await esClient.cluster.health();
    console.log(`  Elasticsearch: ${esUrl} (status: ${esHealth.status})`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('  Elasticsearch health check failed:', errorMessage);
    throw new Error('Elasticsearch not ready after container start');
  } finally {
    await esClient.close();
  }

  // Verify Kibana is ready with retry logic (can take a moment after container reports ready)
  let kibanaReady = false;
  const maxRetries = 10;
  const retryDelay = 3000; // 3 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const kibanaResponse = await fetch(`${kibanaUrl}/api/status`);
      if (!kibanaResponse.ok) {
        throw new Error(`Status check returned ${String(kibanaResponse.status)}`);
      }

      const status = (await kibanaResponse.json()) as {
        status?: { overall?: { level?: string } };
      };
      const level = status.status?.overall?.level ?? 'unknown';

      // Accept 'available' or 'degraded' (matches container wait strategy)
      if (level === 'available' || level === 'degraded') {
        kibanaReady = true;
        break;
      }

      // Status exists but not ready yet - retry
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    } catch {
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  if (!kibanaReady) {
    throw new Error('Kibana not ready after container start and retries');
  }

  // Provide URLs to tests via Vitest's provide/inject API
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  provide('elasticsearchUrl', esUrl);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  provide('kibanaUrl', kibanaUrl);

  // Return teardown function (Vitest requirement)
  return async () => {
    if (esContainer) {
      await esContainer.stop();
    }

    if (kibanaContainer) {
      await kibanaContainer.stop();
    }
  };
}
