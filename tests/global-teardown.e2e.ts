/**
 * Jest global teardown for E2E tests
 * Stops Docker containers after all tests
 */

/**
 * Stop all containers after test suite
 */
export default async function globalTeardown(): Promise<void> {
  console.log('[E2E Global Teardown] Stopping containers...');

  const containers = global.__E2E_CONTAINERS__;

  if (!containers) {
    console.log('[E2E Global Teardown] No containers to stop');
    return;
  }

  // Stop containers in reverse order (Kibana first, then Elasticsearch)
  if (containers.kibana) {
    await containers.kibana.stop().catch((error: Error) => {
      console.error('[E2E Global Teardown] Failed to stop Kibana:', error);
    });
  }

  if (containers.elasticsearch) {
    await containers.elasticsearch.stop().catch((error: Error) => {
      console.error('[E2E Global Teardown] Failed to stop Elasticsearch:', error);
    });
  }

  console.log('[E2E Global Teardown] All containers stopped');
}
