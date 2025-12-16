/**
 * TestContainers utilities for E2E tests
 * Manages Elasticsearch and Kibana containers for integration testing
 */

import { Client } from '@elastic/elasticsearch';
import {
  ElasticsearchContainer,
  type StartedElasticsearchContainer,
} from '@testcontainers/elasticsearch';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

/**
 * Container configuration for tests
 */
export interface ContainerConfig {
  /** Elasticsearch version (default: 9.2.2 for ARM64 support) */
  elasticsearchVersion?: string;
  /** Kibana version (default: 9.2.2 for ARM64 support) */
  kibanaVersion?: string;
  /** Elasticsearch heap size (default: 768m for ARM64, increased from 512m to reduce GC pressure) */
  heapSize?: string;
}

/**
 * NOTE: Kibana startup times can be very long (5-10 minutes) on:
 * - First run (image pull + initialization)
 * - ARM64/Apple Silicon (emulation overhead)
 * - Slower machines
 *
 * This is normal and expected. The wait strategy will retry until Kibana is ready.
 */

/**
 * Started Elasticsearch container with client
 */
export interface StartedElasticsearch {
  container: StartedElasticsearchContainer;
  client: Client;
  url: string; // Host-accessible URL (e.g., http://localhost:55012)
  containerUrl: string; // Container-accessible URL (e.g., http://172.17.0.2:9200)
}

/**
 * Started Kibana container
 */
export interface StartedKibana {
  container: StartedTestContainer;
  url: string;
}

/**
 * Start Elasticsearch container for testing
 * Note: Uses ephemeral host ports to avoid conflicts with running services
 * @param config - Container configuration
 * @returns Promise resolving to container and client
 */
export async function startElasticsearchContainer(
  config: ContainerConfig = {},
): Promise<StartedElasticsearch> {
  const version = config.elasticsearchVersion ?? '9.2.2'; // Using 9.2.2 for ARM64 support
  const heapSize = config.heapSize ?? '768m'; // Increased for ARM64 to reduce GC pressure

  console.log(`[TestContainers] Starting Elasticsearch ${version}...`);

  // TestContainers automatically maps container port 9200 to a random available host port
  // This avoids conflicts with any Elasticsearch running on localhost:9200
  const container = await new ElasticsearchContainer(
    `docker.elastic.co/elasticsearch/elasticsearch:${version}`,
  )
    .withEnvironment({
      'xpack.security.enabled': 'false', // Disable security for tests
      'discovery.type': 'single-node', // Single node cluster
      ES_JAVA_OPTS: `-Xms${heapSize} -Xmx${heapSize}`, // Set heap size
      'bootstrap.memory_lock': 'false', // Disable memory locking for tests
      'cluster.routing.allocation.disk.threshold_enabled': 'false', // Disable disk threshold
    })
    .withNetworkMode('bridge') // Use bridge network for container-to-container communication
    .withExposedPorts(9200) // Container port - mapped to random host port
    .withWaitStrategy(
      Wait.forHttp('/', 9200).forStatusCode(200).withStartupTimeout(120_000), // 2 minutes for startup
    )
    .withStartupTimeout(120_000) // 2 minutes for container startup
    .start();

  // Host-accessible URL (for our test client)
  const url = `http://${container.getHost()}:${container.getMappedPort(9200)}`;

  // Container-accessible URL (for Kibana to connect from another container)
  const containerIp = container.getIpAddress('bridge');
  const containerUrl = `http://${containerIp}:9200`;

  console.log(`[TestContainers] Elasticsearch ready at ${url}`);

  const client = new Client({
    node: url,
    requestTimeout: 30000, // 30 second timeout for requests
    maxRetries: 3,
    tls: {
      rejectUnauthorized: false,
    },
  });

  // Wait for cluster to be ready
  await client.cluster.health({ wait_for_status: 'yellow', timeout: '30s' });

  return { container, client, url, containerUrl };
}

