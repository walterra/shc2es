/**
 * Jest global teardown for E2E tests
 * Stops Docker containers after all tests
 *
 * Note: This file is legacy - Vitest uses teardown function returned from global-setup.e2e.ts
 */

/* eslint-disable no-console */

import type { StartedTestContainer } from 'testcontainers';

// Type for E2E container storage
interface E2EContainers {
  elasticsearch?: StartedTestContainer;
  kibana?: StartedTestContainer;
}

// Extend NodeJS global with E2E containers
declare global {
  var __E2E_CONTAINERS__: E2EContainers | undefined;
}

/**
 * Stop all containers after test suite
 * @returns Promise that resolves when teardown is complete
 */
export default async function globalTeardown(): Promise<void> {
  console.log('[E2E Global Teardown] Stopping containers...');

  const containers = global.__E2E_CONTAINERS__;

  if (containers === undefined) {
    console.log('[E2E Global Teardown] No containers to stop');
    return;
  }

  // Stop containers in reverse order (Kibana first, then Elasticsearch)
  if (containers.kibana !== undefined) {
    await containers.kibana.stop().catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[E2E Global Teardown] Failed to stop Kibana:', errorMessage);
    });
  }

  if (containers.elasticsearch !== undefined) {
    await containers.elasticsearch.stop().catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[E2E Global Teardown] Failed to stop Elasticsearch:', errorMessage);
    });
  }

  console.log('[E2E Global Teardown] All containers stopped');
}