/**
 * Start Kibana container for testing
 * Note: Uses ephemeral host ports to avoid conflicts with running services
 * @param elasticsearchContainerUrl - Container-accessible URL of Elasticsearch (e.g., http://172.17.0.2:9200)
 * @param config - Container configuration
 * @returns Promise resolving to container and URL
 */
export async function startKibanaContainer(
  elasticsearchContainerUrl: string,
  config: ContainerConfig = {},
): Promise<StartedKibana> {
  const version = config.kibanaVersion ?? '9.2.2'; // Using 9.2.2 for ARM64 support

  console.log(`[TestContainers] Starting Kibana ${version}...`);
  console.log('[TestContainers] Note: Might take a few minutes');

  // TestContainers automatically maps container port 5601 to a random available host port
  // This avoids conflicts with any Kibana running on localhost:5601
  const container = await new GenericContainer(`docker.elastic.co/kibana/kibana:${version}`)
    .withNetworkMode('bridge') // Use same network as Elasticsearch
    .withEnvironment({
      ELASTICSEARCH_HOSTS: elasticsearchContainerUrl, // Use container-accessible URL
      'xpack.security.enabled': 'false', // Disable security for tests
      SERVER_BASEPATH: '', // No base path
      SERVER_REWRITEBASEPATH: 'false',
      NODE_OPTIONS: '--max-old-space-size=768', // Increased for ARM64
      LOGGING_ROOT_LEVEL: 'warn', // Reduce logging for faster startup
    })
    .withExposedPorts(5601) // Container port - mapped to random host port
    .withWaitStrategy(
      Wait.forHttp('/api/status', 5601)
        .forStatusCode(200)
        .forResponsePredicate((response) => {
          try {
            const body = JSON.parse(response) as { status?: { overall?: { level?: string } } };
            const level = body?.status?.overall?.level;
            // Accept 'available' or 'degraded' - degraded is ok for tests
            return level === 'available' || level === 'degraded';
          } catch {
            return false;
          }
        })
        .withStartupTimeout(600_000), // 10 minutes for Kibana startup (was 3 minutes)
    )
    .withStartupTimeout(600_000) // 10 minutes for Kibana startup
    .start();

  // getMappedPort returns the ephemeral host port (e.g., 54322)
  const url = `http://${container.getHost()}:${container.getMappedPort(5601)}`;
  console.log(`[TestContainers] Kibana ready at ${url}`);

  return { container, url };
}

/**
 * Stop Elasticsearch container
 * @param elasticsearch - Started Elasticsearch container
 */
export async function stopElasticsearchContainer(
  elasticsearch: StartedElasticsearch | undefined,
): Promise<void> {
  if (!elasticsearch) {
    return;
  }

  try {
    // Close client and wait for all pending requests to complete
    await elasticsearch.client.close();
    // Give it a moment to fully close connections
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {
    // Ignore close errors
  }

  try {
    // Stop with timeout to prevent hanging
    await Promise.race([
      elasticsearch.container.stop(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Container stop timeout')), 30000),
      ),
    ]);
  } catch {
    // Force remove if stop fails
    try {
      await elasticsearch.container.stop({ remove: true, timeout: 5 });
    } catch {
      // Container may be orphaned - user should run docker container prune
    }
  }
}

/**
 * Stop Kibana container
 * @param kibana - Started Kibana container
 */
export async function stopKibanaContainer(kibana: StartedKibana | undefined): Promise<void> {
  if (!kibana) {
    return;
  }

  try {
    await kibana.container.stop();
  } catch {
    // Ignore stop errors
  }
}

/**
 * Stop all containers
 * @param elasticsearch - Started Elasticsearch container (optional)
 * @param kibana - Started Kibana container (optional)
 */
export async function stopAllContainers(
  elasticsearch?: StartedElasticsearch,
  kibana?: StartedKibana,
): Promise<void> {
  const promises: Promise<void>[] = [];

  if (kibana) {
    promises.push(stopKibanaContainer(kibana));
  }

  if (elasticsearch) {
    promises.push(stopElasticsearchContainer(elasticsearch));
  }

  await Promise.all(promises);
}
